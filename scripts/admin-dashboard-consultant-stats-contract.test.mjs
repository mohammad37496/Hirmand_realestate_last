import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("dashboard consultant aggregate failures reject the API and reach the existing dashboard error banner", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-dashboard-consultant-stats.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-dashboard.tsx", import.meta.url), "utf8");

  assert.match(route, /loadAdminDashboardConsultantStats\(sql\)/);
  assert.match(route, /loadAdminDashboardConsultantPerformance\(sql\)/);
  assert.doesNotMatch(route, /consultant stats unavailable|consultant performance unavailable/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /setLoadError\(error instanceof Error/);
  assert.match(component, /<AdminErrorBanner message=\{loadError\}/);
});
