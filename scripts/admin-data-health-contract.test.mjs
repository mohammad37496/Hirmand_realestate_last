import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/admin-data-health.post.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/hirmand/admin-data-health.tsx", import.meta.url), "utf8");

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
