import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import { dbSource, type Sql } from "./db.ts";
import {
  clearAdminAttemptsWithSql,
  clientFingerprint,
  clearAdminAttempts,
  consumeAdminAttempt,
  consumeAdminAttemptWithSql,
  resolveClientIp,
} from "./admin-rate-limit.server.ts";

async function createSql() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../../migrations/0106_admin_rate_limits.sql", import.meta.url), "utf8"));
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  } as Sql;
  return { pg, sql };
}

test("PostgreSQL admin limiter atomically enforces the shared attempt budget", async () => {
  const { pg, sql } = await createSql();
  try {
    const results = await Promise.all(
      Array.from({ length: 48 }, () => consumeAdminAttemptWithSql(sql, "concurrent-test", 8)),
    );
    assert.equal(results.filter((result) => result.allowed).length, 8);
    assert.equal(results.filter((result) => !result.allowed).length, 40);
    assert.ok(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds > 0));
  } finally {
    await pg.close();
  }
});

test("PostgreSQL admin limiter preserves block duration and resets the bucket after expiry", async () => {
  const { pg, sql } = await createSql();
  try {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const result = await consumeAdminAttemptWithSql(sql, "block-expiry", 8);
      assert.equal(result.allowed, attempt < 8);
    }
    const blocked = await consumeAdminAttemptWithSql(sql, "block-expiry", 8);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 899 && blocked.retryAfterSeconds <= 900);

    const stored = await sql.query<{ attempts: unknown[]; blocked_until: string }>(
      "select attempts,blocked_until from admin_rate_limits where key=$1", ["block-expiry"],
    );
    assert.deepEqual(stored[0]?.attempts, []);
    assert.ok(stored[0]?.blocked_until);

    await sql.query("update admin_rate_limits set blocked_until=clock_timestamp()-interval '1 second' where key=$1", ["block-expiry"]);
    assert.deepEqual(await consumeAdminAttemptWithSql(sql, "block-expiry", 8), {
      allowed: true, remaining: 7, retryAfterSeconds: 0,
    });
  } finally {
    await pg.close();
  }
});

test("PostgreSQL admin limiter applies rolling-window boundaries and isolates keys", async () => {
  const { pg, sql } = await createSql();
  try {
    await sql.query(
      "insert into admin_rate_limits(key,attempts) values($1,array_fill(clock_timestamp()-interval '9 minutes 59 seconds',array[8]))",
      ["window-boundary"],
    );
    assert.equal((await consumeAdminAttemptWithSql(sql, "window-boundary", 8)).allowed, false);
    assert.deepEqual(await consumeAdminAttemptWithSql(sql, "another-client", 8), {
      allowed: true, remaining: 7, retryAfterSeconds: 0,
    });
  } finally {
    await pg.close();
  }
});

test("successful authentication clears only its PostgreSQL bucket", async () => {
  const { pg, sql } = await createSql();
  try {
    await consumeAdminAttemptWithSql(sql, "clear-me", 3);
    await consumeAdminAttemptWithSql(sql, "keep-me", 3);
    await clearAdminAttemptsWithSql(sql, "clear-me");
    assert.deepEqual(await consumeAdminAttemptWithSql(sql, "clear-me", 3), {
      allowed: true, remaining: 2, retryAfterSeconds: 0,
    });
    assert.deepEqual(await consumeAdminAttemptWithSql(sql, "keep-me", 3), {
      allowed: true, remaining: 1, retryAfterSeconds: 0,
    });
  } finally {
    await pg.close();
  }
});

test("database failures propagate so production callers can fail closed", async () => {
  const unavailable = {
    query: async () => { throw new Error("database unavailable"); },
  } as unknown as Sql;
  await assert.rejects(consumeAdminAttemptWithSql(unavailable, "db-down"), /database unavailable/);
  await assert.rejects(clearAdminAttemptsWithSql(unavailable, "db-down"), /database unavailable/);
});

test("production refuses local or unconfigured databases instead of using a per-instance limiter", { skip: dbSource === "postgres" }, async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(consumeAdminAttempt("production-without-shared-postgres"), (error: unknown) =>
      Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 503),
    );
    await assert.rejects(clearAdminAttempts("production-without-shared-postgres"), (error: unknown) =>
      Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 503),
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("rate-limit identity trusts only Liara's rightmost client IP and ignores spoofed XFF prefixes", () => {
  assert.equal(resolveClientIp("10.0.0.4"), "10.0.0.4");
  assert.equal(resolveClientIp(undefined), "unknown");
  assert.equal(resolveClientIp("10.0.0.4", "198.51.100.99, 203.0.113.7"), "203.0.113.7");
  assert.equal(resolveClientIp("10.0.0.4", "198.51.100.99, invalid"), "10.0.0.4");
  const event = {
    req: {
      headers: new Headers({
        "x-forwarded-for": "198.51.100.99, 203.0.113.7",
        "x-real-ip": "198.51.100.99",
      }),
      context: { clientAddress: "10.0.0.4" },
    },
  } as unknown as import("h3").H3Event;
  assert.equal(clientFingerprint(event), createHash("sha256").update("203.0.113.7").digest("hex"));
});
