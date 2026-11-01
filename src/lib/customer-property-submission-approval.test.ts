import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { buildCustomerPropertySubmissionApprovalSql } from "./customer-property-submission-approval.ts";
import {
  BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL,
  BULK_SET_CUSTOMER_PROPERTY_SUBMISSION_PRIORITY_SQL,
} from "./customer-property-submission-bulk-review.ts";
import {
  assignPendingCustomerPropertySubmission,
  rejectPendingCustomerPropertySubmission,
  setCustomerPropertySubmissionPriority,
  updatePendingCustomerPropertySubmission,
} from "./customer-property-submission-review-state.ts";

const initialUpdatedAt = "2026-10-29T00:00:00.123456Z";

function approvalParams(propertyId: string, submissionId: string, note: string) {
  const params = Array.from({ length: 48 }, () => null as string | null);
  params[0] = propertyId;
  params[1] = "آپارتمان آزمایشی";
  params[41] = submissionId;
  params[42] = note;
  params[43] = initialUpdatedAt;
  params[44] = JSON.stringify({ title: "آپارتمان آزمایشی", status: "published" });
  params[45] = "review-event-1";
  params[46] = JSON.stringify({ propertyId, propertySlug: "apartment-test", consultant: "مشاور آزمایشی" });
  params[47] = "apartment-test";
  return params;
}

async function createFixture() {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key,
      lead_id text,
      status text not null,
      property_id text,
      review_note text,
      reviewed_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    );
    create table properties (id text primary key, title text not null);
    create table leads (id text primary key, status text not null, merged_into_lead_id text, updated_at timestamptz);
    create table lead_activities (id bigint generated always as identity primary key, lead_id text not null, activity_type text not null, title text not null, note text not null, metadata jsonb not null);
    create table property_change_history (id bigint generated always as identity primary key, property_id text not null, action text not null, before_state jsonb, after_state jsonb);
    create table customer_property_submission_events (id text primary key, submission_id text not null, action text not null, note text not null, metadata jsonb not null);
    insert into leads (id,status) values ('lead-1','new');
    insert into customer_property_submissions (id,lead_id,status,updated_at) values ('submission-1','lead-1','pending','${initialUpdatedAt}');
  `);
  return db;
}

function testApprovalSql() {
  // The production INSERT uses every placeholder from $1 through $41. Type
  // those otherwise-unused slots in this minimal two-column fixture too.
  const typedUnusedParams = Array.from({ length: 39 }, (_, index) => `$${index + 3}::text as unused_${index}`).join(",");
  return buildCustomerPropertySubmissionApprovalSql(
    `insert into properties (id,title)
     select $1,$2 from claimed cross join (select ${typedUnusedParams}) typed_params returning id`,
  );
}

test("concurrent approval can publish only one property for a pending submission", async () => {
  const db = await createFixture();
  try {
    const statement = testApprovalSql();
    const results = await Promise.all([
      db.query(statement, approvalParams("property-a", "submission-1", "تأیید اول")),
      db.query(statement, approvalParams("property-b", "submission-1", "تأیید دوم")),
    ]);

    assert.equal(results.reduce((count, result) => count + result.rows.length, 0), 1);
    const submissions = await db.query<{ status: string; property_id: string }>(
      "select status,property_id from customer_property_submissions where id='submission-1'",
    );
    const properties = await db.query<{ id: string }>("select id from properties");
    assert.equal(submissions.rows[0]?.status, "approved");
    assert.deepEqual(properties.rows.map((row) => row.id), [submissions.rows[0]?.property_id]);
    assert.equal((await db.query("select id from property_change_history where property_id='" + submissions.rows[0]?.property_id + "'")).rows.length, 1);
    assert.equal((await db.query("select id from customer_property_submission_events where submission_id='submission-1' and action='approve'")).rows.length, 1);
    assert.equal((await db.query("select id from lead_activities where lead_id='lead-1'")).rows.length, 1);
    assert.equal((await db.query<{ status: string }>("select status from leads where id='lead-1'")).rows[0]?.status, "contacted");
  } finally {
    await db.close();
  }
});

test("a failed property insert rolls the submission claim back to pending", async () => {
  const db = await createFixture();
  try {
    await db.query("insert into properties (id,title) values ('property-exists','موجود')");
    const statement = testApprovalSql();

    await assert.rejects(
      db.query(statement, approvalParams("property-exists", "submission-1", "تأیید آزمایشی")),
    );
    const rows = await db.query<{ status: string; property_id: string | null }>(
      "select status,property_id from customer_property_submissions where id='submission-1'",
    );
    assert.equal(rows.rows[0]?.status, "pending");
    assert.equal(rows.rows[0]?.property_id, null);
    assert.equal((await db.query<{ status: string }>("select status from leads where id='lead-1'")).rows[0]?.status, "new");
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from customer_property_submission_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("approval rejects a stale property-data snapshot after an admin edit", async () => {
  const db = await createFixture();
  try {
    await db.query("update customer_property_submissions set updated_at='2026-10-29T00:00:01.000Z' where id='submission-1'");
    const result = await db.query(testApprovalSql(), approvalParams("property-stale", "submission-1", "approval note"));
    assert.equal(result.rows.length, 0);
    const submissions = await db.query<{ status: string; property_id: string | null }>(
      "select status,property_id from customer_property_submissions where id='submission-1'",
    );
    assert.equal(submissions.rows[0]?.status, "pending");
    assert.equal(submissions.rows[0]?.property_id, null);
    assert.equal((await db.query("select id from properties")).rows.length, 0);
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from customer_property_submission_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("approving a submission retained on a merged duplicate never reopens that duplicate lead", async () => {
  const db = await createFixture();
  try {
    await db.exec("insert into leads(id,status) values ('canonical-lead','new'); update leads set status='closed',merged_into_lead_id='canonical-lead' where id='lead-1'");
    const result = await db.query<{ id: string }>(testApprovalSql(), approvalParams("property-merged-lead", "submission-1", "Approved"));
    assert.equal(result.rows[0]?.id, "property-merged-lead");
    const duplicate = await db.query<{ status: string; merged_into_lead_id: string }>("select status,merged_into_lead_id from leads where id='lead-1'");
    assert.deepEqual(duplicate.rows[0], { status: "closed", merged_into_lead_id: "canonical-lead" });
    assert.equal((await db.query<{ status: string }>("select status from customer_property_submissions where id='submission-1'")).rows[0]?.status, "approved");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from lead_activities where lead_id='lead-1'")).rows[0]?.count, 0);
  } finally {
    await db.close();
  }
});

async function reviewStateFixture() {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key, lead_id text, status text not null, property_data jsonb not null,
      priority text not null default 'normal', assigned_consultant_name text, assigned_consultant_phone text, assigned_at timestamptz,
      review_note text not null default '', reviewed_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    );
    create table leads (id text primary key, status text not null, merged_into_lead_id text, updated_at timestamptz);
    create table lead_activities (id bigint generated always as identity primary key, lead_id text not null, activity_type text not null, title text not null, note text not null, metadata jsonb not null);
    create table customer_property_submission_events (id text primary key, submission_id text not null, action text not null, note text not null, metadata jsonb not null);
    insert into leads (id,status) values ('lead-1','new');
    insert into customer_property_submissions (id,lead_id,status,property_data,updated_at)
    values ('submission-1','lead-1','pending','{"title":"original"}','${initialUpdatedAt}');
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
  };
  return { db, sql };
}

test("admin edit cannot overwrite a submission that was approved after its read", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    await db.query("update customer_property_submissions set status='approved',updated_at='2026-10-29T00:00:01.000Z' where id='submission-1'");
    assert.equal(await updatePendingCustomerPropertySubmission(sql, {
      id: "submission-1", propertyData: JSON.stringify({ title: "stale edit" }),
      reviewNote: "edit", updatedAt: initialUpdatedAt,
    }), false);
    const rows = await db.query<{ status: string; property_data: { title: string } }>(
      "select status,property_data from customer_property_submissions where id='submission-1'",
    );
    assert.deepEqual(rows.rows[0], { status: "approved", property_data: { title: "original" } });
  } finally {
    await db.close();
  }
});

test("admin reject cannot revert a submission approved after its read", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    await db.query("update customer_property_submissions set status='approved',updated_at='2026-10-29T00:00:01.000Z' where id='submission-1'");
    assert.equal(await rejectPendingCustomerPropertySubmission(sql, {
      id: "submission-1", reviewNote: "stale reject", updatedAt: initialUpdatedAt,
    }), false);
    const rows = await db.query<{ status: string; review_note: string }>(
      "select status,review_note from customer_property_submissions where id='submission-1'",
    );
    assert.deepEqual(rows.rows[0], { status: "approved", review_note: "" });
  } finally {
    await db.close();
  }
});

test("single rejection updates the linked lead and both histories atomically", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    assert.equal(await rejectPendingCustomerPropertySubmission(sql, {
      id: "submission-1", reviewNote: "اطلاعات ناقص", updatedAt: initialUpdatedAt,
    }), true);
    assert.equal((await db.query<{ status: string }>("select status from customer_property_submissions where id='submission-1'")).rows[0]?.status, "rejected");
    assert.equal((await db.query<{ status: string }>("select status from leads where id='lead-1'")).rows[0]?.status, "closed");
    assert.equal((await db.query("select id from lead_activities where lead_id='lead-1'")).rows.length, 1);
    assert.equal((await db.query("select id from customer_property_submission_events where submission_id='submission-1' and action='reject'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("single rejection rolls back when the linked CRM activity insert fails", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    await db.exec("alter table lead_activities add constraint reject_single_activity check (title <> 'ثبت ملک رد شد')");
    await assert.rejects(rejectPendingCustomerPropertySubmission(sql, {
      id: "submission-1", reviewNote: "اطلاعات ناقص", updatedAt: initialUpdatedAt,
    }));
    assert.equal((await db.query<{ status: string }>("select status from customer_property_submissions where id='submission-1'")).rows[0]?.status, "pending");
    assert.equal((await db.query<{ status: string }>("select status from leads where id='lead-1'")).rows[0]?.status, "new");
    assert.equal((await db.query("select id from customer_property_submission_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("approval rolls back property, submission, lead and audit changes when CRM activity fails", async () => {
  const db = await createFixture();
  try {
    await db.exec("alter table lead_activities add constraint reject_approval_activity check (title <> 'ملک مشتری تأیید و منتشر شد')");
    await assert.rejects(db.query(testApprovalSql(), approvalParams("property-failed", "submission-1", "تأیید آزمایشی")));
    assert.equal((await db.query<{ status: string }>("select status from customer_property_submissions where id='submission-1'")).rows[0]?.status, "pending");
    assert.equal((await db.query("select id from properties")).rows.length, 0);
    assert.equal((await db.query<{ status: string }>("select status from leads where id='lead-1'")).rows[0]?.status, "new");
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from customer_property_submission_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("the admin approval route inserts the property from the atomic claim CTE", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  assert.match(route, /buildCustomerPropertySubmissionApprovalSql\(/);
  assert.match(route, /from claimed returning id/);
  assert.match(route, /if \(!approvalRows\[0\]\)[\s\S]*?statusCode: 409/);
  assert.match(route, /updatedAt: submission\.updated_at_snapshot/);
  assert.doesNotMatch(route, /update customer_property_submissions set status='approved', property_id=/);
  assert.doesNotMatch(route, /property_change_history[\s\S]*?\.catch\(\(\) => \{\}\)/);
});

test("admin edit and reject use snapshot-guarded pending-only updates", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  assert.match(route, /updatePendingCustomerPropertySubmission\(sql,\s*\{/);
  assert.match(route, /rejectPendingCustomerPropertySubmission\(sql,\s*\{/);
  assert.match(route, /if \(!updated\) throw createError\(\{ statusCode: 409/);
  assert.match(route, /if \(!rejected\) throw createError\(\{ statusCode: 409/);
});

test("single assignment and priority updates commit their review events together", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    assert.equal(await assignPendingCustomerPropertySubmission(sql, {
      id: "submission-1", consultantName: "مشاور آزمایشی", consultantPhone: "09120000000", note: "تخصیص مشاور آزمایشی",
    }), true);
    const assigned = await db.query<{ assigned_consultant_name: string; assigned_consultant_phone: string }>(
      "select assigned_consultant_name,assigned_consultant_phone from customer_property_submissions where id='submission-1'",
    );
    assert.deepEqual(assigned.rows[0], { assigned_consultant_name: "مشاور آزمایشی", assigned_consultant_phone: "09120000000" });
    assert.equal((await db.query("select id from customer_property_submission_events where submission_id='submission-1' and action='assign'")).rows.length, 1);

    const priority = await setCustomerPropertySubmissionPriority(sql, {
      id: "submission-1", priority: "high", note: "اولویت پرونده به high تغییر کرد.",
    });
    assert.equal(priority?.status, "pending");
    assert.equal((await db.query<{ priority: string }>("select priority from customer_property_submissions where id='submission-1'")).rows[0]?.priority, "high");
    assert.equal((await db.query("select id from customer_property_submission_events where submission_id='submission-1' and action='priority'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("priority changes cannot mutate approved or rejected submissions", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    for (const status of ["approved", "rejected"]) {
      await db.query("update customer_property_submissions set status=$1,priority='normal' where id='submission-1'", [status]);
      assert.equal(await setCustomerPropertySubmissionPriority(sql, {
        id: "submission-1", priority: "high", note: "اولویت بالا",
      }), null);
      const submission = await db.query<{ status: string; priority: string }>(
        "select status,priority from customer_property_submissions where id='submission-1'",
      );
      assert.deepEqual(submission.rows[0], { status, priority: "normal" });
    }
    assert.equal((await db.query("select id from customer_property_submission_events where action='priority'")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("assignment, priority and edit mutations roll back when their review event insert fails", async () => {
  const { db, sql } = await reviewStateFixture();
  try {
    await db.exec("alter table customer_property_submission_events add constraint reject_review_event check (action not in ('assign','priority','edit'))");
    await assert.rejects(assignPendingCustomerPropertySubmission(sql, {
      id: "submission-1", consultantName: "مشاور آزمایشی", consultantPhone: "09120000000", note: "تخصیص مشاور آزمایشی",
    }));
    await assert.rejects(setCustomerPropertySubmissionPriority(sql, {
      id: "submission-1", priority: "high", note: "اولویت بالا",
    }));
    await assert.rejects(updatePendingCustomerPropertySubmission(sql, {
      id: "submission-1", propertyData: JSON.stringify({ title: "تغییر" }), reviewNote: "edit", updatedAt: initialUpdatedAt,
    }));
    const submission = await db.query<{ priority: string; assigned_consultant_name: string | null; property_data: { title: string } }>(
      "select priority,assigned_consultant_name,property_data from customer_property_submissions where id='submission-1'",
    );
    assert.deepEqual(submission.rows[0], { priority: "normal", assigned_consultant_name: null, property_data: { title: "original" } });
    assert.equal((await db.query("select id from customer_property_submission_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("submission queue statistics fail visibly instead of returning false zero workloads", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  const list = route.split('if (action === "list")')[1]?.split('if (action === "assign_consultant")')[0] ?? "";
  assert.doesNotMatch(list, /\.catch\(/);
  assert.doesNotMatch(route, /logReviewEvent/);
  assert.match(route, /assignPendingCustomerPropertySubmission\(/);
  assert.match(route, /setCustomerPropertySubmissionPriority\(/);
});

async function bulkReviewFixture() {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key, lead_id text, status text not null, review_note text not null default '',
      reviewed_at timestamptz, priority text not null default 'normal', updated_at timestamptz not null default current_timestamp
    );
    create table leads (id text primary key, status text not null, merged_into_lead_id text, updated_at timestamptz);
    create table lead_activities (
      id bigint generated always as identity primary key, lead_id text not null, activity_type text not null,
      title text not null, note text not null, metadata jsonb not null
    );
    create table customer_property_submission_events (
      id text primary key, submission_id text not null, action text not null, note text not null, metadata jsonb not null
    );
    insert into leads (id,status) values ('lead-1','new'),('lead-2','contacted'),('lead-race','new');
    insert into customer_property_submissions (id,lead_id,status) values
      ('pending-1','lead-1','pending'),('pending-2','lead-2','pending'),('already-approved','lead-race','approved');
  `);
  return db;
}

test("bulk rejection updates only pending submissions and commits linked lead and review history", async () => {
  const db = await bulkReviewFixture();
  try {
    const result = await db.query<{ id: string }>(BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL, [
      ["pending-1", "pending-2", "already-approved", "missing"], "توضیح رد گروهی",
    ]);
    assert.deepEqual(result.rows.map((row) => row.id), ["pending-1", "pending-2"]);
    const leads = await db.query<{ id: string; status: string }>("select id,status from leads where id in ('lead-1','lead-2') order by id");
    assert.deepEqual(leads.rows, [{ id: "lead-1", status: "closed" }, { id: "lead-2", status: "closed" }]);
    const activities = await db.query<{ lead_id: string; metadata: { submissionId: string; bulk: boolean } }>("select lead_id,metadata from lead_activities order by lead_id");
    assert.deepEqual(activities.rows, [
      { lead_id: "lead-1", metadata: { submissionId: "pending-1", bulk: true } },
      { lead_id: "lead-2", metadata: { submissionId: "pending-2", bulk: true } },
    ]);
    const events = await db.query<{ submission_id: string; action: string }>("select submission_id,action from customer_property_submission_events order by submission_id");
    assert.deepEqual(events.rows, [{ submission_id: "pending-1", action: "reject" }, { submission_id: "pending-2", action: "reject" }]);
  } finally {
    await db.close();
  }
});

test("bulk rejection rolls back submission and lead changes when CRM activity cannot be recorded", async () => {
  const db = await bulkReviewFixture();
  try {
    await db.exec("alter table lead_activities add constraint reject_bulk_activity check (title <> 'ثبت ملک رد شد')");
    await assert.rejects(db.query(BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL, [["pending-1"], "رد شد"]));
    const submission = await db.query<{ status: string }>("select status from customer_property_submissions where id='pending-1'");
    const lead = await db.query<{ status: string }>("select status from leads where id='lead-1'");
    const events = await db.query("select id from customer_property_submission_events");
    assert.equal(submission.rows[0]?.status, "pending");
    assert.equal(lead.rows[0]?.status, "new");
    assert.equal(events.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("bulk rejection preserves a merged duplicate lead's closed state and does not append activity to it", async () => {
  const db = await bulkReviewFixture();
  try {
    await db.exec("insert into leads(id,status) values ('canonical-lead','new'); update leads set status='closed',merged_into_lead_id='canonical-lead' where id='lead-1'");
    const result = await db.query(BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL, [["pending-1"], "Rejected after merge"]);
    assert.equal(result.rows.length, 1);
    assert.deepEqual((await db.query("select status,merged_into_lead_id from leads where id='lead-1'")).rows[0], {
      status: "closed", merged_into_lead_id: "canonical-lead",
    });
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from lead_activities where lead_id='lead-1'")).rows[0]?.count, 0);
    assert.equal((await db.query<{ status: string }>("select status from customer_property_submissions where id='pending-1'")).rows[0]?.status, "rejected");
  } finally {
    await db.close();
  }
});

test("concurrent approval and bulk rejection cannot both win or close an approved lead", async () => {
  const db = await bulkReviewFixture();
  try {
    await db.exec("insert into customer_property_submissions (id,lead_id,status) values ('race','lead-race','pending')");
    const [raceApproval, raceRejection] = await Promise.all([
      db.query<{ id: string }>("update customer_property_submissions set status='approved' where id='race' and status='pending' returning id"),
      db.query<{ id: string }>(BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL, [["race"], "رد هم‌زمان"]),
    ]);
    assert.equal(raceApproval.rows.length + raceRejection.rows.length, 1);
    const state = await db.query<{ status: string }>("select status from customer_property_submissions where id='race'");
    const lead = await db.query<{ status: string }>("select status from leads where id='lead-race'");
    if (raceApproval.rows.length) {
      assert.equal(state.rows[0]?.status, "approved");
      assert.equal(lead.rows[0]?.status, "new");
      assert.equal((await db.query("select id from customer_property_submission_events where submission_id='race'")).rows.length, 0);
    } else {
      assert.equal(state.rows[0]?.status, "rejected");
      assert.equal(lead.rows[0]?.status, "closed");
      assert.equal((await db.query("select id from customer_property_submission_events where submission_id='race' and action='reject'")).rows.length, 1);
    }
  } finally {
    await db.close();
  }
});

test("bulk priority updates count only changed pending rows and write review events atomically", async () => {
  const db = await bulkReviewFixture();
  try {
    const result = await db.query<{ id: string }>(BULK_SET_CUSTOMER_PROPERTY_SUBMISSION_PRIORITY_SQL, [
      ["pending-1", "already-approved", "missing"], "high",
    ]);
    assert.deepEqual(result.rows.map((row) => row.id), ["pending-1"]);
    const events = await db.query<{ submission_id: string; action: string }>("select submission_id,action from customer_property_submission_events");
    assert.deepEqual(events.rows, [{ submission_id: "pending-1", action: "priority" }]);
  } finally {
    await db.close();
  }
});

test("bulk review route delegates both operations to atomic statements", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  const start = route.indexOf('if (action === "bulk_set_priority" || action === "bulk_reject")');
  const end = route.indexOf('if (action === "export")', start);
  const bulk = route.slice(start, end);
  assert.match(bulk, /BULK_SET_CUSTOMER_PROPERTY_SUBMISSION_PRIORITY_SQL/);
  assert.match(bulk, /BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL/);
  assert.doesNotMatch(bulk, /select id,lead_id from customer_property_submissions/);
  assert.doesNotMatch(bulk, /\.catch\(\(\) => \{\}\)/);
});
