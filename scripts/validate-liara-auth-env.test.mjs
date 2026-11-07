import assert from "node:assert/strict";
import { test } from "node:test";
import { liaraEnvironmentMap, validateLiaraCustomerAuthEnvironment } from "./validate-liara-auth-env.mjs";

const ready = [
  { key: "DATABASE_URL", value: "postgresql://redacted" },
  { key: "BETTER_AUTH_URL", value: "https://hirmandrealestate.ir" },
  { key: "BETTER_AUTH_SECRET", value: "x".repeat(48) },
  { key: "VITE_AUTH_ENABLED", value: "true" },
  { key: "VITE_GROK_OAUTH_ENABLED", value: "false" },
];

test("Liara env listing accepts CLI JSON rows and does not expose values", () => {
  const env = liaraEnvironmentMap(ready);
  assert.equal(env.get("DATABASE_URL"), "postgresql://redacted");
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(ready), []);
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

test("invalid auth origins are rejected before deploy", () => {
  const env = ready.map((row) => row.key === "BETTER_AUTH_URL" ? { ...row, value: "http://hirmandrealestate.ir/login" } : row);
  assert.deepEqual(validateLiaraCustomerAuthEnvironment(env), [
    "BETTER_AUTH_URL must be an HTTPS origin without a path",
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

test("unexpected Liara payloads fail closed", () => {
  assert.throws(() => liaraEnvironmentMap({ unexpected: true }), /did not contain a variable list/);
});
