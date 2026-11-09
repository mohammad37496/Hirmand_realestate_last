import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAdminSalesControlCenterQueries } from "./admin-sales-control-center.ts";
import type { Sql } from "./db.ts";

test("sales control center returns consultant and pipeline data when both queries succeed", async () => {
  let calls = 0;
  const sql = {
    query: async <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) => [{ id: String(++calls) }] as T[],
  } as Sql;
  const [consultants, pipeline] = await loadAdminSalesControlCenterQueries(sql, 30);
  assert.equal(calls, 2);
  assert.deepEqual(consultants, [{ id: "1" }]);
  assert.deepEqual(pipeline, [{ id: "2" }]);
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
