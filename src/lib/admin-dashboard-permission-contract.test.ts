import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasAdminPermission } from "./admin-roles.ts";

test("report-only roles do not have CRM detail permission", () => {
  for (const role of ["content", "viewer"] as const) {
    assert.equal(hasAdminPermission(role, "reports.view"), true);
    assert.equal(hasAdminPermission(role, "lead.manage"), false);
  }
  assert.equal(hasAdminPermission("sales", "lead.manage"), true);
});

test("dashboard recent lead details are not queried without lead.manage", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  assert.match(route, /queryIfAllowed\(canViewLeadDetails,\s*\(\) => sql\.query[\s\S]*?select id, name, phone, deal, neighborhood, status, created_at/);
  assert.match(route, /const canViewLeadDetails = hasAdminPermission\(role, "lead\.manage"\)/);
});

test("dashboard only selects consultant phone columns inside the lead.manage-gated query", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  const firstGuardedQuery = route.indexOf("queryIfAllowed(canViewLeadDetails, () => sql.query", route.indexOf("const [propertyStats"));
  const queryStart = route.indexOf("queryIfAllowed(canViewLeadDetails, () => sql.query", firstGuardedQuery + 1);
  const queryEnd = route.indexOf("[] as Record<string, unknown>[]),", queryStart);
  assert.ok(queryStart >= 0 && queryEnd > queryStart, "consultant detail query must be inside the lead.manage guard");
  const gatedQuery = route.slice(queryStart, queryEnd);
  assert.match(gatedQuery, /select c\.id, c\.name, c\.phone, c\.is_active/);
  assert.doesNotMatch(route.slice(0, queryStart), /select c\.id, c\.name, c\.phone/);
});

test("dashboard skips the complete consultant performance query without lead.manage", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  assert.match(route, /queryIfAllowed\(canViewLeadDetails,\s*\(\) => sql\.query[\s\S]*?with file_stats as \([\s\S]*?from consultants c/);
});

test("dashboard Promise.all results keep the lead SLA and consultant performance queries aligned", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  assert.match(route, /const \[[\s\S]*?consultantStats,\s*leadSla,\s*consultantPerformance\] = await Promise\.all\(/);
  const promiseAllStart = route.indexOf("const [propertyStats");
  const leadSlaQuery = route.indexOf("as new_over_4h", promiseAllStart);
  const consultantPerformanceQuery = route.indexOf("queryIfAllowed(canViewLeadDetails, () => sql.query", route.indexOf("queryIfAllowed(canViewLeadDetails, () => sql.query", promiseAllStart) + 1);
  assert.ok(promiseAllStart >= 0 && leadSlaQuery > promiseAllStart && consultantPerformanceQuery > leadSlaQuery, "the Promise.all query array must keep lead SLA before consultant performance");
});

test("dashboard does not render the latest-leads section without lead.manage", () => {
  const ui = readFileSync(new URL("../../src/components/hirmand/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /\{canManageLeads \? <section className="admin-panel">[\s\S]*?<h2>آخرین درخواست‌ها<\/h2>[\s\S]*?<\/section> : null\}/);
  assert.match(ui, /withFiles: number \| null/);
});
