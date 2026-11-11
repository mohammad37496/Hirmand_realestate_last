import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import type { Sql } from "./db.ts";
import { createPublicLeadIntake } from "./public-lead-intake.ts";
import { withPublicLeadPhoneDedupeLock } from "./public-lead-phone-dedupe.ts";

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
      budget_amount integer,
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

test("public lead route acquires the phone lock before checking the ten-minute dedupe window", async () => {
  const route = await readFile(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  const lock = route.indexOf("withPublicLeadPhoneDedupeLock(databaseSql, parsed.data.phone");
  const lookup = route.indexOf("const existing = await sql.query");
  const create = route.indexOf("const createdLeadId = await createPublicLeadIntake(sql");
  assert.ok(lock >= 0, "route must use the transaction-scoped phone lock");
  assert.ok(lookup > lock, "the ten-minute dedupe lookup must run after acquiring the phone lock");
  assert.ok(create > lookup, "lead creation must remain inside the locked callback");
  assert.match(route, /import \{ withPublicLeadPhoneDedupeLock \} from "@\/lib\/public-lead-phone-dedupe"/);
});
