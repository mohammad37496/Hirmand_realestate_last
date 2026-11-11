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
