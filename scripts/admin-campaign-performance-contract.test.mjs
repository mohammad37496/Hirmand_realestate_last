import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("campaign performance query and UI failures are not rendered as a valid empty report", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-campaign-performance.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-campaign-performance.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-campaign-performance.tsx", import.meta.url), "utf8");

  assert.match(route, /loadAdminCampaignPerformanceQueries\(sql, days\)/);
  assert.doesNotMatch(route, /grouped query unavailable|daily query unavailable|quality query unavailable/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /setLoadError\(error instanceof Error\?error\.message/);
  assert.match(component, /role="alert"/);
  assert.match(component, /load\(days\)/);
  assert.doesNotMatch(component, /setData\(\{days:range,rows:\[\],daily:\[\]/);
});
