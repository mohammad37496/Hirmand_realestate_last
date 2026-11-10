import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("sales control center query failures are not reported as zero consultants or an empty pipeline", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-sales-control-center.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-sales-control-center.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-sales-control-center.tsx", import.meta.url), "utf8");

  assert.match(route, /loadAdminSalesControlCenterQueries\(sql, days as 7 \| 30 \| 90\)/);
  assert.doesNotMatch(route, /consultant query unavailable|pipeline query unavailable|\.catch\(\(error\)/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /role="alert"/);
  assert.match(component, /error && !data \? null :/);
  assert.match(component, /setError\(loadError instanceof Error/);
});
