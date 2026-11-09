import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const consultants = readFileSync(new URL("../src/lib/consultants.ts", import.meta.url), "utf8");
const roles = readFileSync(new URL("../src/lib/admin-roles.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");

test("consultant server functions enforce team.manage after validating the admin session and origin", () => {
  const guardStart = consultants.indexOf("async function requireAdmin()");
  const guardEnd = consultants.indexOf("const selectColumns", guardStart);
  assert.notEqual(guardStart, -1);
  const guard = consultants.slice(guardStart, guardEnd);
  assert.match(guard, /verifyAdminSessionToken\(session\)/);
  assert.match(guard, /assertAdminServerFnOrigin\(\)/);
  assert.match(guard, /getAdminSessionClaims\(session\)/);
  assert.match(guard, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\),\s*"team\.manage"\)/);
  for (const operation of ["listAdminConsultants", "saveConsultant", "deleteConsultant"]) {
    const start = consultants.indexOf(`export const ${operation}`);
    assert.notEqual(start, -1, `${operation} should exist`);
    const next = consultants.indexOf("export const ", start + 1);
    const block = consultants.slice(start, next === -1 ? undefined : next);
    assert.match(block, /await requireAdmin\(\)/, `${operation} must use the role-aware guard`);
  }
});

test("public consultant query retains inactive rows for fallback decisions", () => {
  const start = consultants.indexOf("export const listConsultants");
  const end = consultants.indexOf("const consultantInput", start);
  const block = consultants.slice(start, end);
  assert.match(block, /from consultants\s+order by sort_order asc, name asc/);
  assert.doesNotMatch(block, /where\s+is_active\s*=\s*true/i);
  assert.match(block, /mergePublicConsultantDirectory\(databaseConsultants, staticConsultants\(\)\)/);
});

test("server-side deletion preserves the two core Hirmand profiles", () => {
  const start = consultants.indexOf("export const deleteConsultant");
  const block = consultants.slice(start);
  assert.match(block, /data\.id === "sheikh" \|\| data\.id === "moradi"/);
  assert.match(block, /await requireAdmin\(\)/);
});

test("the role map and admin UI use the same team.manage permission", () => {
  assert.match(roles, /\| "team\.manage"/);
  assert.match(roles, /export function canManageTeam\(role: AdminRole\)/);
  assert.match(admin, /if \(hasAdminPermission\(adminRole, "team\.manage"\)\) return navItems/);
});
