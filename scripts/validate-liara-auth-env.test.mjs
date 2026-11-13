import assert from "node:assert/strict";
import { test } from "node:test";
import { customerPasswordRecoveryEnvironmentWarnings, liaraEnvironmentMap, summarizeLiaraCustomerAuthEnvironment, validateLiaraCustomerAuthEnvironment } from "./validate-liara-auth-env.mjs";
import { normalizeBetterAuthOrigin } from "./auth-origin.mjs";

const ready = [
  { key: "DATABASE_URL", value: "postgresql://redacted" },
  { key: "BETTER_AUTH_URL", value: "https://hirmandrealestate.ir" },
  { key: "BETTER_AUTH_SECRET", value: "x".repeat(48) },
  { key: "VITE_AUTH_ENABLED", value: "true" },
  { key: "VITE_GROK_OAUTH_ENABLED", value: "false" },
  { key: "RESEND_API_KEY", value: "re_test_key_value" },
  { key: "RESEND_FROM_EMAIL", value: "Hirmand <accounts@hirmandrealestate.ir>" },
];

test("Liara env listing accepts CLI JSON rows and does not expose values", () => {
  const env = liaraEnvironmentMap(ready);
  assert.equal(env.get("DATABASE_URL"), "postgresql://redacted");
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(ready), []);
});

test("Liara auth summary reports safe presence/validity without exposing secret values", () => {
  const secret = "private-secret-value-that-must-never-be-printed-123456";
  const summary = summarizeLiaraCustomerAuthEnvironment([
    ...ready.filter((row) => row.key !== "BETTER_AUTH_SECRET"),
    { key: "BETTER_AUTH_SECRET", value: secret },
    { key: "GROK_AUTH_CLIENT_ID", value: "client-id-value" },
    { key: "GROK_AUTH_CLIENT_SECRET", value: "client-secret-value" },
  ]);

  assert.deepEqual(summary, {
    VITE_AUTH_ENABLED: "enabled",
    DATABASE_URL: "valid (DATABASE_URL)",
    BETTER_AUTH_URL: "valid",
    BETTER_AUTH_SECRET: "valid (at least 32 characters)",
    VITE_GROK_OAUTH_ENABLED: "disabled",
    GROK_AUTH_CLIENT_ID: "present",
    GROK_AUTH_CLIENT_SECRET: "present",
    RESEND_API_KEY: "valid format (re_ prefix)",
    RESEND_FROM_EMAIL: "valid (hirmandrealestate.ir)",
  });
  assert.doesNotMatch(JSON.stringify(summary), /private-secret|client-id-value|client-secret-value/);
});

test("Liara auth summary distinguishes missing flags and invalid values", () => {
  const summary = summarizeLiaraCustomerAuthEnvironment([
    { key: "DATABASE_URL", value: "not-a-postgres-url" },
    { key: "BETTER_AUTH_URL", value: "http://hirmandrealestate.ir/login" },
    { key: "BETTER_AUTH_SECRET", value: "short" },
  ]);
  assert.equal(summary.VITE_AUTH_ENABLED, "missing (application default: enabled)");
  assert.equal(summary.DATABASE_URL, "invalid (DATABASE_URL)");
  assert.equal(summary.BETTER_AUTH_URL, "invalid");
  assert.equal(summary.BETTER_AUTH_SECRET, "too short");
  assert.equal(summary.VITE_GROK_OAUTH_ENABLED, "missing");
  assert.equal(summary.GROK_AUTH_CLIENT_ID, "missing");
  assert.equal(summary.GROK_AUTH_CLIENT_SECRET, "missing");
  assert.equal(summary.RESEND_API_KEY, "missing");
  assert.equal(summary.RESEND_FROM_EMAIL, "missing");
});

test("nested Liara environment payloads are supported", () => {
  assert.deepEqual(validateLiaraCustomerAuthEnvironment({ project: { envs: ready } }), []);
});

test("missing persistent auth configuration blocks a production deploy", () => {
  assert.deepEqual(validateLiaraCustomerAuthEnvironment([{ key: "VITE_AUTH_ENABLED", value: "true" }]), [
    "one persistent PostgreSQL URL (DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, NEON_DATABASE_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING)",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET (at least 32 characters)",
  ]);
});

test("PostgreSQL-only deployment does not require Upstash credentials", () => {
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(ready), []);
  const summary = summarizeLiaraCustomerAuthEnvironment(ready);
  assert.equal(Object.hasOwn(summary, "UPSTASH_REDIS_REST_URL"), false);
  assert.equal(Object.hasOwn(summary, "UPSTASH_REDIS_REST_TOKEN"), false);
});

test("invalid auth origins are rejected before deploy", () => {
  const env = ready.map((row) => row.key === "BETTER_AUTH_URL" ? { ...row, value: "http://hirmandrealestate.ir/login" } : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(env), [
    "BETTER_AUTH_URL must be an HTTPS origin without a path",
  ]);
});

test("Better Auth URL with a trailing root slash normalizes to the browser origin", () => {
  assert.equal(normalizeBetterAuthOrigin("https://hirmandrealestate.ir/"), "https://hirmandrealestate.ir");
  const env = ready.map((row) => row.key === "BETTER_AUTH_URL" ? { ...row, value: "https://hirmandrealestate.ir/" } : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(env), []);
});

test("Better Auth origin normalization rejects paths, queries, and fragments", () => {
  for (const value of ["https://hirmandrealestate.ir/login", "https://hirmandrealestate.ir/?x=1", "https://hirmandrealestate.ir/#auth"]) {
    assert.throws(() => normalizeBetterAuthOrigin(value));
  }
});

test("HTTP Better Auth origins are allowed only for explicit CI loopback previews", () => {
  assert.equal(
    normalizeBetterAuthOrigin("http://localhost:8081", { allowHttpLoopback: true }),
    "http://localhost:8081",
  );
  assert.throws(() => normalizeBetterAuthOrigin("http://localhost:8081"));
  assert.throws(() => normalizeBetterAuthOrigin("http://example.com", { allowHttpLoopback: true }));
});

test("invalid database URLs are rejected before deploy", () => {
  const env = ready.map((row) => row.key === "DATABASE_URL" ? { ...row, value: "not-a-postgres-url" } : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(env), [
    "DATABASE_URL must be a valid PostgreSQL connection URL",
  ]);
});

test("production deployment is blocked when customer accounts are explicitly disabled", () => {
  assert.deepEqual(validateLiaraCustomerAuthEnvironment([{ key: "VITE_AUTH_ENABLED", value: "false" }]), [
    "VITE_AUTH_ENABLED must be true to enable customer accounts",
  ]);
});

test("enabled Google/X OAuth requires its per-app broker credentials", () => {
  const env = ready.map((row) => row.key === "VITE_GROK_OAUTH_ENABLED" ? { ...row, value: "true" } : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(env), ["GROK_AUTH_CLIENT_ID", "GROK_AUTH_CLIENT_SECRET"]);
});

test("missing Resend configuration warns without blocking unrelated application deployment", () => {
  const missingKey = ready.filter((row) => row.key !== "RESEND_API_KEY");
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(missingKey), []);
  assert.deepEqual(customerPasswordRecoveryEnvironmentWarnings(missingKey), [
    "RESEND_API_KEY is missing; customer password-recovery emails cannot be sent.",
  ]);
  const invalidSender = ready.map((row) => row.key === "RESEND_FROM_EMAIL"
    ? { ...row, value: "Hirmand <accounts@example.com>" }
    : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(invalidSender), []);
  assert.deepEqual(customerPasswordRecoveryEnvironmentWarnings(invalidSender), [
    "RESEND_FROM_EMAIL is missing or must use the verified hirmandrealestate.ir domain.",
  ]);
});

test("malformed Resend API keys are reported without exposing the configured value", () => {
  const malformedKey = "not-a-resend-key-secret-value";
  const env = ready.map((row) => row.key === "RESEND_API_KEY" ? { ...row, value: malformedKey } : row);
  const summary = summarizeLiaraCustomerAuthEnvironment(env);
  assert.equal(summary.RESEND_API_KEY, "invalid format (must start with re_)");
  assert.deepEqual(customerPasswordRecoveryEnvironmentWarnings(env), [
    "RESEND_API_KEY has an invalid format; a Resend API key must start with re_.",
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /not-a-resend-key-secret-value/);
});

test("unexpected Liara payloads fail closed", () => {
  assert.throws(() => liaraEnvironmentMap({ unexpected: true }), /did not contain a variable list/);
});
