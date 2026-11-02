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

test("partner administration API uses a dedicated permission and remains hidden from sales/content navigation", () => {
  const route = source("server/routes/api/admin/partners.post.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "partners\.manage"\)/);
  assert.doesNotMatch(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "commission\.manage"\)/);
  const salesNav = adminUi.match(/if \(adminRole === "sales"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const contentNav = adminUi.match(/if \(adminRole === "content"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  assert.doesNotMatch(salesNav, /"partners"/);
  assert.doesNotMatch(contentNav, /"partners"/);
});

test("consultant targets and commission performance reads require deal.manage like the visible UI roles", () => {
  const route = source("server/routes/api/admin-consultant-targets.post.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "deal\.manage"\)/);
  assert.doesNotMatch(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "reports\.view"\)/);
  const contentNav = adminUi.match(/if \(adminRole === "content"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const viewerNav = adminUi.match(/return navItems\.filter\(\(item\) => item\.view === "dashboard" \|\| item\.view === "managementReport"\)/)?.[0] ?? "";
  assert.doesNotMatch(contentNav, /"consultantTargets"/);
  assert.doesNotMatch(viewerNav, /"consultantTargets"/);
});

test("the real admin workflow E2E exercises consultant-target API access for each role class", () => {
  const e2e = source("scripts/admin-business-workflows-e2e.mjs");
  assert.match(e2e, /consultantTargetsResponse\(salesPage\)/);
  assert.match(e2e, /loginAsTemporaryRole\("manager"\)/);
  assert.match(e2e, /for \(const role of \["content", "viewer", "staff"\]\)/);
  assert.match(e2e, /targetsResponse\.status !== 403/);
  assert.match(e2e, /consultantTargetsResponse\(page\)/);
});

test("data-health scans require settings.manage and match the owner/manager-only UI", () => {
  const route = source("server/routes/api/admin-data-health.post.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "settings\.manage"\)/);
  assert.doesNotMatch(route, /"reports\.view"/);
  const salesNav = adminUi.match(/if \(adminRole === "sales"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const contentNav = adminUi.match(/if \(adminRole === "content"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const staffNav = adminUi.match(/if \(adminRole === "staff"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const viewerNav = adminUi.match(/return navItems\.filter\(\(item\) => item\.view === "dashboard" \|\| item\.view === "managementReport"\)/)?.[0] ?? "";
  assert.doesNotMatch(salesNav, /"integrity"/);
  assert.doesNotMatch(contentNav, /"integrity"/);
  assert.doesNotMatch(staffNav, /"integrity"/);
  assert.doesNotMatch(viewerNav, /"integrity"/);
});

test("the real admin workflow E2E checks data-health API access for every role class", () => {
  const e2e = source("scripts/admin-business-workflows-e2e.mjs");
  assert.match(e2e, /dataHealthResponse\(salesPage\)/);
  assert.match(e2e, /dataHealthResponse\(managerPage\)/);
  assert.match(e2e, /dataHealthResponse\(restrictedPage\)/);
  assert.match(e2e, /dataHealthResponse\(page\)/);
  assert.match(e2e, /data-health scan/);
});

test("individual property performance requires property.manage rather than broad report visibility", () => {
  const route = source("server/routes/api/admin-property-performance.post.ts");
  const e2e = source("scripts/admin-business-workflows-e2e.mjs");
  assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "property\.manage"\)/);
  assert.doesNotMatch(route, /"reports\.view"/);
  assert.match(e2e, /propertyPerformanceResponse\(salesPage, roleCheckPropertyId\)/);
  assert.match(e2e, /propertyPerformanceResponse\(managerPage, roleCheckPropertyId\)/);
  assert.match(e2e, /propertyPerformanceResponse\(restrictedPage, roleCheckPropertyId\)/);
  assert.match(e2e, /propertyPerformanceResponse\(page, roleCheckPropertyId\)/);
});

test("trash server functions require a dedicated owner/manager permission matching navigation", () => {
  const properties = source("src/lib/properties.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  const listStart = properties.indexOf("export const listAdminTrashProperties");
  const restoreStart = properties.indexOf("export const restoreDeletedProperty", listStart);
  const permanentStart = properties.indexOf("export const permanentlyDeleteProperty", restoreStart);
  const schedulesStart = properties.indexOf("export const listAdminPropertySchedules", permanentStart);
  const list = properties.slice(listStart, restoreStart);
  const restore = properties.slice(restoreStart, permanentStart);
  const permanent = properties.slice(permanentStart, schedulesStart);
  assert.match(list, /requireAdminPermission\("trash\.manage"\)/);
  assert.match(restore, /requireAdminPermission\("trash\.manage"\)/);
  assert.match(permanent, /requireAdminPermission\("trash\.manage"\)/);
  assert.match(adminUi, /if \(adminRole === "owner" \|\| adminRole === "manager"\) return navItems/);
  const salesNav = adminUi.match(/if \(adminRole === "sales"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const contentNav = adminUi.match(/if \(adminRole === "content"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const staffNav = adminUi.match(/if \(adminRole === "staff"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const viewerNav = adminUi.match(/return navItems\.filter\(\(item\) => item\.view === "dashboard" \|\| item\.view === "managementReport"\)/)?.[0] ?? "";
  assert.doesNotMatch(salesNav, /"trash"/);
  assert.doesNotMatch(contentNav, /"trash"/);
  assert.doesNotMatch(staffNav, /"trash"/);
  assert.doesNotMatch(viewerNav, /"trash"/);
});
