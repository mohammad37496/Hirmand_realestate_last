import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import type { Sql } from "@/lib/db";
import { consumePublicLeadAttempt } from "./public-lead-rate-limit.server.ts";

async function createSql() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../../migrations/0105_public_lead_rate_limits.sql", import.meta.url), "utf8"));
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  } as Sql;
  return { pg, sql };
}

test("public lead rate limit is atomic across concurrent requests", async () => {
  const { pg, sql } = await createSql();
  try {
    const results = await Promise.all(
      Array.from({ length: 32 }, () => consumePublicLeadAttempt(sql, "public-lead:test")),
    );
    assert.equal(results.filter((result) => result.allowed).length, 8);
    assert.equal(results.filter((result) => !result.allowed).length, 24);
    assert.ok(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds >= 899 && result.retryAfterSeconds <= 900));
  } finally {
    await pg.close();
  }
});

test("public lead rate limit resets after the rolling window and after a block expires", async () => {
  const { pg, sql } = await createSql();
  try {
    await sql.query(
      "insert into public_lead_rate_limits(key,attempts,blocked_until) values($1,array[clock_timestamp() - interval '20 minutes'],clock_timestamp() - interval '1 second')",
      ["public-lead:reset"],
    );
    assert.deepEqual(
      await consumePublicLeadAttempt(sql, "public-lead:reset"),
      { allowed: true, retryAfterSeconds: 0 },
    );
  } finally {
    await pg.close();
  }
});

test("public lead rate limit enforces a rolling ten-minute window across clock boundaries", async () => {
  const { pg, sql } = await createSql();
  try {
    await sql.query(
      "insert into public_lead_rate_limits(key,attempts,blocked_until) values($1,array_fill(clock_timestamp() - interval '1 second', array[8]),null)",
      ["public-lead:boundary"],
    );
    assert.equal(
      (await consumePublicLeadAttempt(sql, "public-lead:boundary")).allowed,
      false,
    );
    await sql.query(
      "update public_lead_rate_limits set attempts=array_fill(clock_timestamp() - interval '10 minutes' - interval '1 second', array[8]),blocked_until=null where key=$1",
      ["public-lead:boundary"],
    );
    assert.equal(
      (await consumePublicLeadAttempt(sql, "public-lead:boundary")).allowed,
      true,
    );
  } finally {
    await pg.close();
  }
});

test("public lead rate limit evaluates its rolling window after waiting for the bucket row lock", async () => {
  const { pg, sql } = await createSql();
  const key = "public-lead:lock-wait";
  try {
    await sql.query(
      "insert into public_lead_rate_limits(key,attempts,blocked_until) values($1,array_fill(clock_timestamp() - interval '10 minutes' + interval '500 milliseconds', array[8]),null)",
      [key],
    );

    let releaseLock!: () => void;
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const blocker = pg.transaction(async (tx) => {
      await tx.query("select key from public_lead_rate_limits where key=$1 for update", [key]);
      signalLocked();
      await new Promise<void>((resolve) => { releaseLock = resolve; });
    });

    await locked;
    const attempt = consumePublicLeadAttempt(sql, key);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    releaseLock();
    await blocker;

    assert.deepEqual(await attempt, { allowed: true, retryAfterSeconds: 0 });
  } finally {
    await pg.close();
  }
});
