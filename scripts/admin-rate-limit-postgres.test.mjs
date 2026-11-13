import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

test("admin rate limiting is atomic across independent PostgreSQL sessions", {
  skip: !testDatabaseUrl,
  timeout: 20_000,
}, async () => {
  const { consumeAdminAttemptWithSql, clearAdminAttemptsWithSql } = await import("../src/lib/admin-rate-limit.server.ts");
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 24 });
  const sql = {
    query: async (text, params = []) => (await pool.query(text, params)).rows,
  };
  const key = `admin-rate-limit:${process.pid}:${randomUUID()}`;
  try {
    await pool.query(await readFile(new URL("../migrations/0106_admin_rate_limits.sql", import.meta.url), "utf8"));
    const results = await Promise.all(
      Array.from({ length: 64 }, () => consumeAdminAttemptWithSql(sql, key, 8)),
    );
    assert.equal(results.filter((result) => result.allowed).length, 8);
    assert.equal(results.filter((result) => !result.allowed).length, 56);
    assert.ok(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds > 0));
  } finally {
    await clearAdminAttemptsWithSql(sql, key).catch(() => {});
    await pool.end();
  }
});

test("admin rate limiter evaluates the rolling window after waiting for a PostgreSQL row lock", {
  skip: !testDatabaseUrl,
  timeout: 20_000,
}, async () => {
  const { consumeAdminAttemptWithSql, clearAdminAttemptsWithSql } = await import("../src/lib/admin-rate-limit.server.ts");
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
  const sql = {
    query: async (text, params = []) => (await pool.query(text, params)).rows,
  };
  const key = `admin-rate-limit-lock-wait:${process.pid}:${randomUUID()}`;
  const blocker = await pool.connect();
  try {
    await pool.query(await readFile(new URL("../migrations/0106_admin_rate_limits.sql", import.meta.url), "utf8"));
    await pool.query(
      "insert into admin_rate_limits(key,attempts) values($1,array_fill(clock_timestamp()-interval '9 minutes 500 milliseconds',array[8]))",
      [key],
    );
    await blocker.query("begin");
    await blocker.query("select key from admin_rate_limits where key=$1 for update", [key]);

    const pendingAttempt = consumeAdminAttemptWithSql(sql, key, 8);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await blocker.query("rollback");

    assert.deepEqual(await pendingAttempt, { allowed: true, remaining: 7, retryAfterSeconds: 0 });
  } finally {
    await blocker.query("rollback").catch(() => {});
    blocker.release();
    await clearAdminAttemptsWithSql(sql, key).catch(() => {});
    await pool.end();
  }
});
