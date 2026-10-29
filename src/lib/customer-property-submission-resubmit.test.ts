import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { resubmitCustomerPropertySubmission } from "./customer-property-submission-resubmit.ts";

async function fixture(status: string) {
  const db = new PGlite();
  await db.exec(`
    create table customer_property_submissions (
      id text primary key,
      status text not null,
      review_note text not null default '',
      reviewed_at timestamptz,
      updated_at timestamptz,
      queue_started_at timestamptz,
      owner_name text,
      owner_phone text,
      property_data jsonb not null default '{}'::jsonb
    );
    insert into customer_property_submissions (id,status,owner_name,owner_phone,property_data)
    values ('submission-1','${status}','Original Owner','09130000000','{"title":"Original data"}');
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
  };
  return { db, sql };
}

const input = {
  id: "submission-1",
  ownerName: "Updated Owner",
  ownerPhone: "09131111111",
  propertyData: JSON.stringify({ title: "Updated data" }),
};

test("a stale resubmission cannot revert an already approved submission", async () => {
  const { db, sql } = await fixture("approved");
  try {
    assert.equal(await resubmitCustomerPropertySubmission(sql, input), false);
    const rows = await db.query<{ status: string; owner_name: string; property_data: { title: string } }>(
      "select status,owner_name,property_data from customer_property_submissions where id='submission-1'",
    );
    assert.deepEqual(rows.rows[0], {
      status: "approved",
      owner_name: "Original Owner",
      property_data: { title: "Original data" },
    });
  } finally {
    await db.close();
  }
});

test("only one concurrent resubmission can claim a rejected submission", async () => {
  const { db, sql } = await fixture("rejected");
  try {
    const results = await Promise.all([
      resubmitCustomerPropertySubmission(sql, input),
      resubmitCustomerPropertySubmission(sql, { ...input, ownerName: "Second Owner" }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const rows = await db.query<{ status: string }>(
      "select status from customer_property_submissions where id='submission-1'",
    );
    assert.equal(rows.rows[0]?.status, "pending");
  } finally {
    await db.close();
  }
});
