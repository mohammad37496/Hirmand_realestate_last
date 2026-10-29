import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { resubmitCustomerPropertySubmission } from "./customer-property-submission-resubmit.ts";
import { buildPendingSubmissionDuplicateQuery } from "./customer-property-submission-dedupe.ts";

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

test("new submissions deduplicate only an identical pending property payload, not a different property from the same phone", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table customer_property_submissions (
        id text primary key, owner_phone text not null, status text not null,
        created_at timestamptz not null default current_timestamp,
        public_tracking_token text, property_data jsonb not null
      );
      insert into customer_property_submissions (id,owner_phone,status,public_tracking_token,property_data)
      values ('existing','09130000000','pending','HIR-26-AAAAAAAAAAAA','{"title":"Apartment A","areaM2":100}');
    `);
    const find = async (phone: string, data: unknown) => {
      const query = buildPendingSubmissionDuplicateQuery(phone, data);
      const result = await db.query<{ id: string; public_tracking_token: string }>(query.sql, query.params);
      return result.rows;
    };
    assert.deepEqual(await find("09130000000", { title: "Apartment A", areaM2: 100 }), [
      { id: "existing", public_tracking_token: "HIR-26-AAAAAAAAAAAA" },
    ]);
    assert.deepEqual(await find("09130000000", { title: "Apartment B", areaM2: 140 }), []);
    assert.deepEqual(await find("09131111111", { title: "Apartment A", areaM2: 100 }), []);
    const route = await readFile(new URL("../../server/routes/api/customer-property-submissions.post.ts", import.meta.url), "utf8");
    assert.match(route, /buildPendingSubmissionDuplicateQuery\(parsed\.data\.ownerPhone, parsed\.data\)/);
  } finally {
    await db.close();
  }
});
