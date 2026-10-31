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

test("every consultant, including the bundled core profiles, can be deleted from admin", () => {
  const code = source("src/components/hirmand/admin-consultant-manager.tsx");
  assert.match(code, /async function remove\(item: Consultant\)/);
  assert.doesNotMatch(code, /item\.id === "sheikh" \|\| item\.id === "moradi"/);
  assert.match(code, /await deleteConsultant\(\{ data: \{ id: item\.id \} \}\)/);
});

test("a successful empty consultant query stays empty across server and client", () => {
  const server = source("src/lib/consultants.ts");
  const client = source("src/components/hirmand/consultants-context.tsx");
  assert.match(server, /return rows\.map\(normalize\);/);
  assert.doesNotMatch(server, /databaseById|bundled\.filter/);
  assert.match(client, /if \(!cancelled\) setConsultants\(rows\);/);
  assert.doesNotMatch(client, /rows\.length/);
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
