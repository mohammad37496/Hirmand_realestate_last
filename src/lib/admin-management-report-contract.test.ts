import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyAdminManagementReport } from "./admin-management-report-contract.ts";

test("unconfigured management report keeps every field the report UI and CSV consume", () => {
  const report = emptyAdminManagementReport(90);
  assert.equal(report.days, 90);
  assert.deepEqual(report.properties, { created: 0, published: 0, draft: 0, archived: 0 });
  assert.deepEqual(report.leads, { created: 0, open: 0, contract: 0, closed: 0 });
  assert.deepEqual(report.deals, { created: 0, completed: 0, contracted: 0, volume: 0, commission: 0 });
  assert.equal(report.finance, null);
  assert.deepEqual(report.topConsultants, []);
});

test("the report route preserves the selected date range in the unconfigured response", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-management-report.get.ts", import.meta.url), "utf8");
  const daysIndex = route.indexOf("const query = getQuery(event)");
  const fallbackIndex = route.indexOf("if (dbSource === \"unconfigured\") return emptyAdminManagementReport(days)");
  assert.ok(daysIndex >= 0 && fallbackIndex > daysIndex);
});
