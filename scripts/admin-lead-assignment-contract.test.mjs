import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/admin-lead-assignment.post.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/hirmand/admin-lead-assignment-balancer.tsx", import.meta.url), "utf8");
const action = await readFile(new URL("../src/lib/admin-lead-assignment-action.ts", import.meta.url), "utf8");
const leadAdminRoute = await readFile(new URL("../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8");
const leadActivityAction = await readFile(new URL("../src/lib/admin-lead-activity-action.ts", import.meta.url), "utf8");
const adminMatchRoute = await readFile(new URL("../server/routes/api/admin-match.post.ts", import.meta.url), "utf8");
const leadMutationRoutes = leadAdminRoute.slice(
  leadAdminRoute.indexOf('if (body.action === "status")'),
  leadAdminRoute.indexOf('if (body.action === "activity")'),
);

test("lead assignment query failures are surfaced instead of masquerading as an empty workload", () => {
  assert.match(route, /loadAdminLeadAssignmentRows\(sql, action\)/);
  assert.match(route, /statusCode:\s*503/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.doesNotMatch(route, /return\s+\{\s*consultants:\s*\[\],\s*recommendations:\s*\[\]\s*\}/);
  assert.match(route, /assignAdminLeadToConsultant\(sql,\s*leadId,\s*consultantId\)/);
  assert.match(route, /body\.consultantId/);
  assert.doesNotMatch(route, /insert into lead_activities|update leads set consultant=/i);

  assert.match(action, /sql\.transaction\(async\s*\(tx\)/);
  assert.match(action, /consultant_id=\$2, consultant=case when consultant_id is distinct from \$2/i);
  assert.match(action, /is_active=true[\s\S]*for share/i);
  assert.match(action, /insert into lead_activities/i);
  assert.doesNotMatch(action, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);

  assert.match(component, /loadError/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!loadError\s*&&\s*!recommendations\.length/);
  assert.match(component, /وضعیت نامشخص/);
  assert.match(component, /تلاش دوباره/);
});

test("CRM lead field changes commit with their timeline activities", () => {
  for (const kind of ["status", "visit_status", "note", "follow_up"]) {
    assert.match(leadAdminRoute, new RegExp(`updateAdminLeadWithActivity\\(sql,\\s*\\{\\s*kind:\\s*"${kind}"`));
  }
  assert.doesNotMatch(leadMutationRoutes, /insert into lead_activities/i);
  assert.doesNotMatch(leadMutationRoutes, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  assert.match(leadActivityAction, /sql\.transaction\(async\s*\(tx\)/);
  assert.match(leadActivityAction, /insert into lead_activities/i);
});

test("lead matching saves the match snapshot and CRM timeline atomically", () => {
  assert.match(adminMatchRoute, /saveAdminLeadMatchesWithActivity\(sql/);
  const start = adminMatchRoute.indexOf("const saveResult = await saveAdminLeadMatchesWithActivity");
  const end = adminMatchRoute.indexOf("return {", start);
  const matchMutation = adminMatchRoute.slice(start, end);
  assert.doesNotMatch(matchMutation, /update leads set matched_properties/i);
  assert.doesNotMatch(matchMutation, /insert into lead_activities/i);
  assert.match(leadActivityAction, /export async function saveAdminLeadMatchesWithActivity/);
  assert.match(leadActivityAction, /sql\.transaction\(async\s*\(tx\)/);
});
