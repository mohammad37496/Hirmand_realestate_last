import assert from "node:assert/strict";
import { test } from "node:test";

// Force the deterministic single-process store for these concurrency tests.
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
const { clearAdminAttempts, consumeAdminAttempt, resolveClientIp } = await import("./admin-rate-limit.server.ts");

test("concurrent attempts cannot race past the in-memory rate limit", async () => {
  const key = "concurrent-test:" + crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 48 }, () => consumeAdminAttempt(key, 8)));
  assert.equal(results.filter((result) => result.allowed).length, 8);
  assert.equal(results.filter((result) => !result.allowed).length, 40);
  assert.ok(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds > 0));
});

test("clearing a rate-limit bucket allows a new attempt", async () => {
  const key = "clear-test:" + crypto.randomUUID();
  const blocked = await Promise.all(Array.from({ length: 4 }, () => consumeAdminAttempt(key, 3)));
  assert.equal(blocked.filter((result) => result.allowed).length, 3);
  assert.equal(blocked.filter((result) => !result.allowed).length, 1);
  await clearAdminAttempts(key);
  assert.equal((await consumeAdminAttempt(key, 3)).allowed, true);
});

test("rate-limit identity prefers the rightmost reverse-proxy IP", () => {
  assert.equal(resolveClientIp("198.51.100.99, 203.0.113.7", "10.0.0.4"), "203.0.113.7");
  assert.equal(resolveClientIp(undefined, "10.0.0.4"), "10.0.0.4");
  assert.equal(resolveClientIp(undefined, undefined), "unknown");
});

test("a configured Redis outage fails closed instead of falling back to per-instance memory", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    const isolated = await import(`./admin-rate-limit.server.ts?redis-failure=${crypto.randomUUID()}`);
    await assert.rejects(
      isolated.consumeAdminAttempt("redis-outage:" + crypto.randomUUID()),
      /Redis responded 503/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("production requires the shared Redis store instead of falling back to per-process memory", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCi = process.env.CI;
  const previousVerifyFlag = process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.CI = "false";
  delete process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT;
  process.env.NODE_ENV = "production";
  try {
    const isolated = await import(`./admin-rate-limit.server.ts?redis-unconfigured=${crypto.randomUUID()}`);
    await assert.rejects(
      isolated.consumeAdminAttempt("redis-unconfigured:" + crypto.randomUUID()),
      (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 503),
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
    if (previousVerifyFlag === undefined) delete process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT;
    else process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT = previousVerifyFlag;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("Verify preview may explicitly use the in-memory limiter without Redis", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCi = process.env.CI;
  const previousVerifyFlag = process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.NODE_ENV = "production";
  process.env.CI = "true";
  process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT = "true";
  try {
    const isolated = await import(`./admin-rate-limit.server.ts?verify-memory=${crypto.randomUUID()}`);
    const result = await isolated.consumeAdminAttempt("verify-memory:" + crypto.randomUUID());
    assert.equal(result.allowed, true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
    if (previousVerifyFlag === undefined) delete process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT;
    else process.env.HIRMAND_TEST_ALLOW_IN_MEMORY_RATE_LIMIT = previousVerifyFlag;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});
