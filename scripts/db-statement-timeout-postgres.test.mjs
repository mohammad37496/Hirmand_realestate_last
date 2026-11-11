import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

test("PostgreSQL statement_timeout cancels pool and transaction queries server-side", {
  skip: !testDatabaseUrl,
  timeout: 15_000,
}, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DB_QUERY_TIMEOUT_MS = "1000";

  // Import only after setting the isolated test database and short timeout so
  // the module-level pool is created with these values.
  const { getSql } = await import("../src/lib/db.ts");
  const sql = await getSql();

  const settings = await sql.query(
    "select current_setting('statement_timeout') as statement_timeout",
  );
  assert.equal(settings[0]?.statement_timeout, "750ms");

  const poolStartedAt = Date.now();
  await assert.rejects(
    sql.query("select pg_sleep(2)"),
    (error) => Boolean(error && typeof error === "object" && error.code === "57014"),
  );
  assert.ok(Date.now() - poolStartedAt < 1_800, "pool query should be cancelled before the client watchdog");

  const activePoolQueries = await sql.query(
    `select count(*)::int as active
       from pg_stat_activity
      where application_name = 'hirmand-real-estate'
        and state = 'active'
        and query like 'select pg_sleep%'`,
  );
  assert.equal(Number(activePoolQueries[0]?.active ?? -1), 0, "timed-out pool query must no longer run on PostgreSQL");

  const transactionStartedAt = Date.now();
  await assert.rejects(
    sql.transaction(async (transactionSql) => {
      await transactionSql.query("select pg_sleep(2)");
    }),
    (error) => Boolean(error && typeof error === "object" && error.code === "57014"),
  );
  assert.ok(Date.now() - transactionStartedAt < 1_800, "transaction query should be cancelled before the client watchdog");

  const activeTransactionQueries = await sql.query(
    `select count(*)::int as active
       from pg_stat_activity
      where application_name = 'hirmand-real-estate'
        and state = 'active'
        and query like 'select pg_sleep%'`,
  );
  assert.equal(Number(activeTransactionQueries[0]?.active ?? -1), 0, "timed-out transaction query must no longer run on PostgreSQL");

  const recovery = await sql.query("select 1::int as value");
  assert.equal(recovery[0]?.value, 1, "pool must remain usable after server-side cancellation and rollback");
});
