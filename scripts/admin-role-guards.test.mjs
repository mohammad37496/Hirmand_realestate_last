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

test("property schedule server functions require a dedicated owner/manager permission matching navigation", () => {
  const properties = source("src/lib/properties.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  const listStart = properties.indexOf("export const listAdminPropertySchedules");
  const updateStart = properties.indexOf("export const updatePropertySchedule", listStart);
  const nextStart = properties.indexOf("export const saveProperty", updateStart);
  const list = properties.slice(listStart, updateStart);
  const update = properties.slice(updateStart, nextStart);
  assert.match(list, /requireAdminPermission\("schedule\.manage"\)/);
  assert.match(update, /requireAdminPermission\("schedule\.manage"\)/);
  assert.doesNotMatch(list, /requireAdminPermission\("property\.manage"\)/);
  assert.doesNotMatch(update, /requireAdminPermission\("property\.manage"\)/);
  assert.match(adminUi, /if \(adminRole === "owner" \|\| adminRole === "manager"\) return navItems/);
  const salesNav = adminUi.match(/if \(adminRole === "sales"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const contentNav = adminUi.match(/if \(adminRole === "content"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const staffNav = adminUi.match(/if \(adminRole === "staff"\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
  const viewerNav = adminUi.match(/return navItems\.filter\(\(item\) => item\.view === "dashboard" \|\| item\.view === "managementReport"\)/)?.[0] ?? "";
  assert.doesNotMatch(salesNav, /"schedule"/);
  assert.doesNotMatch(contentNav, /"schedule"/);
  assert.doesNotMatch(staffNav, /"schedule"/);
  assert.doesNotMatch(viewerNav, /"schedule"/);
});

test("owner directory API requires its dedicated permission before reading the request or database", () => {
  const route = source("server/routes/api/admin-owners.post.ts");
  const adminUi = source("src/components/hirmand/_admin_impl.tsx");
  assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "owner-directory\.manage"\)/);
  const guard = route.indexOf("await requireAdmin(event)");
  const body = route.indexOf("await readBody(event)");
  const database = route.indexOf("await getSql()");
  assert.ok(guard >= 0 && body > guard && database > body, "owner authorization must precede body handling and sensitive SQL");
  assert.match(adminUi, /const canManageOwnerDirectory = hasAdminPermission\(adminRole, "owner-directory\.manage"\)/);
  assert.match(adminUi, /canManageOwnerDirectory && \(property\.ownerName/);
  assert.match(adminUi, /\{canManageOwnerDirectory \? \(/);
  assert.match(adminUi, /placeholder=\{canManageOwnerDirectory[\s\S]*?مالک یا تلفن/);
  const navStart = adminUi.indexOf("const visibleNavItems");
  const navEnd = adminUi.indexOf("const canManageProperties", navStart);
  const roleNavigation = adminUi.slice(navStart, navEnd);
  assert.doesNotMatch(roleNavigation, /const allowed = new Set<ViewMode>\(\[.*?"owners"/s);
  const e2e = source("scripts/admin-business-workflows-e2e.mjs");
  assert.match(e2e, /lock table properties in access exclusive mode/);
  assert.match(e2e, /ownerDirectoryDeniedBeforeSensitiveQuery/);
  assert.match(e2e, /lock table customer_property_submissions in access exclusive mode/);
  assert.match(e2e, /customerSubmissionDeniedBeforeSensitiveQuery/);
  assert.match(e2e, /salesPropertySearch\.fill\(ownerFixturePhone\)/);
  assert.match(e2e, /if \(role === "content"\)[\s\S]*?propertySearch\.fill\(ownerFixturePhone\)/);
  assert.match(e2e, /Owner-directory E2E fixture private fields were not restored/);
});

test("admin property list and search do not select or search private owner fields without owner-directory.manage", () => {
  const properties = source("src/lib/properties.ts");
  const listStart = properties.indexOf("export const listAdminProperties");
  const countStart = properties.indexOf("export const countAdminProperties", listStart);
  const filteredStart = properties.indexOf("export const countFilteredAdminProperties", countStart);
  const bulkStart = properties.indexOf("export const bulkUpdatePropertyStatus", filteredStart);
  const list = properties.slice(listStart, countStart);
  const filtered = properties.slice(filteredStart, bulkStart);
  assert.match(list, /requireAdminPermission\("property\.manage"\)/);
  assert.match(list, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "owner-directory\.manage"\)/);
  assert.match(list, /LIST_COLUMNS\}\$\{includeOwnerDetails \? `, \$\{OWNER_DETAIL_COLUMNS\}` : ""\}/);
  assert.match(list, /adminPropertyWhereSql\(includeOwnerDetails\)/);
  assert.match(filtered, /adminPropertyWhereSql\(includeOwnerDetails\)/);
  const where = properties.slice(properties.indexOf("function adminPropertyWhereSql"), listStart);
  assert.match(where, /const ownerSearch = includeOwnerDetails/);
  assert.match(where, /const phoneSearch = includeOwnerDetails/);
});

test("property save preserves private owner columns on writes from roles without directory access", () => {
  const properties = source("src/lib/properties.ts");
  const start = properties.indexOf("export const saveProperty");
  const end = properties.indexOf("export const listPropertyChangeHistory", start);
  const save = properties.slice(start, end);
  assert.match(save, /const includeOwnerDetails = hasAdminPermission\(role, "owner-directory\.manage"\)/);
  assert.match(save, /select \$\{DETAIL_COLUMNS\}\$\{includeOwnerDetails \? `, \$\{OWNER_DETAIL_COLUMNS\}` : ""\}/);
  assert.match(save, /owner_name = case when \$50::boolean then excluded\.owner_name else properties\.owner_name end/);
  assert.match(save, /includeOwnerDetails \? data\.ownerName\.trim\(\) : ""/);
  assert.match(save, /mapProperty\(rows\[0\], \{ admin: true, ownerDetails: includeOwnerDetails \}\)/);
});

test("property history redacts owner fields in SQL before returning data to non-directory roles", () => {
  const properties = source("src/lib/properties.ts");
  const start = properties.indexOf("export const listPropertyChangeHistory");
  const end = properties.indexOf("export const deleteProperty", start);
  const history = properties.slice(start, end);
  assert.match(history, /requireAdminPermission\("property\.manage"\)/);
  assert.match(history, /before_state - 'ownerName' - 'ownerPhone' - 'ownerInfo'/);
  assert.match(history, /after_state - 'ownerName' - 'ownerPhone' - 'ownerInfo'/);
});

test("property trash snapshots omit private owner columns for property managers without directory access", () => {
  const trash = source("src/lib/admin-property-soft-delete.ts");
  const properties = source("src/lib/properties.ts");
  assert.match(trash, /LOCK_ACTIVE_PROPERTY_FOR_TRASH_WITHOUT_OWNER_DETAILS_SQL/);
  assert.match(trash, /const lockSql = includeOwnerDetails[\s\S]*?LOCK_ACTIVE_PROPERTY_FOR_TRASH_WITHOUT_OWNER_DETAILS_SQL/);
  const deleteStart = properties.indexOf("export const deleteProperty");
  const deleteHandler = properties.slice(deleteStart);
  assert.match(deleteHandler, /softDeleteProperty\([\s\S]*?includeOwnerDetails/);
});

test("bulk property status and featured mutations do not fetch private owner columns for ordinary property managers", () => {
  const statusSql = source("src/lib/admin-property-status-featured.ts");
  const properties = source("src/lib/properties.ts");
  assert.doesNotMatch(statusSql, /returning[^`]*owner_(?:name|phone|info)/s);
  const bulkStatusStart = properties.indexOf("export const bulkUpdatePropertyStatus");
  const bulkFeaturedStart = properties.indexOf("export const bulkSetPropertyFeatured", bulkStatusStart);
  const saveStart = properties.indexOf("export const saveProperty", bulkFeaturedStart);
  const bulkStatus = properties.slice(bulkStatusStart, bulkFeaturedStart);
  const bulkFeatured = properties.slice(bulkFeaturedStart, saveStart);
  assert.match(bulkStatus, /includeOwnerDetails \? ", owner_name, owner_phone, owner_info" : ""/);
  assert.match(bulkStatus, /afterOwnerJsonFields/);
  assert.match(bulkFeatured, /afterOwnerJsonFields/);
  assert.doesNotMatch(statusSql, /owner_name|owner_phone|owner_info/);
});

test("alternate owner data APIs gate their sensitive query or response fields", () => {
  const productivity = source("server/routes/api/admin-productivity.post.ts");
  const exportRoute = source("server/routes/api/admin/properties-export.post.ts");
  const submissions = source("server/routes/api/admin-customer-property-submissions.post.ts");
  const dashboard = source("src/components/hirmand/admin-dashboard.tsx");
  assert.match(productivity, /return hasAdminPermission\(role, "owner-directory\.manage"\)/);
  assert.match(productivity, /includeOwnerDirectory \? sql\.query[\s\S]*?owner_phone[\s\S]*?: Promise\.resolve\(\[\] as Record<string, unknown>\[\]\)/);
  assert.match(exportRoute, /const includeOwnerDetails = hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "owner-directory\.manage"\)/);
  assert.match(exportRoute, /includeOwnerDetails \? "owner_name, owner_phone, owner_info, " : ""/);
  assert.match(exportRoute, /propertyExportCsv\(rows, includeOwnerDetails\)/);
  assert.match(submissions, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "owner-directory\.manage"\)/);
  const submissionGuard = submissions.indexOf('"owner-directory.manage"');
  assert.ok(submissionGuard > 0 && submissionGuard < submissions.indexOf("await readBody(event)"));
  assert.match(dashboard, /canManageOwnerDirectory \? <AdminCustomerPropertySubmissions \/> : null/);
});
