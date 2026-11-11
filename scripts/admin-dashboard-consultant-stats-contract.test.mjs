import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("dashboard consultant aggregate failures reject the API and reach the existing dashboard error banner", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-dashboard-consultant-stats.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-dashboard.tsx", import.meta.url), "utf8");

  assert.match(route, /loadAdminDashboardConsultantStats\(sql\)/);
  assert.match(route, /loadAdminDashboardConsultantPerformance\(sql\)/);
  assert.doesNotMatch(route, /consultant stats unavailable|consultant performance unavailable/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /setLoadError\(error instanceof Error/);
  assert.match(component, /<AdminErrorBanner message=\{loadError\}/);
  assert.match(component, /loadRequestId\.current \+= 1/);
  assert.match(component, /پاسخ داشبورد ناقص است/);
});

test("dashboard core CRM failures propagate while optional telemetry failures stay visibly unavailable", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  const optionalQuery = await readFile(new URL("../src/lib/admin-dashboard-optional-query.ts", import.meta.url), "utf8");
  const summary = await readFile(new URL("../src/lib/admin-dashboard-summary.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-dashboard.tsx", import.meta.url), "utf8");

  for (const section of ["visitorStats", "activeVisitorStats", "visitorDays", "topPages", "topProperties", "eventStats", "visitorSources"]) {
    assert.match(route, new RegExp(`loadAdminDashboardOptionalQuery\\("${section}"`));
  }
  assert.match(route, /unavailableSections/);
  assert.match(route, /timedOutSections/);
  assert.match(route, /hasCompleteAdminDashboardSummaryRows/);
  assert.match(route, /if \(dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(route, /if \(dbSource === "unconfigured"\)\s*\{\s*return \{/);
  assert.match(route, /from leads\s+`\),\s+loadAdminDashboardConsultantStats/);
  assert.match(route, /from leads l`\s+\),\s+loadAdminDashboardConsultantPerformance/);
  assert.match(route, /visitorSourcesResult, followUps, consultantStats, leadSla, consultantPerformance\] = await Promise\.all/);
  assert.doesNotMatch(route, /follow-up stats unavailable|lead SLA unavailable/);
  assert.match(optionalQuery, /available: true/);
  assert.match(optionalQuery, /available: false/);
  assert.match(optionalQuery, /timedOut: isTimeout\(error\)/);
  assert.match(summary, /input\.propertyStats\[0\]/);
  assert.match(component, /unavailableSections\?\.includes\(section\)/);
  assert.match(component, /timedOutSections\?\.includes\(section\)/);
  assert.match(component, /مهلت بررسی تمام شد/);
  assert.match(component, /آمار صفحات در دسترس نیست/);
  assert.match(component, /آمار رویدادها در دسترس نیست/);
  assert.match(component, /visitorStatsUnavailable \? "نامشخص"/);
  assert.match(component, /value: visitorStatsUnavailable \? "نامشخص" : data\.visitors\.today/);
  assert.match(component, /visitorStatsUnavailable \? "نامشخص" : fa\(data\.visitors\.last7\)/);
  assert.match(component, /data\.topPages\.length === 0/);
});
