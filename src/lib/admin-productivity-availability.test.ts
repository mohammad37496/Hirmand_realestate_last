import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("productivity API refuses unavailable reads and writes instead of returning false empty data", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-productivity.post.ts", import.meta.url), "utf8");
  const bodyIndex = route.indexOf("const body = (await readBody(event)");
  const actionIndex = route.indexOf('const action = body.action ?? "summary"');
  const unavailableIndex = route.indexOf('if (dbSource === "unconfigured")');

  assert.ok(bodyIndex >= 0 && actionIndex > bodyIndex && unavailableIndex > actionIndex);
  assert.match(route, /statusCode:\s*503/);
  assert.doesNotMatch(route, /database:\s*"unconfigured"[\s\S]{0,160}counts:\s*\{\}/);
  assert.doesNotMatch(route, /\.catch\(\(\) => \[\{ count: null \}\]\)/);
  assert.match(route, /loadAdminProductivityTableCounts/);
  assert.match(route, /available:\s*true/);
});

test("productivity panels clear stale data and verify every successful write response", () => {
  const ui = readFileSync(new URL("../components/hirmand/admin-productivity-center.tsx", import.meta.url), "utf8");
  const propertyPerformance = readFileSync(new URL("../components/hirmand/admin-property-performance.tsx", import.meta.url), "utf8");

  assert.match(ui, /summary\.available !== true \|\| taskResult\.available !== true/);
  assert.match(ui, /setData\(null\)/);
  assert.match(ui, /setTasks\(\[\]\)/);
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /<AdminErrorBanner/);
  assert.match(ui, /result\.task\?\.id/);
  assert.match(ui, /result\.success !== true/);
  assert.match(propertyPerformance, /!response\.ok \|\| !result\?\.task\?\.id/);
});
