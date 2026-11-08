import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { assignAdminLeadToConsultant } from "./admin-lead-assignment-action.ts";
import { updateAdminLeadWithActivity, type AdminLeadActivityMutation } from "./admin-lead-activity-action.ts";

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
