import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, component, helper] = await Promise.all([
  readFile(new URL("../server/routes/api/admin-productivity.post.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-productivity-center.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/admin-productivity-health.ts", import.meta.url), "utf8"),
]);

test("productivity route fails closed when the database is unconfigured and uses explicit counter health", () => {
  assert.match(route, /loadAdminProductivitySystemCounts\(sql\)/);
  assert.match(route, /isAdminProductivityTimeoutError\(error\)/);
  assert.match(route, /statusCode: 504/);
  assert.match(route, /if \(dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\[\{\s*count:\s*null\s*\}\]\)/);
  assert.match(helper, /"healthy"\s*\|\s*"degraded"\s*\|\s*"error"\s*\|\s*"timeout"/);
  assert.match(helper, /lastSuccessfulAt: status === "healthy" \? generatedAt : null/);
  assert.match(helper, /counter\.core/);
});

test("productivity UI does not show zero or green health after failed loads or unavailable counters", () => {
  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /تلاش دوباره/);
  assert.match(component, /value == null \? "—"/);
  assert.match(component, /data\.system\.counterStatus\[key\]/);
  assert.match(component, /loadRequestId\.current \+= 1/);
  assert.match(component, /data\?\.system\.lastSuccessfulAt/);
  assert.match(component, /پاسخ مرکز بهره‌وری ناقص است/);
  assert.match(component, /Array\.isArray\(results\[1\]\?\.tasks\)/);
});
