import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadAdminSalesControlCenterQueries } from "./admin-sales-control-center.ts";
import type { Sql } from "./db.ts";

test("sales control center returns consultant and pipeline data when both queries succeed", async () => {
  let calls = 0;
  const queries: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, _params: unknown[] = []) => {
      queries.push(text);
      return [{ id: String(++calls) }] as T[];
    },
  } as Sql;
  const [consultants, pipeline] = await loadAdminSalesControlCenterQueries(sql, 30);
  assert.equal(calls, 2);
  assert.deepEqual(consultants, [{ id: "1" }]);
  assert.deepEqual(pipeline, [{ id: "2" }]);
  assert.match(queries[0], /select c\.id as key/);
  assert.match(queries[0], /join consultants c on c\.id = p\.consultant_id/);
  assert.match(queries[0], /left join file_stats fs on fs\.key = c\.id/);
  assert.doesNotMatch(queries[0], /contact_name/);
});

for (const fragment of ["with file_stats", "from leads\n       where created_at"]) {
  test(`sales control center propagates ${fragment} database failures`, async () => {
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, _params: unknown[] = []) => {
        if (text.includes(fragment)) return Promise.reject(new Error("sales report database unavailable")) as Promise<T[]>;
        return [] as T[];
      },
    } as Sql;
    await assert.rejects(loadAdminSalesControlCenterQueries(sql, 30), /sales report database unavailable/);
  });
}

test("admin sales funnel fails closed instead of returning a malformed empty report", async () => {
  const route = await readFile(new URL("../../server/routes/api/admin-sales-funnel.get.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/hirmand/admin-sales-funnel.tsx", import.meta.url), "utf8");
  const guard = route.indexOf('dbSource === "unconfigured"');
  assert.ok(guard >= 0);
  assert.match(route, /dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.ok(guard < route.indexOf("getSql()"));
  assert.doesNotMatch(route, /return \{ days: 30, statuses: \[\], sources: \[\], aging: \[\], conversions: \{\} \}/);
  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /تلاش دوباره/);
  assert.match(component, /data\s*\?\s*"به‌روزرسانی قیف فروش ناموفق بود\."/);
});
