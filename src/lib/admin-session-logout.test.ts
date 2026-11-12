import assert from "node:assert/strict";
import { test } from "node:test";
import { completeAdminSessionLogout } from "./admin-session-logout.ts";

test("logout succeeds without a server-side revoke only when there is no session token", async () => {
  assert.equal(await completeAdminSessionLogout(null, false, async () => { throw new Error("must not run"); }), true);
});

test("logout fails closed when the database is unconfigured for an existing session", async () => {
  let called = false;
  const result = await completeAdminSessionLogout("session-1", false, async () => { called = true; });
  assert.equal(result, false);
  assert.equal(called, false);
});

test("logout succeeds after the server-side revocation query completes", async () => {
  let revokedId = "";
  const result = await completeAdminSessionLogout("123e4567-e89b-12d3-a456-426614174000", true, async (id) => { revokedId = id; });
  assert.equal(result, true);
  assert.equal(revokedId, "123e4567-e89b-12d3-a456-426614174000");
});

test("logout does not report success when the server-side revocation query fails", async () => {
  const result = await completeAdminSessionLogout("session-1", true, async () => {
    throw new Error("database write unavailable");
  });
  assert.equal(result, false);
});
