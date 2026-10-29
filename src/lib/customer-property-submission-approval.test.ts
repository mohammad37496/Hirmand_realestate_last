import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL } from "./customer-property-submission-approval.ts";

function approvalParams(propertyId: string, submissionId: string, note: string) {
  const params = Array.from({ length: 43 }, () => null as string | null);
  params[0] = propertyId;
  params[1] = "آپارتمان آزمایشی";
  params[41] = submissionId;
  params[42] = note;
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
      updated_at timestamptz
    );
    create table properties (id text primary key, title text not null);
    insert into customer_property_submissions (id,status) values ('submission-1','pending');
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

test("the admin approval route inserts the property from the atomic claim CTE", () => {
  const route = fs.readFileSync(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  assert.match(route, /CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL/);
  assert.match(route, /from claimed returning id/);
  assert.match(route, /if \(!approvalRows\[0\]\)[\s\S]*?statusCode: 409/);
  assert.doesNotMatch(route, /update customer_property_submissions set status='approved', property_id=/);
});
