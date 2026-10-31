import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { createPgliteTransactionRunner, createPostgresTransactionRunner } from "./db.ts";

test("PGlite transaction runner commits and rolls back the callback as one unit", async () => {
  const pg = new PGlite({ fs: new MemoryFS() });
  await pg.waitReady;
  await pg.exec("create table transaction_probe (value text not null)");
  const transaction = createPgliteTransactionRunner(pg);

  await transaction(async (sql) => {
    await sql.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", ["customer-submission:transaction-probe"]);
    await sql.query("insert into transaction_probe(value) values ($1)", ["committed"]);
  });
  const afterCommit = await pg.query<{ count: number }>("select count(*)::int as count from transaction_probe");
  assert.equal(afterCommit.rows[0]?.count, 1);

  await assert.rejects(
    transaction(async (sql) => {
      await sql.query("insert into transaction_probe(value) values ($1)", ["rolled-back"]);
      throw new Error("rollback probe");
    }),
    /rollback probe/,
  );
  const afterRollback = await pg.query<{ value: string }>("select value from transaction_probe order by value");
  assert.deepEqual(afterRollback.rows.map((row) => row.value), ["committed"]);
  await pg.close();
});

test("PostgreSQL transaction runner issues BEGIN/COMMIT and rolls back on callback failure", async () => {
  const calls: string[] = [];
  let releases = 0;
  const pool = {
    connect: async () => ({
      query: async (text: string) => {
        calls.push(text);
        return { rows: text === "select 1" ? [{ value: 1 }] : [] };
      },
      release: () => { releases += 1; },
    }),
  } as unknown as Parameters<typeof createPostgresTransactionRunner>[0];
  const transaction = createPostgresTransactionRunner(pool);

  const result = await transaction(async (sql) => {
    const rows = await sql.query<{ value: number }>("select 1");
    return rows[0]?.value;
  });
  assert.equal(result, 1);
  assert.deepEqual(calls, ["BEGIN", "select 1", "COMMIT"]);
  assert.equal(releases, 1);

  calls.length = 0;
  await assert.rejects(
    transaction(async (sql) => {
      await sql.query("insert into transaction_probe(value) values ($1)", ["failed"]);
      throw new Error("postgres rollback probe");
    }),
    /postgres rollback probe/,
  );
  assert.deepEqual(calls, ["BEGIN", "insert into transaction_probe(value) values ($1)", "ROLLBACK"]);
  assert.equal(releases, 2);
});
