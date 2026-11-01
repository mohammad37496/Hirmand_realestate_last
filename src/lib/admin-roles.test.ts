import assert from "node:assert/strict";
import { test } from "node:test";
import { hasAdminPermission, normalizeAdminRole } from "./admin-roles.ts";

test("partner administration is restricted to owner and manager roles", () => {
  assert.equal(hasAdminPermission("owner", "partners.manage"), true);
  assert.equal(hasAdminPermission("manager", "partners.manage"), true);
  assert.equal(hasAdminPermission("sales", "partners.manage"), false);
  assert.equal(hasAdminPermission("content", "partners.manage"), false);
  assert.equal(hasAdminPermission("staff", "partners.manage"), false);
  assert.equal(hasAdminPermission("viewer", "partners.manage"), false);
  assert.equal(hasAdminPermission(normalizeAdminRole("admin"), "partners.manage"), true);
});

test("sales commission permissions do not imply partner administration", () => {
  assert.equal(hasAdminPermission("sales", "commission.manage"), true);
  assert.equal(hasAdminPermission("sales", "partners.manage"), false);
});
