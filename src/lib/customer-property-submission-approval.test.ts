import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL } from "./customer-property-submission-approval.ts";
import { rejectPendingCustomerPropertySubmission, updatePendingCustomerPropertySubmission } from "./customer-property-submission-review-state.ts";

const initialUpdatedAt = "2026-10-29T00:00:00.000Z";

function approvalParams(propertyId: string, submissionId: string, note: string) {
  const params = Array.from({ length: 44 }, () => null as string | null);
  params[0] = propertyId;
  params[1] = "آپارتمان آزمایشی";
  params[41] = submissionId;
  params[42] = note;
  params[43] = initialUpdatedAt;
  return params;
}

async function createFixture() {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key,
      status text not null,
      property_id text,
      review_note text,
      reviewed_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    );
    create table properties (id text primary key, title text not null);
    insert into customer_property_submissions (id,status,updated_at) values ('submission-1','pending','${initialUpdatedAt}');
  `);
  return db;
}

function testApprovalSql() {
  // The production INSERT uses every placeholder from $1 through $41. Type
  // those otherwise-unused slots in this minimal two-column fixture too.
  const typedUnusedParams = Array.from({ length: 39 }, (_, index) => `$${index + 3}::text as unused_${index}`).join(",");
  return `${CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL}, typed_params as (select ${typedUnusedParams})
    insert into properties (id,title)
    select $1,$2 from claimed cross join typed_params returning id`;
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
  } finally {
    await db.close();
  }
});

async function reviewStateFixture() {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key, status text not null, property_data jsonb not null,
      review_note text not null default '', reviewed_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    );
    insert into customer_property_submissions (id,status,property_data,updated_at)
    values ('submission-1','pending','{"title":"original"}','${initialUpdatedAt}');
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

test("the admin approval route inserts the property from the atomic claim CTE", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  assert.match(route, /CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL/);
  assert.match(route, /from claimed returning id/);
  assert.match(route, /if \(!approvalRows\[0\]\)[\s\S]*?statusCode: 409/);
  assert.match(route, /updatedAt: submission\.updated_at/);
  assert.doesNotMatch(route, /update customer_property_submissions set status='approved', property_id=/);
});

test("admin edit and reject use snapshot-guarded pending-only updates", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  assert.match(route, /updatePendingCustomerPropertySubmission\(sql,\s*\{/);
  assert.match(route, /rejectPendingCustomerPropertySubmission\(sql,\s*\{/);
  assert.match(route, /if \(!updated\) throw createError\(\{ statusCode: 409/);
  assert.match(route, /if \(!rejected\) throw createError\(\{ statusCode: 409/);
});
