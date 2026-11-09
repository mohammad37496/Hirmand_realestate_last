import assert from "node:assert/strict";
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
