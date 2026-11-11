import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/admin-data-health.post.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/hirmand/admin-data-health.tsx", import.meta.url), "utf8");
const propertyScheduleSource = await readFile(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const propertyExpiryRoute = await readFile(new URL("../server/routes/api/admin-property-expiry.post.ts", import.meta.url), "utf8");
const scheduleManager = await readFile(new URL("../src/components/hirmand/admin-schedule-manager.tsx", import.meta.url), "utf8");
const expiryManager = await readFile(new URL("../src/components/hirmand/admin-property-expiry.tsx", import.meta.url), "utf8");

test("admin data health scans fail closed when any integrity query is unavailable", () => {
  assert.match(route, /loadAdminDataHealthChecks\(sql\)/);
  assert.match(route, /statusCode:\s*503/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.doesNotMatch(route, /dbSource === "unconfigured"\) return \{ scannedAt/);
  assert.ok(route.indexOf("loadAdminDataHealthChecks(sql)") < route.indexOf("insert into admin_data_health_findings"));

  assert.match(component, /scanError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!scanError && data/);
  assert.match(component, /تلاش دوباره/);
});

test("admin property schedule and expiry views fail closed when the database is unconfigured", () => {
  const scheduleStart = propertyScheduleSource.indexOf("export const listAdminPropertySchedules =");
  const scheduleEnd = propertyScheduleSource.indexOf("export const updatePropertySchedule =", scheduleStart);
  assert.notEqual(scheduleStart, -1);
  assert.notEqual(scheduleEnd, -1);
  const scheduleHandler = propertyScheduleSource.slice(scheduleStart, scheduleEnd);
  const scheduleGuard = scheduleHandler.indexOf('dbSource === "unconfigured"');
  assert.ok(scheduleGuard >= 0, "schedule list must explicitly guard an unconfigured database");
  assert.match(scheduleHandler, /throw createError\(\{\s*statusCode:\s*503/);
  assert.ok(scheduleGuard < scheduleHandler.indexOf("getSql()"), "schedule list must fail before attempting a query");
  assert.doesNotMatch(scheduleHandler, /return\s+\[\]/, "an unavailable database must not become an empty schedule list");

  const expiryGuard = propertyExpiryRoute.indexOf('dbSource==="unconfigured"');
  assert.ok(expiryGuard >= 0, "expiry API must explicitly guard an unconfigured database");
  assert.match(propertyExpiryRoute, /dbSource==="unconfigured"\)throw createError\(\{statusCode:503/);
  assert.ok(expiryGuard < propertyExpiryRoute.indexOf("getSql()"), "expiry API must fail before attempting a query");
  assert.doesNotMatch(propertyExpiryRoute, /return\s*\{expired:\[\],soon:\[\],review:\[\]/);

  for (const component of [scheduleManager, expiryManager]) {
    assert.match(component, /loadError/);
    assert.match(component, /hasLoaded/);
    assert.match(component, /role="alert"/);
    assert.match(component, /تلاش دوباره/);
  }
});
