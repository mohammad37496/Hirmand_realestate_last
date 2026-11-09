import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadCustomerSubmissionQueueStats } from "./customer-submission-queue-stats.ts";
import type { Sql } from "./db.ts";

const team = [
  { name: "Consultant A", phone: "09120000001" },
  { name: "Consultant B", phone: "09120000002" },
];

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table customer_property_submissions (
      id text primary key,
      status text not null,
      priority text not null default 'normal',
      assigned_consultant_phone text,
      created_at timestamptz not null,
      queue_started_at timestamptz
    );
    insert into customer_property_submissions values
      ('old-high','pending','high','09120000001',current_timestamp - interval '30 hours',null),
      ('new-unassigned','pending','normal',null,current_timestamp - interval '2 hours',null),
      ('done','approved','high','09120000002',current_timestamp - interval '40 hours',null);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  return { pg, sql };
}

test("queue stats return real SLA and consultant workload values", async () => {
  const { pg, sql } = await createFixture();
  try {
    const stats = await loadCustomerSubmissionQueueStats(sql, team);
    assert.equal(stats.overdue, 1);
    assert.equal(stats.highPriority, 1);
    assert.equal(stats.unassigned, 1);
    assert.ok(Number.isFinite(stats.averageAgeHours) && stats.averageAgeHours >= 0);
    assert.deepEqual(stats.consultants, [
      { name: "Consultant A", phone: "09120000001", count: 1 },
      { name: "Consultant B", phone: "09120000002", count: 0 },
    ]);
  } finally {
    await pg.close();
  }
});

for (const failingQuery of ["group by assigned_consultant_phone", "as average_age_hours"]) {
  test(`queue stats propagate ${failingQuery} database failures`, async () => {
    const { pg, sql } = await createFixture();
    const injected = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
        if (text.includes(failingQuery)) throw new Error("queue metrics database unavailable");
        return sql.query<T>(text, params);
      },
    } as Sql;
    try {
      await assert.rejects(loadCustomerSubmissionQueueStats(injected, team), /queue metrics database unavailable/);
    } finally {
      await pg.close();
    }
  });
}
