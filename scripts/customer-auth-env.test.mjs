import assert from "node:assert/strict";
import test from "node:test";
import {
  customerAuthEnvironmentErrors,
  shouldAbortOnCustomerAuthMigrationError,
} from "./customer-auth-env.mjs";

const valid = {
  NODE_ENV: "production",
  VITE_AUTH_ENABLED: "true",
  VITE_GROK_OAUTH_ENABLED: "true",
  BETTER_AUTH_URL: "https://hirmandrealestate.ir",
  BETTER_AUTH_SECRET: "a".repeat(48),
  GROK_AUTH_CLIENT_ID: "hirmand-prod",
  GROK_AUTH_CLIENT_SECRET: "broker-secret",
};

test("production customer auth requires persistent database and all signing credentials", () => {
  assert.deepEqual(customerAuthEnvironmentErrors(valid, true), []);
  const errors = customerAuthEnvironmentErrors({ NODE_ENV: "production" }, false);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((item) => item.startsWith("DATABASE_URL")));
  assert.ok(errors.some((item) => item.startsWith("BETTER_AUTH_SECRET")));
});

test("Google and X credentials are required only when broker sign-in is enabled", () => {
  assert.deepEqual(customerAuthEnvironmentErrors({
    NODE_ENV: "production",
    BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET,
    VITE_GROK_OAUTH_ENABLED: "false",
  }, true), []);
  const errors = customerAuthEnvironmentErrors({
    ...valid,
    GROK_AUTH_CLIENT_ID: "",
    GROK_AUTH_CLIENT_SECRET: "",
  }, true);
  assert.deepEqual(errors, ["GROK_AUTH_CLIENT_ID", "GROK_AUTH_CLIENT_SECRET"]);
});

test("auth-off and non-production environments do not require production credentials", () => {
  assert.deepEqual(customerAuthEnvironmentErrors({ NODE_ENV: "production", VITE_AUTH_ENABLED: "false" }, false), []);
  assert.deepEqual(customerAuthEnvironmentErrors({ NODE_ENV: "development" }, false), []);
});

test("auth base URL must be an HTTPS origin without a path", () => {
  assert.deepEqual(customerAuthEnvironmentErrors({ ...valid, BETTER_AUTH_URL: "http://hirmandrealestate.ir" }, true), [
    "BETTER_AUTH_URL must be an HTTPS origin without a path",
  ]);
  assert.deepEqual(customerAuthEnvironmentErrors({ ...valid, BETTER_AUTH_URL: "https://hirmandrealestate.ir/login" }, true), [
    "BETTER_AUTH_URL must be an HTTPS origin without a path",
  ]);
});

test("weak auth secrets are rejected without printing their value", () => {
  assert.deepEqual(customerAuthEnvironmentErrors({ ...valid, BETTER_AUTH_SECRET: "short" }, true), [
    "BETTER_AUTH_SECRET (at least 32 characters)",
  ]);
});

test("production account instances fail closed when migrations cannot complete", () => {
  assert.equal(shouldAbortOnCustomerAuthMigrationError({ NODE_ENV: "production" }), true);
  assert.equal(shouldAbortOnCustomerAuthMigrationError({ NODE_ENV: "production", VITE_AUTH_ENABLED: "false" }), false);
  assert.equal(shouldAbortOnCustomerAuthMigrationError({ NODE_ENV: "development" }), false);
});
