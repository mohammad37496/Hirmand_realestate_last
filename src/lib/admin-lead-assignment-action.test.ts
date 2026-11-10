import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { assignAdminLeadToConsultant } from "./admin-lead-assignment-action.ts";
import { saveAdminLeadMatchesWithActivity, updateAdminLeadWithActivity, type AdminLeadActivityMutation } from "./admin-lead-activity-action.ts";
import { autoMatchLead } from "./lead-smart-matcher.server.ts";
import { matchablePropertyVisibilitySql } from "./property-matchability.ts";

async function createFixture(options: { failActivity?: boolean } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (id text primary key, consultant text, updated_at timestamptz not null default current_timestamp);
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id) on delete cascade,
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    );
    insert into leads(id, consultant) values ('lead-1', null);
    ${options.failActivity ? `create function reject_lead_activity() returns trigger language plpgsql as $$ begin raise exception 'activity storage unavailable'; end $$;
      create trigger reject_lead_activity before insert on lead_activities for each row execute function reject_lead_activity();` : ""}
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;
  return { pg, sql };
}

test("lead assignment records the consultant change in the CRM timeline", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(await assignAdminLeadToConsultant(sql, "lead-1", "مشاور فعال"), { kind: "assigned" });
    assert.deepEqual(await sql.query("select consultant from leads where id='lead-1'"), [{ consultant: "مشاور فعال" }]);
    const activities = await sql.query<{ activity_type: string; title: string; note: string; metadata: { consultant: string; source: string } }>(
      "select activity_type,title,note,metadata from lead_activities where lead_id='lead-1'",
    );
    assert.equal(activities.length, 1);
    assert.equal(activities[0]?.activity_type, "status");
    assert.equal(activities[0]?.title, "تخصیص مشاور");
    assert.equal(activities[0]?.note, "مشاور «مشاور فعال» برای این لید ثبت شد.");
    assert.equal(activities[0]?.metadata.consultant, "مشاور فعال");
    assert.equal(activities[0]?.metadata.source, "assignment_balancer");
  } finally {
    await pg.close();
  }
});

test("a failed activity insert rolls back the consultant assignment", async () => {
  const { pg, sql } = await createFixture({ failActivity: true });
  try {
    await assert.rejects(assignAdminLeadToConsultant(sql, "lead-1", "مشاور فعال"), /activity storage unavailable/);
    assert.deepEqual(await sql.query("select consultant from leads where id='lead-1'"), [{ consultant: null }]);
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("a missing lead is not assigned and creates no timeline entry", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(await assignAdminLeadToConsultant(sql, "missing", "مشاور فعال"), { kind: "not_found" });
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("assignment fails closed when transaction support is unavailable", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(assignAdminLeadToConsultant(sql, "lead-1", "مشاور فعال"), /transaction support is required/);
});

async function createLeadMutationFixture(options: { failActivity?: boolean } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,
      consultant text,
      status text not null default 'new',
      follow_up_at timestamptz,
      last_contacted_at timestamptz,
      visit_status text not null default 'none',
      note text,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id) on delete cascade,
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    );
    insert into leads(id, status, visit_status, note) values ('lead-1', 'new', 'none', 'یادداشت قبلی');
    ${options.failActivity ? `create function reject_lead_activity() returns trigger language plpgsql as $$ begin raise exception 'activity storage unavailable'; end $$;
      create trigger reject_lead_activity before insert on lead_activities for each row execute function reject_lead_activity();` : ""}
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;
  return { pg, sql };
}

const leadMutations: AdminLeadActivityMutation[] = [
  { kind: "status", leadId: "lead-1", status: "contacted", followUpAt: "2026-11-10T10:00:00.000Z" },
  { kind: "visit_status", leadId: "lead-1", visitStatus: "confirmed" },
  { kind: "note", leadId: "lead-1", note: "یادداشت جدید" },
  { kind: "follow_up", leadId: "lead-1", followUpAt: "2026-11-11T10:00:00.000Z" },
];

for (const mutation of leadMutations) {
  test(`lead ${mutation.kind} update records its CRM activity`, async () => {
    const { pg, sql } = await createLeadMutationFixture();
    try {
      const result = await updateAdminLeadWithActivity(sql, mutation);
      assert.equal(result.kind, "updated");
      const rows = await sql.query("select status,visit_status,note,follow_up_at from leads where id='lead-1'");
      const activities = await sql.query<{ activity_type: string; metadata: Record<string, unknown> }>(
        "select activity_type,metadata from lead_activities where lead_id='lead-1'",
      );
      assert.equal(activities.length, 1);
      assert.equal(activities[0]?.activity_type, mutation.kind === "visit_status" ? "visit" : mutation.kind);
      if (mutation.kind === "status") {
        assert.equal(rows[0]?.status, "contacted");
        assert.ok(rows[0]?.follow_up_at);
        assert.ok(activities[0]?.metadata.status === "contacted");
      } else if (mutation.kind === "visit_status") {
        assert.equal(rows[0]?.visit_status, "confirmed");
        assert.equal(activities[0]?.metadata.visitStatus, "confirmed");
      } else if (mutation.kind === "note") {
        assert.equal(rows[0]?.note, "یادداشت جدید");
      } else {
        assert.ok(rows[0]?.follow_up_at);
        assert.equal(activities[0]?.metadata.followUpAt, mutation.followUpAt);
      }
    } finally {
      await pg.close();
    }
  });

  test(`lead ${mutation.kind} update rolls back when its CRM activity cannot be stored`, async () => {
    const { pg, sql } = await createLeadMutationFixture({ failActivity: true });
    try {
      await assert.rejects(updateAdminLeadWithActivity(sql, mutation), /activity storage unavailable/);
      const rows = await sql.query("select status,visit_status,note,follow_up_at,last_contacted_at from leads where id='lead-1'");
      assert.deepEqual(rows, [{
        status: "new",
        visit_status: "none",
        note: "یادداشت قبلی",
        follow_up_at: null,
        last_contacted_at: null,
      }]);
      assert.deepEqual(await sql.query("select id from lead_activities"), []);
    } finally {
      await pg.close();
    }
  });
}

test("lead activity mutation returns not_found without inserting an event", async () => {
  const { pg, sql } = await createLeadMutationFixture();
  try {
    assert.deepEqual(await updateAdminLeadWithActivity(sql, { kind: "status", leadId: "missing", status: "closed", followUpAt: null }), { kind: "not_found" });
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("lead activity mutations fail closed when transaction support is unavailable", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(
    updateAdminLeadWithActivity(sql, { kind: "status", leadId: "lead-1", status: "closed", followUpAt: null }),
    /transaction support is required/,
  );
});

async function createLeadMatchFixture(options: { failActivity?: boolean } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,
      matched_properties jsonb not null default '[]'::jsonb,
      match_count integer not null default 0,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id),
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb
    );
    insert into leads(id,matched_properties,match_count) values ('lead-1','[{"id":"old"}]'::jsonb,1);
    ${options.failActivity ? `create function reject_match_activity() returns trigger language plpgsql as $$ begin raise exception 'activity storage unavailable'; end $$;
      create trigger reject_match_activity before insert on lead_activities for each row execute function reject_match_activity();` : ""}
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;
  return { pg, sql };
}

test("lead match snapshot and CRM activity are saved together", async () => {
  const { pg, sql } = await createLeadMatchFixture();
  try {
    assert.deepEqual(await saveAdminLeadMatchesWithActivity(sql, {
      leadId: "lead-1",
      matches: [{ id: "property-1", score: 91 }],
      count: 1,
      mode: "smart",
      modeLabel: "تطبیق هوشمند",
    }), { kind: "updated" });
    assert.deepEqual(await sql.query("select matched_properties,match_count from leads where id='lead-1'"), [
      { matched_properties: [{ id: "property-1", score: 91 }], match_count: 1 },
    ]);
    assert.deepEqual(await sql.query("select activity_type,metadata from lead_activities where lead_id='lead-1'"), [
      { activity_type: "match", metadata: { mode: "smart", count: 1 } },
    ]);
  } finally {
    await pg.close();
  }
});

test("lead match snapshot rolls back when its CRM activity cannot be stored", async () => {
  const { pg, sql } = await createLeadMatchFixture({ failActivity: true });
  try {
    await assert.rejects(saveAdminLeadMatchesWithActivity(sql, {
      leadId: "lead-1",
      matches: [{ id: "property-2", score: 88 }],
      count: 1,
      mode: "price",
      modeLabel: "قیمت حدودی",
    }), /activity storage unavailable/);
    assert.deepEqual(await sql.query("select matched_properties,match_count from leads where id='lead-1'"), [
      { matched_properties: [{ id: "old" }], match_count: 1 },
    ]);
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("lead match save returns not_found without inserting an activity", async () => {
  const { pg, sql } = await createLeadMatchFixture();
  try {
    assert.deepEqual(await saveAdminLeadMatchesWithActivity(sql, {
      leadId: "missing",
      matches: [],
      count: 0,
      mode: "smart",
      modeLabel: "تطبیق هوشمند",
    }), { kind: "not_found" });
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("lead match save fails closed without transaction support", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(saveAdminLeadMatchesWithActivity(sql, {
    leadId: "lead-1",
    matches: [],
    count: 0,
    mode: "smart",
    modeLabel: "تطبیق هوشمند",
  }), /transaction support is required/);
});

test("automatic lead matching uses the transactional snapshot-and-timeline writer", async () => {
  const calls: string[] = [];
  const lead = {
    id: "lead-1",
    deal: "خرید",
    property_type: "apartment",
    neighborhood: "",
    floor_preference: null,
    requested_bedrooms: null,
    requested_amenities: [],
    budget_deposit: null,
    budget_rent: null,
    budget_purchase: 1_000_000_000,
    budget_sale: null,
    budget_deposit_min: null,
    budget_deposit_max: null,
    budget_rent_min: null,
    budget_rent_max: null,
    budget_purchase_min: null,
    budget_purchase_max: null,
    budget_sale_min: null,
    budget_sale_max: null,
  };
  const sql = {
    query: async <T = Record<string, unknown>>(text: string) => {
      calls.push(text);
      if (text.includes("from leads")) return [lead] as T[];
      if (text.includes("from lead_activities")) return [] as T[];
      if (text.includes("from properties")) return [] as T[];
      throw new Error("unexpected non-transaction query");
    },
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) => callback({
      query: async <R = Record<string, unknown>>(text: string) => {
        calls.push(text);
        if (text.startsWith("update leads")) return [{ id: "lead-1" }] as R[];
        if (text.startsWith("insert into lead_activities")) throw new Error("activity storage unavailable");
        throw new Error("unexpected transaction query");
      },
    } as Sql),
  } as Sql;

  await assert.rejects(autoMatchLead(sql, "lead-1"), /activity storage unavailable/);
  assert.ok(calls.some((query) => query.startsWith("update leads")), "the match snapshot write must be attempted");
  assert.ok(calls.some((query) => query.startsWith("insert into lead_activities")), "the CRM timeline write must be attempted");
});

test("automatic lead matching preserves the previous snapshot when timeline storage fails", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,
      deal text not null,
      property_type text,
      neighborhood text,
      floor_preference text,
      requested_bedrooms integer,
      requested_amenities jsonb not null default '[]'::jsonb,
      budget_deposit numeric,
      budget_rent numeric,
      budget_purchase numeric,
      budget_sale numeric,
      budget_deposit_min numeric,
      budget_deposit_max numeric,
      budget_rent_min numeric,
      budget_rent_max numeric,
      budget_purchase_min numeric,
      budget_purchase_max numeric,
      budget_sale_min numeric,
      budget_sale_max numeric,
      matched_properties jsonb not null default '[]'::jsonb,
      match_count integer not null default 0,
      updated_at timestamptz not null default current_timestamp
    );
    create table properties (
      id text primary key,
      slug text,
      title text,
      transaction_type text,
      property_type text,
      neighborhood text,
      area_m2 integer,
      bedrooms integer,
      bathrooms integer,
      floor integer,
      floor_label text,
      total_floors integer,
      built_year integer,
      parking boolean,
      elevator boolean,
      storage boolean,
      painted boolean,
      wallpaper boolean,
      convertible boolean,
      cabinet_type text,
      flooring_type text,
      cooling_system text,
      heating_system text,
      wall_closet_type text,
      other_amenities jsonb not null default '[]'::jsonb,
      price numeric,
      deposit numeric,
      rent numeric,
      published_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz,
      price_drop_percent numeric,
      featured boolean not null default false,
      featured_until timestamptz,
      status text not null default 'published',
      publish_at timestamptz,
      unpublish_at timestamptz,
      deleted_at timestamptz,
      availability_status text not null default 'available'
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id),
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    );
    insert into leads(id, deal, property_type, budget_purchase, matched_properties, match_count)
      values ('lead-1', 'خرید', 'apartment', 1000000000, '[{"id":"previous-match"}]'::jsonb, 1);
    insert into properties(id, slug, title, transaction_type, property_type, area_m2, price)
      values ('property-1', 'property-1', 'فایل آزمایشی', 'sell', 'apartment', 100, 1000000000);
    create function reject_auto_match_activity() returns trigger language plpgsql as $$
      begin raise exception 'activity storage unavailable'; end
    $$;
    create trigger reject_auto_match_activity before insert on lead_activities
      for each row execute function reject_auto_match_activity();
  `);

  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;

  try {
    await assert.rejects(autoMatchLead(sql, "lead-1"), /activity storage unavailable/);
    assert.deepEqual(await sql.query("select matched_properties,match_count from leads where id='lead-1'"), [
      { matched_properties: [{ id: "previous-match" }], match_count: 1 },
    ]);
    assert.deepEqual(await sql.query("select id from lead_activities"), []);

    await pg.exec("delete from properties");
    await assert.rejects(autoMatchLead(sql, "lead-1"), /activity storage unavailable/);
    assert.deepEqual(await sql.query("select matched_properties,match_count from leads where id='lead-1'"), [
      { matched_properties: [{ id: "previous-match" }], match_count: 1 },
    ]);
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
  } finally {
    await pg.close();
  }
});

test("CRM matching only recommends publicly visible, currently available properties", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key,
        status text not null,
        publish_at timestamptz,
        unpublish_at timestamptz,
        deleted_at timestamptz,
        availability_status text
      );
      insert into properties (id, status, availability_status) values
        ('published-available', 'published', 'available'),
        ('legacy-null-availability', 'published', null),
        ('sold', 'published', 'sold'),
        ('reserved', 'published', 'reserved'),
        ('rented', 'published', 'rented'),
        ('unavailable-other', 'published', 'under_offer');
      insert into properties (id, status, deleted_at, availability_status)
        values ('soft-deleted', 'published', current_timestamp, 'available');
      insert into properties (id, status, unpublish_at, availability_status)
        values ('expired', 'published', current_timestamp - interval '1 second', 'available');
      insert into properties (id, status, publish_at, availability_status)
        values
          ('scheduled-future', 'draft', current_timestamp + interval '1 day', 'available'),
          ('scheduled-due', 'draft', current_timestamp - interval '1 second', 'available');
    `);

    const result = await pg.query(
      `select id from properties where ${matchablePropertyVisibilitySql()} order by id`,
    );
    assert.deepEqual(result.rows.map((row) => String((row as { id: string }).id)), [
      "legacy-null-availability",
      "published-available",
      "scheduled-due",
    ]);

    const aliased = await pg.query(
      `select p.id from properties p where ${matchablePropertyVisibilitySql("p")} order by p.id`,
    );
    assert.deepEqual(aliased.rows.map((row) => String((row as { id: string }).id)), [
      "legacy-null-availability",
      "published-available",
      "scheduled-due",
    ]);
  } finally {
    await pg.close();
  }
});

test("automatic and manual CRM matchers share the canonical matchability predicate", () => {
  const automatic = readFileSync(new URL("./lead-smart-matcher.server.ts", import.meta.url), "utf8");
  const manual = readFileSync(new URL("../../server/routes/api/admin-match.post.ts", import.meta.url), "utf8");
  assert.match(automatic, /where \$\{matchablePropertyVisibilitySql\(\)\}/);
  assert.match(manual, /where \$\{matchablePropertyVisibilitySql\(\)\}/);
  assert.match(automatic, /from "\.\/property-matchability\.ts"/);
  assert.match(manual, /from "@\/lib\/property-matchability"/);
});
