import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const leadsRoute = await readFile(
  new URL("../server/routes/api/leads.post.ts", import.meta.url),
  "utf8",
);
const reportsRoute = await readFile(
  new URL("../server/routes/api/property-reports.post.ts", import.meta.url),
  "utf8",
);
const shortlistRoute = await readFile(
  new URL("../server/routes/api/shared-shortlist.post.ts", import.meta.url),
  "utf8",
);
const publicLeadActionsRoute = await readFile(
  new URL("../server/routes/api/public-lead-actions.post.ts", import.meta.url),
  "utf8",
);

const leadsAdminRoute = await readFile(
  new URL("../server/routes/api/leads-admin.post.ts", import.meta.url),
  "utf8",
);
const adminFinanceRoute = await readFile(
  new URL("../server/routes/api/admin-finance.post.ts", import.meta.url),
  "utf8",
);
const adminDealsRoute = await readFile(
  new URL("../server/routes/api/admin-deals.post.ts", import.meta.url),
  "utf8",
);
const adminPropertyLifecycleRoute = await readFile(
  new URL("../server/routes/api/admin-property-lifecycle.post.ts", import.meta.url),
  "utf8",
);
const adminPropertyExpiryRoute = await readFile(
  new URL("../server/routes/api/admin-property-expiry.post.ts", import.meta.url),
  "utf8",
);
const adminVisitFeedbackRoute = await readFile(
  new URL("../server/routes/api/admin-visit-feedback.post.ts", import.meta.url),
  "utf8",
);
const propertyQuestionsRoute = await readFile(
  new URL("../server/routes/api/property-questions.post.ts", import.meta.url),
  "utf8",
);
const propertyWatchTargetRoute = await readFile(
  new URL("../server/routes/api/property-watch-target.post.ts", import.meta.url),
  "utf8",
);
const propertyViewingSlotsRoute = await readFile(
  new URL("../server/routes/api/property-viewing-slots.get.ts", import.meta.url),
  "utf8",
);
const propertyWatchRoute = await readFile(
  new URL("../server/routes/api/property-watch.post.ts", import.meta.url),
  "utf8",
);
const adminDashboardRoute = await readFile(
  new URL("../server/routes/api/admin-dashboard.post.ts", import.meta.url),
  "utf8",
);
const adminDataHealthRoute = await readFile(
  new URL("../server/routes/api/admin-data-health.post.ts", import.meta.url),
  "utf8",
);
const customerWorkspaceGetRoute = await readFile(
  new URL("../server/routes/api/customer-workspace.get.ts", import.meta.url),
  "utf8",
);
const customerWorkspacePostRoute = await readFile(
  new URL("../server/routes/api/customer-workspace.post.ts", import.meta.url),
  "utf8",
);
const ownerPropertyStatusRoute = await readFile(
  new URL("../server/routes/api/owner-property-status.post.ts", import.meta.url),
  "utf8",
);
const customerChatGetRoute = await readFile(
  new URL("../server/routes/api/customer-chat.get.ts", import.meta.url),
  "utf8",
);
const customerChatPostRoute = await readFile(
  new URL("../server/routes/api/customer-chat.post.ts", import.meta.url),
  "utf8",
);
const publicLeadTrackingRoute = await readFile(
  new URL("../server/routes/api/public-lead-tracking.get.ts", import.meta.url),
  "utf8",
);
const adminActionCenterRoute = await readFile(
  new URL("../server/routes/api/admin-action-center.post.ts", import.meta.url),
  "utf8",
);
const adminAgendaRoute = await readFile(
  new URL("../server/routes/api/admin-agenda.post.ts", import.meta.url),
  "utf8",
);
const adminFinanceInsightsRoute = await readFile(
  new URL("../server/routes/api/admin-finance-insights.get.ts", import.meta.url),
  "utf8",
);
const adminKpiSnapshotRoute = await readFile(
  new URL("../server/routes/api/admin-kpi-snapshot.post.ts", import.meta.url),
  "utf8",
);
const adminManagementReportRoute = await readFile(
  new URL("../server/routes/api/admin-management-report.get.ts", import.meta.url),
  "utf8",
);
const adminOperationsRoute = await readFile(
  new URL("../server/routes/api/admin-operations.post.ts", import.meta.url),
  "utf8",
);
const adminPhoneBridgeRoute = await readFile(
  new URL("../server/routes/api/admin-phone-bridge.post.ts", import.meta.url),
  "utf8",
);
const adminProductivityRoute = await readFile(
  new URL("../server/routes/api/admin-productivity.post.ts", import.meta.url),
  "utf8",
);
const adminSalesFunnelRoute = await readFile(
  new URL("../server/routes/api/admin-sales-funnel.get.ts", import.meta.url),
  "utf8",
);
const adminSalesControlCenterRoute = await readFile(
  new URL("../server/routes/api/admin-sales-control-center.post.ts", import.meta.url),
  "utf8",
);
const adminWatermarkRoute = await readFile(
  new URL("../server/routes/api/admin-watermark.post.ts", import.meta.url),
  "utf8",
);
const customerPropertySubmissionRoute = await readFile(
  new URL("../server/routes/api/customer-property-submissions.post.ts", import.meta.url),
  "utf8",
);
const adminCustomerPropertySubmissionRoute = await readFile(
  new URL("../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url),
  "utf8",
);
const musicRoute = await readFile(
  new URL("../server/routes/api/music.get.ts", import.meta.url),
  "utf8",
);
const musicAdminRoute = await readFile(
  new URL("../server/routes/api/music-admin.post.ts", import.meta.url),
  "utf8",
);
const dbHelper = await readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8");

test("public lead intake checks origin and applies a rate limit before parsing or writing", () => {
  assert.match(leadsRoute, /assertSameOrigin\(event\)/);
  assert.match(leadsRoute, /consumeAdminAttempt\(["']public-lead:["']\s*\+\s*clientFingerprint\(event\)\)/);

  const throttleIndex = leadsRoute.indexOf('consumeAdminAttempt("public-lead:"');
  const bodyParseIndex = leadsRoute.indexOf("schema.safeParse(await readBody(event))");
  assert.ok(throttleIndex >= 0 && bodyParseIndex > throttleIndex);
});

test("public property reports check origin and apply a rate limit before database writes", () => {
  const originIndex = reportsRoute.indexOf("assertSameOrigin(event);");
  const bodyReadIndex = reportsRoute.indexOf("readBody(event)");
  const publicBranchIndex = reportsRoute.indexOf("if (!wantsAdmin)");
  const throttleIndex = reportsRoute.indexOf('consumeAdminAttempt("property-report:"');
  const payloadParseIndex = reportsRoute.indexOf("publicSchema.safeParse(body)");
  assert.ok(originIndex >= 0 && bodyReadIndex > originIndex);
  assert.ok(publicBranchIndex > bodyReadIndex && throttleIndex > publicBranchIndex);
  assert.ok(payloadParseIndex > throttleIndex);
});

test("shared-shortlist creation checks origin and rate-limits writes before database access", () => {
  assert.ok(shortlistRoute.includes("assertSameOrigin(event)"));
  assert.ok(shortlistRoute.includes('consumeAdminAttempt("shared-shortlist:" + clientFingerprint(event))'));
  const throttleIndex = shortlistRoute.indexOf('consumeAdminAttempt("shared-shortlist:"');
  const parseIndex = shortlistRoute.indexOf("schema.safeParse(await readBody(event))");
  assert.ok(throttleIndex >= 0 && parseIndex > throttleIndex);
});

test("public lead actions check origin and rate-limit capability-token operations", () => {
  assert.ok(publicLeadActionsRoute.includes("assertSameOrigin(event)"));
  assert.ok(publicLeadActionsRoute.includes('consumeAdminAttempt("public-lead-action:" + clientFingerprint(event))'));
  const throttleIndex = publicLeadActionsRoute.indexOf('consumeAdminAttempt("public-lead-action:"');
  const databaseCheckIndex = publicLeadActionsRoute.indexOf('dbSource === "unconfigured"');
  assert.ok(throttleIndex >= 0 && databaseCheckIndex > throttleIndex);
});


test("database-backed CRM, finance, workspace, and property APIs fail explicitly without a database", () => {
  for (const [name, source] of [
    ["leads-admin", leadsAdminRoute],
    ["admin-finance", adminFinanceRoute],
    ["admin deals", adminDealsRoute],
    ["property lifecycle", adminPropertyLifecycleRoute],
    ["property expiry", adminPropertyExpiryRoute],
    ["visit feedback", adminVisitFeedbackRoute],
    ["property questions", propertyQuestionsRoute],
    ["property watch target", propertyWatchTargetRoute],
    ["workspace GET", customerWorkspaceGetRoute],
    ["workspace POST", customerWorkspacePostRoute],
    ["property viewing slots", propertyViewingSlotsRoute],
    ["property watch", propertyWatchRoute],
    ["owner property status", ownerPropertyStatusRoute],
  ]) {
    assert.match(source, /statusCode\s*:\s*503/, name + " must use HTTP 503");
  }
  assert.doesNotMatch(leadsAdminRoute, /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*return\s*\{\s*leads\s*:\s*\[\]/);
  assert.doesNotMatch(adminFinanceRoute, /summary\s*:\s*\{\s*income\s*:\s*0,\s*expense\s*:\s*0,\s*balance\s*:\s*0/);
  assert.doesNotMatch(propertyViewingSlotsRoute, /success\s*:\s*true,\s*occupiedTimes\s*:\s*\[\]/);
});

test("admin dashboard and data-health checks do not turn SQL failures into fake empty/healthy results", () => {
  assert.match(adminDashboardRoute, /statusCode\s*:\s*503/);
  assert.doesNotMatch(adminDashboardRoute, /return\s*\[\s*\{\s*\}\s*\]/);
  assert.doesNotMatch(adminDashboardRoute, /visitor stats unavailable/);
  assert.match(adminDataHealthRoute, /statusCode\s*:\s*503/);
  assert.doesNotMatch(adminDataHealthRoute, /\.catch\(\(\)\s*=>\s*\[\s*\]\)/);
  assert.doesNotMatch(adminDataHealthRoute, /summary\s*:\s*\{\s*critical\s*:\s*0,\s*warning\s*:\s*0,\s*info\s*:\s*0,\s*open\s*:\s*0/);
});


test("public customer tracking endpoints normalize codes and rate-limit access", () => {
  assert.match(customerChatGetRoute, /replace\(\/\\s\+\/g/);
  for (const [name, source] of [
    ["customer chat GET", customerChatGetRoute],
    ["customer chat POST", customerChatPostRoute],
    ["public lead tracking", publicLeadTrackingRoute],
  ]) {
    assert.match(source, /consumeAdminAttempt\(/, name + " must rate-limit requests");
    assert.match(source, /tooManyAttemptsError\(/, name + " must return a throttling error");
  }
  assert.match(customerChatGetRoute, /cache-control", "no-store"/);
});


test("admin reporting endpoints do not present fake empty/zero data when the database is not configured", () => {
  for (const [name, source] of [
    ["action center", adminActionCenterRoute],
    ["agenda", adminAgendaRoute],
    ["finance insights", adminFinanceInsightsRoute],
    ["KPI snapshots", adminKpiSnapshotRoute],
    ["management report", adminManagementReportRoute],
    ["operations dashboard", adminOperationsRoute],
    ["Phone Bridge admin", adminPhoneBridgeRoute],
    ["productivity report", adminProductivityRoute],
    ["sales funnel", adminSalesFunnelRoute],
    ["sales control center", adminSalesControlCenterRoute],
    ["watermark admin", adminWatermarkRoute],
    ["music GET", musicRoute],
    ["music admin", musicAdminRoute],
  ]) {
    assert.match(source, /statusCode\s*:\s*503/, name + " should report DB unavailability as HTTP 503");
  }
  assert.doesNotMatch(adminProductivityRoute, /\.catch\(\(\)\s*=>\s*\[\s*\{\s*count\s*:\s*null\s*\}\s*\]\)/);
  assert.doesNotMatch(adminSalesControlCenterRoute, /consultant query unavailable/);
});

test("customer property creation and publication use transactions for related records", () => {
  assert.match(dbHelper, /export async function withSqlTransaction/);
  assert.match(dbHelper, /client\.query\("BEGIN"\)/);
  assert.match(dbHelper, /client\.query\("COMMIT"\)/);
  assert.match(dbHelper, /client\.query\("ROLLBACK"\)/);
  assert.match(customerPropertySubmissionRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(customerPropertySubmissionRoute, /pg_advisory_xact_lock/);
  assert.match(adminCustomerPropertySubmissionRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(adminCustomerPropertySubmissionRoute, /status='pending' returning id/);
  assert.doesNotMatch(adminCustomerPropertySubmissionRoute, /events = await sql\.query[\s\S]{0,300}\.catch\(\(\) => \[\]/);
});
