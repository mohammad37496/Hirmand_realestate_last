import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { createOverdueLeadTasks } from "./admin-overdue-lead-tasks.ts";

function sqlFor(pg: PGlite): Sql {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query<R>(text, params)).rows,
      } as unknown as Sql)),
  } as unknown as Sql;
}

async function createSchema(pg: PGlite) {
  await pg.exec(`
    create table leads (
      id text primary key, name text, deal text, neighborhood text,
      status text not null, follow_up_at timestamptz
    );
    create table admin_tasks (
      id text primary key, title text not null, description text not null,
      status text not null, priority text not null, due_at timestamptz,
      assignee text not null, entity_type text not null, entity_id text
    );
    insert into leads(id,name,deal,neighborhood,status,follow_up_at) values
      ('lead-1','مشتری یک','خرید','جردن','follow_up',current_timestamp - interval '1 day'),
      ('lead-2','مشتری دو','اجاره','سعادت‌آباد','contacted',current_timestamp - interval '2 hours');
  `);
}

test("concurrent overdue-task generation creates at most one open task per lead", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    const sql = sqlFor(pg);
    const results = await Promise.all([
      createOverdueLeadTasks(sql),
      createOverdueLeadTasks(sql),
      createOverdueLeadTasks(sql),
    ]);
    assert.equal(results.reduce((sum, count) => sum + count, 0), 2);
    const rows = await pg.query<{ entity_id: string; count: number }>(
      "select entity_id,count(*)::int as count from admin_tasks where entity_type='lead' and status='open' group by entity_id order by entity_id",
    );
    assert.deepEqual(rows.rows, [
      { entity_id: "lead-1", count: 1 },
      { entity_id: "lead-2", count: 1 },
    ]);
  } finally {
    await pg.close();
  }
});

test("a failed existence query rejects instead of pretending there is no open task", async () => {
  let insertCount = 0;
  const fakeSql = {
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) => callback({
      query: async <R = Record<string, unknown>>(text: string) => {
        if (text.includes("from leads")) return [{ id: "lead-1", name: "مشتری", deal: "خرید", neighborhood: null }] as R[];
        if (text.includes("pg_advisory_xact_lock")) return [] as R[];
        if (text.includes("select id from admin_tasks")) throw new Error("admin task lookup unavailable");
        if (text.includes("insert into admin_tasks")) insertCount += 1;
        return [{ id: "task-1" }] as R[];
      },
    } as unknown as Sql),
  } as unknown as Sql;

  await assert.rejects(createOverdueLeadTasks(fakeSql), /admin task lookup unavailable/);
  assert.equal(insertCount, 0);
});

test("requires transaction support before reading or creating tasks", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(createOverdueLeadTasks(sql), /transaction support is required/);
});
