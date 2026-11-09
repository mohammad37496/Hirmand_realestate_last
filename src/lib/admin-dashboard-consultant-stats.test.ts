import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAdminDashboardConsultantStats } from "./admin-dashboard-consultant-stats.ts";
import type { Sql } from "./db.ts";

test("dashboard consultant stats return real aggregate values", async () => {
  const sql = {
    query: async <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) =>
      [{ total: 4, active: 3, consultants_with_files: 2, consultants_with_leads: 3 }] as T[],
  } as Sql;
  assert.deepEqual(await loadAdminDashboardConsultantStats(sql), [
    { total: 4, active: 3, consultants_with_files: 2, consultants_with_leads: 3 },
  ]);
});

test("dashboard consultant stats propagate query failures instead of returning a zero aggregate", async () => {
  const sql = {
    query: <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) =>
      Promise.reject(new Error("dashboard consultant query unavailable")) as Promise<T[]>,
  } as Sql;
  await assert.rejects(loadAdminDashboardConsultantStats(sql), /dashboard consultant query unavailable/);
});
