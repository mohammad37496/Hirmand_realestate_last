import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("customer submission queue metrics fail visibly instead of returning fabricated zeros", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/customer-submission-queue-stats.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-customer-property-submissions.tsx", import.meta.url), "utf8");

  assert.match(route, /loadCustomerSubmissionQueueStats\(sql, TEAM\)/);
  assert.doesNotMatch(route, /workloadRows[\s\S]*?\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(route, /slaRows[\s\S]*?\.catch\(\(\) => \[\{/);
  assert.match(helper, /await Promise\.all\(\[/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /setQueueStatsError\(message\)/);
  assert.match(component, /مقادیر صفر به معنی نبود پرونده نیست/);
  assert.match(component, /queueStatsError \?/);
});
