import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/admin-lead-assignment.post.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/hirmand/admin-lead-assignment-balancer.tsx", import.meta.url), "utf8");

test("lead assignment query failures are surfaced instead of masquerading as an empty workload", () => {
  assert.match(route, /loadAdminLeadAssignmentRows\(sql, action\)/);
  assert.match(route, /statusCode:\s*503/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.doesNotMatch(route, /return\s+\{\s*consultants:\s*\[\],\s*recommendations:\s*\[\]\s*\}/);

  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!loadError\s*&&\s*!recommendations\.length/);
  assert.match(component, /وضعیت نامشخص/);
  assert.match(component, /تلاش دوباره/);
});
