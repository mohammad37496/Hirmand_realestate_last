import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadAdminCampaignPerformanceQueries } from "./admin-campaign-performance.ts";
import type { Sql } from "./db.ts";

const queries = ["group by 1,2,3", "generate_series", "as medium"];

test("campaign performance returns all three datasets when every query succeeds", async () => {
  let calls = 0;
  const sql = {
    query: async <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) => [{ id: String(++calls) }] as T[],
  } as Sql;
  const result = await loadAdminCampaignPerformanceQueries(sql, 30);
  assert.equal(calls, 3);
  assert.deepEqual(result, {
    rows: [{ id: "1" }],
    daily: [{ id: "2" }],
    quality: [{ id: "3" }],
  });
});

for (const fragment of queries) {
  test(`campaign performance propagates ${fragment} query failures`, async () => {
    const sql = {
      query: async <T = Record<string, unknown>>(text: string) => {
        if (text.includes(fragment)) throw new Error("campaign query unavailable");
        return [] as T[];
      },
    } as Sql;
    await assert.rejects(loadAdminCampaignPerformanceQueries(sql, 30), /campaign query unavailable/);
  });
}

test("admin finance insights fail closed instead of rendering an unconfigured database as zero finance", async () => {
  const route = await readFile(new URL("../../server/routes/api/admin-finance-insights.get.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/hirmand/admin-finance-insights.tsx", import.meta.url), "utf8");
  const guard = route.indexOf('dbSource==="unconfigured"');
  assert.ok(guard >= 0);
  assert.match(route, /if\(dbSource==="unconfigured"\)\s*throw createError\(\{statusCode:503/);
  assert.ok(guard < route.indexOf("getSql()"));
  assert.doesNotMatch(route, /return\s*\{months:\[\],categories:\[\],consultants:\[\],outstanding:0\}/);
  assert.match(component, /useState<Data\|null>\(null\)/);
  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /تلاش دوباره/);
  assert.match(component, /data\?"به‌روزرسانی گزارش مالی ناموفق بود\."/);
});
