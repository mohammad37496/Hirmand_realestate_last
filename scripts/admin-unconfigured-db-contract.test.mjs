import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePaths = [
  "admin-watermark.post.ts",
  "admin-message-templates.post.ts",
  "admin-consultant-targets.post.ts",
  "admin-property-lifecycle.post.ts",
  "admin-kpi-snapshot.post.ts",
  "admin-agenda.post.ts",
  "admin-action-center.post.ts",
  "admin-customer-property-submissions.post.ts",
  "admin-phone-bridge.post.ts",
  "leads-admin.post.ts",
  "admin-campaign-performance.post.ts",
  "admin-consultant-performance.get.ts",
  "admin-lead-dedupe.post.ts",
  "admin-lead-segments.post.ts",
  "admin-match.post.ts",
  "admin-neighborhood-demand.post.ts",
  "admin-operations.post.ts",
  "admin-owners.post.ts",
  "admin-property-duplicates.post.ts",
  "admin-property-performance.post.ts",
  "admin-property-price-history.post.ts",
  "admin-property-quality.post.ts",
  "admin-sales-control-center.post.ts",
  "admin/properties-export.post.ts",
  "admin-finance.post.ts",
];
const routes = await Promise.all(routePaths.map((name) =>
  readFile(new URL(`../server/routes/api/${name}`, import.meta.url), "utf8"),
));

const serverFunctionModules = [
  { file: "admin-audit.ts", operations: ["listAdminAuditLog", "clearAdminAuditLog"] },
  {
    file: "admin-security.ts",
    operations: ["listAdminSecuritySessions", "revokeAdminSessionById", "revokeOtherAdminSessions", "purgeExpiredAdminSessions"],
  },
  { file: "admin-notifications.ts", operations: ["listAdminNotifications", "markAdminNotificationRead", "markAllAdminNotificationsRead", "dismissAdminNotification"] },
  { file: "admin-publication.ts", operations: ["listPendingPublicationReviews", "requestPropertyPublication", "reviewPropertyPublication"] },
  { file: "seo-redirects.ts", operations: ["listAdminRedirects", "upsertAdminRedirect", "deleteAdminRedirect", "listAdmin404Logs", "clearAdmin404Logs"] },
];
const serverFunctions = await Promise.all(serverFunctionModules.map(({ file }) =>
  readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8"),
));

test("core admin APIs fail with 503 rather than returning empty or successful defaults when DB is unconfigured", () => {
  for (const [index, source] of routes.entries()) {
    assert.match(source, /assertAdminDatabaseConfigured\(dbSource,/,
      `${routePaths[index]} must use the shared fail-closed database guard`);
    const guard = source.indexOf("assertAdminDatabaseConfigured(dbSource");
    const query = source.indexOf("getSql(");
    assert.ok(query < 0 || guard < query, `${routePaths[index]} must guard before querying`);
    assert.doesNotMatch(source, /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*return/);
  }
});

test("admin audit, session, notification, publication and SEO server functions fail closed when DB is unconfigured", () => {
  for (const [index, { file, operations }] of serverFunctionModules.entries()) {
    const source = serverFunctions[index];
    for (const operation of operations) {
      const start = source.indexOf(`export const ${operation}`);
      const next = source.indexOf("export const ", start + 1);
      const block = source.slice(start, next === -1 ? undefined : next);
      assert.notEqual(start, -1, `${file} must export ${operation}`);
      assert.match(block, /assertAdminDatabaseConfigured\(dbSource,/,
        `${operation} must reject an unconfigured database with 503`);
      assert.doesNotMatch(block, /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*return/);
    }
  }
  assert.doesNotMatch(serverFunctions[1], /return \{ success: true, revoked: changed \}/);
  assert.match(serverFunctions[1], /statusCode:\s*409,\s*statusMessage:\s*"نشست مورد نظر قبلاً بسته شده یا وجود ندارد\."/);
  assert.doesNotMatch(serverFunctions[2], /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*return/);
  assert.doesNotMatch(serverFunctions[3], /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*return/);
});

const componentPaths = [
  "admin-agenda.tsx",
  "admin-kpi-history.tsx",
  "admin-watermark-settings.tsx",
  "admin-lead-message-templates.tsx",
  "admin-consultant-targets.tsx",
  "admin-property-lifecycle-panel.tsx",
  "admin-action-center.tsx",
  "admin-customer-property-submissions.tsx",
  "admin-lead-manager.tsx",
  "admin-consultant-performance.tsx",
  "admin-lead-segments.tsx",
  "admin-neighborhood-demand-radar.tsx",
  "admin-owner-manager.tsx",
  "admin-property-duplicate-check.tsx",
  "admin-property-price-history.tsx",
  "admin-property-quality-center.tsx",
  "admin-finance-manager.tsx",
];
const components = await Promise.all(componentPaths.map((name) =>
  readFile(new URL(`../src/components/hirmand/${name}`, import.meta.url), "utf8"),
));

test("admin workspaces show unavailable state instead of empty or zero data", () => {
  for (const name of componentPaths.slice(0, 6)) {
    const source = components[componentPaths.indexOf(name)];
    assert.match(source, /loadError/ , `${name} must track load failure`);
    assert.match(source, /role=["']alert["']/ , `${name} must render an accessible error state`);
  }
  assert.match(components[6], /!loadError\s*\?\s*<div className=["']admin-dashboard-mini-grid/);
  assert.match(components[7], /queueStatsError/);
  assert.match(components[7], /اطلاعات ثبت‌های مشتری در دسترس نیست/);
  assert.match(components[8], /loadError/);
  assert.match(components[8], /AdminErrorBanner/);
});

test("admin reporting and property tools show retryable errors instead of false empty results", () => {
  const consultant = components[componentPaths.indexOf("admin-consultant-performance.tsx")];
  assert.match(consultant, /hasLoaded/);
  assert.match(consultant, /loadError/);
  assert.match(consultant, /role=["']alert["']/);
  assert.match(consultant, /onClick=\{\(\)\s*=>\s*void load\(\)\}/);

  const segments = components[componentPaths.indexOf("admin-lead-segments.tsx")];
  assert.match(segments, /loadError/);
  assert.match(segments, /role=["']alert["']/);
  assert.match(segments, /onClick=\{\(\)\s*=>\s*void load\(\)\}/);

  const neighborhood = components[componentPaths.indexOf("admin-neighborhood-demand-radar.tsx")];
  assert.match(neighborhood, /loadError/);
  assert.match(neighborhood, /catch\s*\(error\)/);
  assert.match(neighborhood, /role=["']alert["']/);
  assert.match(neighborhood, /loadError\s*&&\s*!items\.length\s*\?\s*null/);

  const owners = components[componentPaths.indexOf("admin-owner-manager.tsx")];
  assert.match(owners, /error\s*&&\s*owners\.length\s*===\s*0\s*\?\s*null/);
  assert.match(owners, /role=["']alert["']/);

  const duplicates = components[componentPaths.indexOf("admin-property-duplicate-check.tsx")];
  assert.match(duplicates, /loadError/);
  assert.match(duplicates, /setChecked\(false\)/);
  assert.match(duplicates, /role=["']alert["']/);

  const priceHistory = components[componentPaths.indexOf("admin-property-price-history.tsx")];
  assert.match(priceHistory, /hasLoaded/);
  assert.match(priceHistory, /loadError/);
  assert.match(priceHistory, /role=["']alert["']/);

  const quality = components[componentPaths.indexOf("admin-property-quality-center.tsx")];
  assert.match(quality, /loadError/);
  assert.match(quality, /role=["']alert["']/);
  assert.match(quality, /!currentData\s*&&\s*!loadError/);
});

test("finance ledger distinguishes an unavailable database from a successfully loaded empty ledger", () => {
  const source = components[componentPaths.indexOf("admin-finance-manager.tsx")];
  assert.match(source, /hasLoaded/);
  assert.match(source, /setLoadError\(message\)/);
  assert.match(source, /loadError\s*\?\s*<div className=["']admin-empty["'] role=["']alert["']/);
  assert.match(source, /!loadError&&hasLoaded&&items\.length===0/);
  assert.match(source, /disabled=\{saving\|\|!hasLoaded\|\|/);
});

const adminFailClosedUi = await Promise.all([
  readFile(new URL("../src/components/hirmand/admin-audit-log.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-security-center.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-mobile-management.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-notification-center.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-publication-queue.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-seo-redirects.tsx", import.meta.url), "utf8"),
]);

test("admin audit, session, notification, publication and SEO workspaces show retryable errors", () => {
  assert.match(adminFailClosedUi[0], /loadError/);
  assert.match(adminFailClosedUi[0], /role=["']alert["']/);
  assert.match(adminFailClosedUi[0], /loadError\s*&&\s*!items\.length\s*\?\s*null/);
  assert.match(adminFailClosedUi[1], /loadError/);
  assert.match(adminFailClosedUi[1], /role=["']alert["']/);
  assert.match(adminFailClosedUi[1], /!loadError\s*&&\s*!loading/);
  assert.match(adminFailClosedUi[1], /!!busy\s*\|\|\s*loading\s*\|\|\s*!!loadError/);
  assert.match(adminFailClosedUi[2], /setLoadError\(error\s+instanceof\s+Error\s*\?\s*error\.message/);
  assert.match(adminFailClosedUi[2], /role=["']alert["']/);
  assert.match(adminFailClosedUi[2], /setRetryVersion\(\(current\)\s*=>\s*current\s*\+\s*1\)/);
  assert.match(adminFailClosedUi[3], /loadError/);
  assert.match(adminFailClosedUi[3], /role=["']alert["']/);
  assert.match(adminFailClosedUi[4], /loadError/);
  assert.match(adminFailClosedUi[4], /role=["']alert["']/);
  assert.match(adminFailClosedUi[4], /loadError\s*\?\s*null/);
  assert.match(adminFailClosedUi[5], /loadError/);
  assert.match(adminFailClosedUi[5], /role=["']alert["']/);
  assert.match(adminFailClosedUi[5], /loadError\s*\?\s*null/);
});
