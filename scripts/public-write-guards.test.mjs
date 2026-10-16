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
