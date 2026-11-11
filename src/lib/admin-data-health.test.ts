import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { Sql } from "./db.ts";
import { loadAdminDataHealthChecks } from "./admin-data-health.ts";

function createSql(results: Array<unknown[] | Error>) {
  const calls: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string) => {
      calls.push(text);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return (result ?? []) as T[];
    },
  } as unknown as Pick<Sql, "query">;
  return { sql, calls };
}

describe("admin data health integrity checks", () => {
  for (const failedQuery of [0, 1, 2, 3, 4]) {
    it(`propagates failure from integrity check ${failedQuery + 1}`, async () => {
      const results = Array.from({ length: 5 }, (_, index) =>
        index === failedQuery ? new Error(`check ${index + 1} unavailable`) : [],
      );
      const { sql, calls } = createSql(results);

      await assert.rejects(loadAdminDataHealthChecks(sql), new RegExp(`check ${failedQuery + 1} unavailable`));
      assert.equal(calls.length, 5);
    });
  }

  it("returns all five result sets when every integrity check succeeds", async () => {
    const expected = [[{ id: "orphan" }], [{ id: "consultant" }], [{ id: "property" }], [{ phone: "0912" }], [{ id: "coordinate" }]];
    const { sql, calls } = createSql([...expected]);

    const result = await loadAdminDataHealthChecks(sql);

    assert.deepEqual(result, expected);
    assert.equal(calls.length, 5);
  });
});

it("admin management report fails closed instead of returning fabricated empty totals", async () => {
  const route = await readFile(new URL("../../server/routes/api/admin-management-report.get.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/hirmand/admin-management-report.tsx", import.meta.url), "utf8");
  const guard = route.indexOf('dbSource === "unconfigured"');
  assert.ok(guard >= 0);
  assert.match(route, /dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.ok(guard < route.indexOf("getSql()"));
  assert.doesNotMatch(route, /return \{ days: 30, properties:\{\}, leads:\{\}, deals:\{\}, finance:null, topConsultants:\[\] \}/);
  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /تلاش دوباره/);
  assert.match(component, /data\s*\?\s*"به‌روزرسانی گزارش مدیریتی ناموفق بود\."/);
});
