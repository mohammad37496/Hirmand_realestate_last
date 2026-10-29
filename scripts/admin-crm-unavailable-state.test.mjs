import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("message-template API distinguishes an unconfigured database from an available template list", () => {
  const route = read("server/routes/api/admin-message-templates.post.ts");
  assert.match(route, /dbSource === "unconfigured"\) \{\s*if \(action === "list"\) return \{ available: false, templates: \[\] \};\s*throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: true,\s*templates: rows\.map/);
});

test("message-template UI keeps API errors visible and disables writes until templates are available", () => {
  const ui = read("src/components/hirmand/admin-lead-message-templates.tsx");
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === false && !loadError/);
  assert.match(ui, /disabled=\{saving \|\| available !== true\}/);
  assert.match(ui, /loadError && !templates\.length \? null/);
});

test("lead CRM does not report successful mutations or an empty list when the database is unconfigured", () => {
  const route = read("server/routes/api/leads-admin.post.ts");
  const ui = read("src/components/hirmand/admin-lead-manager.tsx");
  const fixture = read("scripts/admin-fixtures.mjs");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(!body\.action \|\| body\.action === "list"\) return \{ available: false, leads: \[\], total: 0 \};\s*throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: true,\s*total: Number\(countRows\[0\]\?\.count\)/);
  assert.match(ui, /data\.available === false/);
  assert.match(ui, /loadError && filteredLeads\.length === 0/);
  assert.match(fixture, /JSON\.stringify\(\{ available: true, total, leads:/);
});

test("action center distinguishes an unavailable database and refuses task completion without storage", () => {
  const route = read("server/routes/api/admin-action-center.post.ts");
  const ui = read("src/components/hirmand/admin-action-center.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(body\.action === "completeTask"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: false, summary:/);
  assert.match(route, /available: true,\s*summary:/);
  assert.match(ui, /typeof result\?\.available !== "boolean"/);
  assert.match(ui, /available === false \?\s*\(\s*<AdminErrorBanner/);
  assert.match(ui, /available === true \? summary\.total/);
});

test("admin agenda distinguishes an empty schedule from unavailable or failed data", () => {
  const route = read("server/routes/api/admin-agenda.post.ts");
  const ui = read("src/components/hirmand/admin-agenda.tsx");
  assert.match(route, /dbSource === "unconfigured"\) return \{ available: false,/);
  assert.match(route, /available: true,/);
  assert.match(ui, /typeof payload\?\.available!=="boolean"/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /data\?\.available===false \? <AdminErrorBanner/);
  assert.doesNotMatch(ui, /setData\(\{overdueFollowUps:\[\],upcomingVisits:\[\],upcomingCallbacks:\[\]\}\)/);
});

test("customer property submission queue distinguishes unavailable storage from a genuinely empty queue", () => {
  const route = read("server/routes/api/admin-customer-property-submissions.post.ts");
  const ui = read("src/components/hirmand/admin-customer-property-submissions.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(action !== "list"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: false,[\s\S]*submissions: \[\]/);
  assert.match(route, /available: true,[\s\S]*submissions: rows\.map/);
  assert.match(ui, /typeof data\?\.available !== "boolean"/);
  assert.match(ui, /available === false \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !loadError \? <>/);
  const loadCatch = ui.split("} catch (error) {")[1]?.split("} finally")[0] ?? "";
  assert.doesNotMatch(loadCatch, /setSubmissions\(\[\]\)/);
});

test("sales control center does not turn unavailable or failed analytics queries into zero performance", () => {
  const route = read("server/routes/api/admin-sales-control-center.post.ts");
  const ui = read("src/components/hirmand/admin-sales-control-center.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*return \{\s*available: false,/);
  assert.match(route, /return \{\s*available: true,/);
  assert.doesNotMatch(route, /consultant query unavailable|pipeline query unavailable|\)\.catch\(\(error\)/);
  assert.match(ui, /!result \|\| typeof result\.available !== "boolean"/);
  assert.match(ui, /data\?\.available === true && !error \? <>/);
  assert.match(ui, /error \? <div className="admin-sales-error" role="alert">/);
  assert.match(ui, /onClick=\{\(\) => void load\(days\)\}/);
});

test("owner directory distinguishes unavailable property data from no registered owners", () => {
  const route = read("server/routes/api/admin-owners.post.ts");
  const ui = read("src/components/hirmand/admin-owner-manager.tsx");
  assert.match(route, /available: false, owners: \[\]/);
  assert.match(route, /available: true,[\s\S]*owners: rows\.map/);
  assert.match(ui, /typeof data\.available!=="boolean"/);
  assert.match(ui, /error\?<AdminErrorBanner/);
  assert.match(ui, /available!==true\?/);
  assert.match(ui, /available===true&&!error\?/);
});

test("KPI history distinguishes an unavailable database from a day without a snapshot", () => {
  const route = read("server/routes/api/admin-kpi-snapshot.post.ts");
  const ui = read("src/components/hirmand/admin-kpi-history.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(String\(query\.action \?\? ""\) === "sync"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /return \{ available: false, snapshots: \[\] \}/);
  assert.match(route, /available: true,/);
  assert.match(ui, /typeof data\.available !== "boolean"/);
  assert.match(ui, /error \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !latest \? <div className="admin-empty">هنوز snapshot/);
});

test("finance insights do not report zero revenue or settlements when the database is unavailable", () => {
  const route = read("server/routes/api/admin-finance-insights.get.ts");
  const ui = read("src/components/hirmand/admin-finance-insights.tsx");
  assert.match(route, /available:false,months:\[\],categories:\[\],consultants:\[\],outstanding:0/);
  assert.match(route, /available:true,/);
  assert.match(ui, /typeof result\.available !== "boolean"/);
  assert.match(ui, /error \? <AdminErrorBanner/);
  assert.match(ui, /data\?\.available \? <>/);
});
