import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import type { Sql } from "./db.ts";
import { createPublicLeadIntake } from "./public-lead-intake.ts";
import { findRecentPropertyRequestLead, findRecentPublicCallbackLead, withPublicLeadPhoneDedupeLock } from "./public-lead-phone-dedupe.ts";

function createSql(pg: PGlite) {
  let transactionCount = 0;
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) => {
      transactionCount += 1;
      return pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query<R>(text, params)).rows,
      } as Sql));
    },
  } as Sql;
  return { sql, getTransactionCount: () => transactionCount };
}

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,
      phone text not null,
      property_id text,
      deal text,
      budget_amount integer,
      callback_preferred_at timestamptz,
      public_tracking_token text,
      created_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id),
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null
    );
    create table admin_tasks (
      id text primary key,
      title text not null,
      description text not null,
      status text not null,
      priority text not null,
      due_at timestamptz not null,
      assignee text not null,
      entity_type text not null,
      entity_id text not null references leads(id)
    );
  `);
  return { pg, ...createSql(pg) };
}

const activity = {
  activityType: "follow_up" as const,
  title: "Public lead created",
  note: "Initial follow-up",
  metadata: { source: "website" },
};
const followUp = {
  title: "Call public lead",
  description: "Initial contact",
  priority: "normal" as const,
  dueMinutes: 60,
};

test("concurrent same-phone submissions create one lead and one CRM timeline/task", async () => {
  const { pg, sql, getTransactionCount } = await createFixture();
  try {
    const submit = (id: string) => withPublicLeadPhoneDedupeLock(sql, "09123456789", async (lockedSql) => {
      const existing = await lockedSql.query<{ id: string }>(
        "select id from leads where phone=$1 and created_at > current_timestamp - interval '10 minutes' limit 1",
        ["09123456789"],
      );
      if (existing[0]) return { kind: "duplicate", id: existing[0].id } as const;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const leadId = await createPublicLeadIntake(
        lockedSql,
        async (transactionSql) => {
          await transactionSql.query("insert into leads(id,phone) values($1,$2)", [id, "09123456789"]);
          return id;
        },
        activity,
        followUp,
      );
      return { kind: "created", id: leadId } as const;
    });

    const results = await Promise.all([submit("lead-a"), submit("lead-b")]);
    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate").length, 1);
    assert.equal((await sql.query("select id from leads")).length, 1);
    assert.equal((await sql.query("select id from lead_activities")).length, 1);
    assert.equal((await sql.query("select id from admin_tasks")).length, 1);
    assert.equal(getTransactionCount(), 2);
  } finally {
    await pg.close();
  }
});

test("budget-match duplicate updates the existing lead while holding the same phone lock", async () => {
  const { pg, sql } = await createFixture();
  try {
    await withPublicLeadPhoneDedupeLock(sql, "09123456789", async (lockedSql) => {
      await lockedSql.query("insert into leads(id,phone) values('lead-existing','09123456789')");
    });

    const result = await withPublicLeadPhoneDedupeLock(sql, "09123456789", async (lockedSql) => {
      const existing = await lockedSql.query<{ id: string }>(
        "select id from leads where phone=$1 and created_at > current_timestamp - interval '10 minutes' limit 1",
        ["09123456789"],
      );
      if (!existing[0]) return "created";
      await lockedSql.query("update leads set budget_amount=$2 where id=$1", [existing[0].id, 250]);
      return "duplicate_updated";
    });

    assert.equal(result, "duplicate_updated");
    assert.deepEqual(await sql.query("select id,budget_amount from leads"), [
      { id: "lead-existing", budget_amount: 250 },
    ]);
  } finally {
    await pg.close();
  }
});

test("callback retries reuse only the same recent phone and scheduled time", async () => {
  const { pg, sql } = await createFixture();
  try {
    const phone = "09123456789";
    const callbackAt = new Date("2026-11-12T10:00:00.000Z");
    const submit = (id: string, at: Date) => withPublicLeadPhoneDedupeLock(sql, phone, async (lockedSql) => {
      const existing = await findRecentPublicCallbackLead(lockedSql, phone, at);
      if (existing) return { kind: "duplicate", id: existing.id, trackingToken: existing.public_tracking_token } as const;
      await lockedSql.query(
        "insert into leads(id,phone,callback_preferred_at,public_tracking_token) values($1,$2,$3,$4)",
        [id, phone, at.toISOString(), "token-" + id],
      );
      return { kind: "created", id, trackingToken: "token-" + id } as const;
    });

    const first = await submit("callback-first", callbackAt);
    const replay = await submit("callback-retry", callbackAt);
    assert.deepEqual(first, { kind: "created", id: "callback-first", trackingToken: "token-callback-first" });
    assert.deepEqual(replay, { kind: "duplicate", id: "callback-first", trackingToken: first.trackingToken });
    assert.deepEqual(
      await submit("callback-different-time", new Date(callbackAt.getTime() + 30 * 60_000)),
      { kind: "created", id: "callback-different-time", trackingToken: "token-callback-different-time" },
    );

    await sql.query("update leads set created_at=current_timestamp - interval '11 minutes' where id='callback-first'");
    assert.deepEqual(await submit("callback-after-window", callbackAt), {
      kind: "created",
      id: "callback-after-window",
      trackingToken: "token-callback-after-window",
    });
    assert.equal((await sql.query("select id from leads")).length, 3);
  } finally {
    await pg.close();
  }
});

test("property request retries reuse the matching property, phone, deal and tracking token", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query(
      "insert into leads(id,phone,property_id,deal,public_tracking_token) values($1,$2,$3,$4,$5)",
      ["request-1", "09123456789", "property-1", "درخواست مدارک", "TRACK-ORIGINAL"],
    );
    assert.deepEqual(
      await findRecentPropertyRequestLead(sql, "property-1", "09123456789", "درخواست مدارک"),
      { id: "request-1", public_tracking_token: "TRACK-ORIGINAL" },
    );
    assert.equal(await findRecentPropertyRequestLead(sql, "property-2", "09123456789", "درخواست مدارک"), null);
    assert.equal(await findRecentPropertyRequestLead(sql, "property-1", "09123456789", "درخواست تأمین مالی"), null);
  } finally {
    await pg.close();
  }
});

test("property request retry window uses wall-clock time after waiting for the phone lock", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query(
      "insert into leads(id,phone,property_id,deal,public_tracking_token,created_at) values($1,$2,$3,$4,$5,clock_timestamp() - interval '10 minutes' - interval '1 second')",
      ["request-old", "09123456789", "property-1", "درخواست مدارک", "TRACK-OLD"],
    );
    assert.equal(await findRecentPropertyRequestLead(sql, "property-1", "09123456789", "درخواست مدارک"), null);
  } finally {
    await pg.close();
  }
});

test("property request retry cutoff advances while its phone-lock transaction is waiting", async () => {
  const { pg, sql } = await createFixture();
  try {
    const result = await withPublicLeadPhoneDedupeLock(sql, "09123456789", async (lockedSql) => {
      await lockedSql.query(
        "insert into leads(id,phone,property_id,deal,public_tracking_token,created_at) values($1,$2,$3,$4,$5,clock_timestamp() - interval '10 minutes' + interval '1 second')",
        ["request-at-boundary", "09123456789", "property-1", "درخواست مدارک", "TRACK-BOUNDARY"],
      );
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return findRecentPropertyRequestLead(lockedSql, "property-1", "09123456789", "درخواست مدارک");
    });
    assert.equal(result, null);
  } finally {
    await pg.close();
  }
});

test("concurrent retries of one property request create only one lead", async () => {
  const { pg, sql } = await createFixture();
  try {
    const submit = (id: string) => withPublicLeadPhoneDedupeLock(sql, "09123456789", async (lockedSql) => {
      const duplicate = await findRecentPropertyRequestLead(lockedSql, "property-1", "09123456789", "درخواست کارشناسی فنی");
      if (duplicate) return { kind: "duplicate", id: duplicate.id } as const;
      await new Promise((resolve) => setTimeout(resolve, 10));
      await lockedSql.query(
        "insert into leads(id,phone,property_id,deal,public_tracking_token) values($1,$2,$3,$4,$5)",
        [id, "09123456789", "property-1", "درخواست کارشناسی فنی", "TRACK-" + id],
      );
      return { kind: "created", id } as const;
    });

    const results = await Promise.all([submit("request-a"), submit("request-b")]);
    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate").length, 1);
    assert.equal((await sql.query("select id from leads where property_id='property-1'")).length, 1);
  } finally {
    await pg.close();
  }
});

test("public lead route acquires the phone lock before checking the ten-minute dedupe window", async () => {
  const route = await readFile(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  const lock = route.indexOf("withPublicLeadPhoneDedupeLock(databaseSql, parsed.data.phone");
  const lookup = route.indexOf("const existing = await sql.query");
  const callbackLookup = route.indexOf("findRecentPublicCallbackLead(sql, parsed.data.phone, callbackDate)");
  const callbackCreate = route.indexOf("const leadId = await createPublicLeadIntake(sql", callbackLookup);
  const create = route.indexOf("const createdLeadId = await createPublicLeadIntake(sql");
  assert.ok(lock >= 0, "route must use the transaction-scoped phone lock");
  assert.ok(lookup > lock, "the ten-minute dedupe lookup must run after acquiring the phone lock");
  assert.ok(create > lookup, "lead creation must remain inside the locked callback");
  assert.ok(callbackLookup > lock, "callback replay lookup must run while holding the phone lock");
  assert.ok(callbackCreate > callbackLookup, "callback creation must follow its replay lookup");
  assert.match(route, /import \{[^}]*withPublicLeadPhoneDedupeLock[^}]*\} from "@\/lib\/public-lead-phone-dedupe"/);
});
