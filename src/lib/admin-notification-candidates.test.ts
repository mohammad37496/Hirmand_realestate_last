import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { AdminPermission } from "./admin-roles.ts";
import type { Sql } from "./db.ts";
import { loadAdminNotificationCandidates } from "./admin-notification-candidates.ts";

const allPermissions: AdminPermission[] = [
  "lead.manage", "property.manage", "property.publish", "deal.manage", "divar.import", "team.manage", "reports.view",
];

test("notification feeds are queried only when the role has the matching permission", async () => {
  const calls: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string) => {
      calls.push(text);
      return [] as T[];
    },
  } as Sql;

  await loadAdminNotificationCandidates(sql, ["lead.manage"]);
  assert.deepEqual(calls.map((query) => query.match(/notification:([a-z-]+)/)?.[1]).sort(), [
    "lead-new", "lead-overdue", "lead-visit",
  ]);
  assert.equal(calls.some((query) => query.includes("customer_messages")), false);

  calls.length = 0;
  await loadAdminNotificationCandidates(sql, ["property.manage"]);
  assert.equal(calls.length, 8);
  assert.equal(calls.every((query) => query.includes("notification:property-")), true);

  calls.length = 0;
  await loadAdminNotificationCandidates(sql, ["lead.manage", "reports.view"]);
  assert.equal(calls.some((query) => query.includes("notification:customer-message")), true);
  assert.equal(calls.some((query) => query.includes("notification:lead-new")), true);
  assert.equal(calls.some((query) => query.includes("notification:property-")), false);
});

test("all candidate feeds read real CRM, property, submission, publication, deal and operations rows", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,name text,status text,follow_up_at timestamptz,visit_status text,
      visit_requested_at timestamptz,visit_preferred_at timestamptz,updated_at timestamptz,created_at timestamptz
    );
    create table customer_messages (
      id text,lead_id text,sender_type text,read_by_admin_at timestamptz,created_at timestamptz
    );
    create table properties (
      id text primary key,title text,slug text,deleted_at timestamptz,status text,images jsonb,
      updated_at timestamptz,created_at timestamptz,published_at timestamptz,last_verified_at timestamptz,
      neighborhood text,description text,contact_name text,contact_phone text
    );
    create table customer_property_submissions (
      id text primary key,owner_name text,status text,property_data jsonb,created_at timestamptz,queue_started_at timestamptz
    );
    create table customer_property_submission_events (id text,submission_id text,action text,created_at timestamptz);
    create table property_publication_reviews (id bigint,property_id text,status text,requested_at timestamptz);
    create table property_reports (
      id bigint,property_id text,property_slug text,property_title text,report_type text,status text,created_at timestamptz
    );
    create table property_change_history (
      id bigint,property_id text,action text,before_state jsonb,after_state jsonb,changed_at timestamptz
    );
    create table admin_deal_documents (id text,deal_id text,document_type text,status text,updated_at timestamptz);
    create table admin_deals (id text,title text,property_id text);
    create table divar_sync_runs (id text,status text,started_at timestamptz);
    create table admin_data_health_findings (
      id bigint,source_key text,kind text,severity text,title text,detail text,
      entity_type text,entity_id text,detected_at timestamptz,resolved_at timestamptz
    );
    create table admin_backup_log (id bigint,created_at timestamptz);

    insert into leads values
      ('lead-1','مشتری تازه','new',current_timestamp - interval '2 days','requested',current_timestamp - interval '1 hour',null,current_timestamp,current_timestamp - interval '2 days');
    insert into customer_messages values ('message-1','lead-1','customer',null,current_timestamp);
    insert into properties values
      ('draft-1','پیش‌نویس ناقص','draft-slug',null,'draft','[]',current_timestamp,current_timestamp,null,null,'','', '', ''),
      ('published-1','ملک منتشرشده','published-slug',null,'published','[]',current_timestamp,current_timestamp - interval '30 days',current_timestamp - interval '30 days',null,'محله','توضیح','مالک','09120000000');
    insert into customer_property_submissions values
      ('submission-1','مالک درخواست','pending','{"title":"ملک ارسالی"}',current_timestamp - interval '2 days',current_timestamp - interval '2 days');
    insert into customer_property_submission_events values ('submission-event-1','submission-1','resubmit',current_timestamp);
    insert into property_publication_reviews values (1,'published-1','pending',current_timestamp);
    insert into property_reports values (1,'published-1','published-slug','ملک منتشرشده','incorrect_info','open',current_timestamp);
    insert into property_change_history values (1,'published-1','updated','{}','{"title":"ملک منتشرشده"}',current_timestamp);
    insert into admin_deals values ('deal-1','معامله ملک','published-1');
    insert into admin_deal_documents values ('document-1','deal-1','سند مالکیت','rejected',current_timestamp);
    insert into divar_sync_runs values ('sync-1','failed',current_timestamp);
    insert into admin_data_health_findings values (1,'health-1','missing_property','critical','پیوند ملک ناقص','یک پیوند نیازمند بررسی است','lead','lead-1',current_timestamp,null);
    insert into admin_backup_log values (1,current_timestamp - interval '10 days');
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;

  try {
    const feeds = await loadAdminNotificationCandidates(sql, allPermissions);
    assert.equal(feeds.newLeads.length, 1);
    assert.equal(feeds.overdueLeads.length, 1);
    assert.equal(feeds.visits.length, 1);
    assert.equal(feeds.messages.length, 1);
    assert.equal(feeds.submissions.length, 1);
    assert.equal(feeds.overdueSubmissions.length, 1);
    assert.equal(feeds.submissionEvents.length, 1);
    assert.equal(feeds.incompleteProperties.length, 1);
    assert.equal(feeds.staleProperties.length, 1);
    assert.equal(feeds.verificationDue.length, 1);
    assert.equal(feeds.propertyReports.length, 1);
    assert.equal(feeds.propertyChanges.length, 1);
    assert.equal(feeds.publicationReviews.length, 1);
    assert.equal(feeds.dealDocuments.length, 1);
    assert.equal(feeds.divarFailures.length, 1);
    assert.equal(feeds.dataHealthFindings.length, 1);
    assert.equal(feeds.backupHealth.length, 1);
  } finally {
    await pg.close();
  }
});

const failureCases: Array<{ comment: string; permissions: AdminPermission[] }> = [
  { comment: "lead-new", permissions: ["lead.manage"] },
  { comment: "lead-overdue", permissions: ["lead.manage"] },
  { comment: "lead-visit", permissions: ["lead.manage"] },
  { comment: "customer-message", permissions: ["lead.manage", "reports.view"] },
  { comment: "property-submission", permissions: ["property.manage"] },
  { comment: "property-submission-overdue", permissions: ["property.manage"] },
  { comment: "property-submission-event", permissions: ["property.manage"] },
  { comment: "property-incomplete", permissions: ["property.manage"] },
  { comment: "property-no-image", permissions: ["property.manage"] },
  { comment: "property-verification", permissions: ["property.manage"] },
  { comment: "property-report", permissions: ["property.manage"] },
  { comment: "property-change", permissions: ["property.manage"] },
  { comment: "property-publication", permissions: ["property.publish"] },
  { comment: "deal-document", permissions: ["deal.manage"] },
  { comment: "divar-sync", permissions: ["divar.import"] },
  { comment: "data-health", permissions: ["team.manage"] },
  { comment: "backup-health", permissions: ["team.manage"] },
];

for (const { comment, permissions } of failureCases) {
  test(`notification loading propagates ${comment} database failures`, async () => {
    const sql = {
      query: async <T = Record<string, unknown>>(text: string) => {
        if (text.includes(`notification:${comment}`)) throw new Error(`${comment} source unavailable`);
        return [] as T[];
      },
    } as Sql;
    await assert.rejects(loadAdminNotificationCandidates(sql, permissions), new RegExp(`${comment} source unavailable`));
  });
}
