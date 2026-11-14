import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdminNotificationAccountKey, getAdminNotificationPermissions } from "./admin-notification-access.ts";
import { normalizeAdminRole } from "./admin-roles.ts";

test("notification scopes follow the permissions required by each admin workspace", () => {
  const scopes = (role: string) => getAdminNotificationPermissions(normalizeAdminRole(role));

  assert.deepEqual(scopes("owner"), [
    "lead.manage", "property.manage", "property.publish", "deal.manage", "divar.import", "team.manage", "reports.view",
  ]);
  assert.deepEqual(scopes("manager"), scopes("owner"));
  assert.deepEqual(scopes("sales"), ["lead.manage", "property.manage", "deal.manage", "divar.import", "reports.view"]);
  assert.deepEqual(scopes("content"), ["property.manage", "reports.view"]);
  assert.deepEqual(scopes("staff"), ["lead.manage", "divar.import"]);
  assert.deepEqual(scopes("viewer"), ["reports.view"]);
});

test("legacy sessions keep a stable per-role read-state key and named accounts stay isolated", () => {
  assert.equal(getAdminNotificationAccountKey(null, "owner"), "legacy:owner");
  assert.equal(getAdminNotificationAccountKey(" account-1 ", "manager"), "account-1");
  assert.notEqual(getAdminNotificationAccountKey("account-1", "manager"), getAdminNotificationAccountKey("account-2", "manager"));
});
