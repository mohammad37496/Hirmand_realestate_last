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
];
const routes = await Promise.all(routePaths.map((name) =>
  readFile(new URL(`../server/routes/api/${name}`, import.meta.url), "utf8"),
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

const componentPaths = [
  "admin-agenda.tsx",
  "admin-kpi-history.tsx",
  "admin-watermark-settings.tsx",
  "admin-lead-message-templates.tsx",
  "admin-consultant-targets.tsx",
  "admin-property-lifecycle-panel.tsx",
  "admin-action-center.tsx",
  "admin-customer-property-submissions.tsx",
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
});
