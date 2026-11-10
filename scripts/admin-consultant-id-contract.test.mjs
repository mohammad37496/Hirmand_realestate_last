import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("CRM consultant attribution is ID-based across transactional writes and aggregates", async () => {
  const [migration, leads, intake, visit, assignment, balancer, dashboard, performance, targets, health, dedupe, salesControl, callback, workflow] = await Promise.all([
    read("../migrations/0104_lead_consultant_relation.sql"),
    read("../server/routes/api/leads.post.ts"),
    read("../src/lib/public-lead-intake.ts"),
    read("../src/lib/property-visit-request.ts"),
    read("../src/lib/admin-lead-assignment-action.ts"),
    read("../src/lib/admin-lead-assignment.ts"),
    read("../src/lib/admin-dashboard-consultant-stats.ts"),
    read("../server/routes/api/admin-consultant-performance.get.ts"),
    read("../server/routes/api/admin-consultant-targets.post.ts"),
    read("../src/lib/admin-data-health.ts"),
    read("../src/lib/admin-lead-dedupe.ts"),
    read("../server/routes/api/admin-sales-control-center.post.ts"),
    read("../src/components/hirmand/property-callback-request.tsx"),
    read("../.github/workflows/deploy-liara.yml"),
  ]);

  assert.match(migration, /foreign key \(consultant_id\) references consultants\(id\) on delete set null/i);
  assert.match(migration, /candidate_count = 1/);
  assert.match(migration, /where l\.name_key <> ''/);
  assert.doesNotMatch(migration, /leads\.phone\s*=|l\.phone\s*=|consultants\.phone\s*=/i);
  assert.match(migration, /else 'legacy_unresolved'/);
  assert.match(migration, /old\.consultant_id is not null/);

  assert.equal((leads.match(/insert into leads/gi) ?? []).length, 7);
  assert.equal((leads.match(/consultant_id/gi) ?? []).length >= 7, true);
  assert.equal((leads.match(/resolvePropertyLeadConsultant\(transactionSql/g) ?? []).length, 6);
  assert.equal((leads.match(/resolveActivePublicLeadConsultant\(transactionSql/g) ?? []).length, 3);
  assert.match(leads, /consultantId: z\.string/);
  assert.match(intake, /is_active=true[\s\S]*for share/i);
  assert.match(intake, /select consultant_id[\s\S]*for update/i);
  assert.match(intake, /Lock order matters: consultant first, property second/);
  assert.match(visit, /resolvePropertyLeadConsultant/);
  assert.match(visit, /visit_status, public_tracking_token, consultant_id/);

  assert.match(assignment, /is_active=true[\s\S]*for share/i);
  assert.match(assignment, /consultant_id=\$2, consultant=case when consultant_id is distinct from \$2/i);
  assert.match(migration, /new\.consultant is distinct from old\.consultant/);
  assert.match(balancer, /l\.consultant_id = c\.id/);
  assert.match(dashboard, /group by consultant_id/);
  assert.match(dashboard, /ls\.key = c\.id/);
  assert.match(performance, /c\.id as consultant_id/);
  assert.match(performance, /historical-deal:/);
  assert.match(targets, /body\.consultantId/);
  assert.match(targets, /is_active=true[\s\S]*for share/i);
  assert.match(targets, /on conflict\(consultant_id,target_month\)/);
  assert.match(targets, /c\.id=l\.consultant_id/);
  assert.match(health, /consultant_link_state='legacy_unresolved'/);
  assert.match(dedupe, /consultant_id = case/);
  assert.match(dedupe, /select id from consultants[\s\S]*for share/i);
  assert.match(dedupe, /select id,status,consultant,consultant_id,consultant_link_state[\s\S]*for update/i);
  assert.match(salesControl, /c\.id as key/);
  assert.match(salesControl, /join consultants c on c\.id=l\.consultant_id/);
  assert.match(callback, /propertyId,propertyType/);
  assert.match(workflow, /0104_lead_consultant_relation\.sql/);
});
