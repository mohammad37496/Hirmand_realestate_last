import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("attendance server functions enforce settings.manage after session verification", () => {
  const code = source("src/lib/attendance.ts");
  assert.match(code, /requireAdmin\(permission: AdminPermission = "settings\.manage"\)/);
  assert.match(code, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), permission\)/);
});

test("consultant writes and admin listing enforce settings.manage server-side", () => {
  const code = source("src/lib/consultants.ts");
  assert.match(code, /requireAdmin\(permission: AdminPermission = "settings\.manage"\)/);
  assert.match(code, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), permission\)/);
});

test("SEO redirects and 404-log maintenance enforce settings.manage server-side", () => {
  const code = source("src/lib/seo-redirects.ts");
  assert.match(code, /requireAdmin\(permission: AdminPermission = "settings\.manage"\)/);
  assert.match(code, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), permission\)/);
});

test("audit history reads and deletion both require security.manage", () => {
  const code = source("src/lib/admin-audit.ts");
  assert.equal([...code.matchAll(/await requireAdmin\("security\.manage"\)/g)].length, 2);
  assert.match(code, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), permission\)/);
});
