import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRejectStatelessAdminSession } from "./admin-session-policy.ts";

test("production rejects stateless admin sessions when the database is unconfigured", () => {
  assert.equal(shouldRejectStatelessAdminSession(false, true), true);
});

test("development may keep the explicit stateless admin-key fallback", () => {
  assert.equal(shouldRejectStatelessAdminSession(false, false), false);
});

test("database-backed admin sessions are allowed in development and production", () => {
  assert.equal(shouldRejectStatelessAdminSession(true, false), false);
  assert.equal(shouldRejectStatelessAdminSession(true, true), false);
});
