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

test("data-health integrity scans are limited to owner and manager roles", () => {
  assert.equal(hasAdminPermission("owner", "settings.manage"), true);
  assert.equal(hasAdminPermission("manager", "settings.manage"), true);
  assert.equal(hasAdminPermission("sales", "settings.manage"), false);
  assert.equal(hasAdminPermission("content", "settings.manage"), false);
  assert.equal(hasAdminPermission("staff", "settings.manage"), false);
  assert.equal(hasAdminPermission("viewer", "settings.manage"), false);
});

test("individual property performance is limited to roles that can manage property records", () => {
  assert.equal(hasAdminPermission("owner", "property.manage"), true);
  assert.equal(hasAdminPermission("manager", "property.manage"), true);
  assert.equal(hasAdminPermission("sales", "property.manage"), true);
  assert.equal(hasAdminPermission("content", "property.manage"), true);
  assert.equal(hasAdminPermission("staff", "property.manage"), false);
  assert.equal(hasAdminPermission("viewer", "property.manage"), false);
});

test("trash listing, restore and permanent deletion are limited to owner and manager", () => {
  assert.equal(hasAdminPermission("owner", "trash.manage"), true);
  assert.equal(hasAdminPermission("manager", "trash.manage"), true);
  assert.equal(hasAdminPermission("sales", "trash.manage"), false);
  assert.equal(hasAdminPermission("content", "trash.manage"), false);
  assert.equal(hasAdminPermission("staff", "trash.manage"), false);
  assert.equal(hasAdminPermission("viewer", "trash.manage"), false);
});

test("property schedule listing and updates are limited to owner and manager", () => {
  assert.equal(hasAdminPermission("owner", "schedule.manage"), true);
  assert.equal(hasAdminPermission("manager", "schedule.manage"), true);
  assert.equal(hasAdminPermission("sales", "schedule.manage"), false);
  assert.equal(hasAdminPermission("content", "schedule.manage"), false);
  assert.equal(hasAdminPermission("staff", "schedule.manage"), false);
  assert.equal(hasAdminPermission("viewer", "schedule.manage"), false);
});

test("owner directory access is independent and limited to owner and manager", () => {
  assert.equal(hasAdminPermission("owner", "owner-directory.manage"), true);
  assert.equal(hasAdminPermission("manager", "owner-directory.manage"), true);
  assert.equal(hasAdminPermission("sales", "owner-directory.manage"), false);
  assert.equal(hasAdminPermission("content", "owner-directory.manage"), false);
  assert.equal(hasAdminPermission("staff", "owner-directory.manage"), false);
  assert.equal(hasAdminPermission("viewer", "owner-directory.manage"), false);
  assert.equal(hasAdminPermission(normalizeAdminRole("admin"), "owner-directory.manage"), true);
});
