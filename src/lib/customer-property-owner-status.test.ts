import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ownerStatusEventNote,
  publicCustomerPropertyReviewNote,
} from "./customer-property-owner-status.ts";
import { resubmitCustomerPropertySubmission } from "./customer-property-submission-resubmit.ts";

test("public owner timeline exposes only owner-facing event notes", async () => {
  assert.equal(ownerStatusEventNote("created", "پرونده ثبت شد"), "پرونده ثبت شد");
  assert.equal(ownerStatusEventNote("assign", "پرونده به مشاور اختصاص یافت"), "پرونده به مشاور اختصاص یافت");
  assert.equal(ownerStatusEventNote("reject", "لطفاً تصویر سند را اصلاح کنید"), "لطفاً تصویر سند را اصلاح کنید");
  assert.equal(ownerStatusEventNote("resubmit", "نسخه جدید دریافت شد"), "نسخه جدید دریافت شد");
  for (const action of ["approve", "priority", "edit", "restore", "unknown", null]) {
    assert.equal(ownerStatusEventNote(action, "یادداشت داخلی مدیر"), "");
  }

  const route = await readFile(
    new URL("../../server/routes/api/owner-property-status.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /note:ownerStatusEventNote\(row\.action,row\.note\)/);
});

test("public lead tracking returns review notes only after an explicit rejection", async () => {
  const internalNote = "یادداشت داخلی کارشناس";
  assert.equal(publicCustomerPropertyReviewNote("pending", internalNote), "");
  assert.equal(publicCustomerPropertyReviewNote("approved", internalNote), "");
  assert.equal(publicCustomerPropertyReviewNote("rejected", "لطفاً تصویر سند را اصلاح کنید"), "لطفاً تصویر سند را اصلاح کنید");
  assert.equal(publicCustomerPropertyReviewNote("unknown", internalNote), "");

  const route = await readFile(
    new URL("../../server/routes/api/public-lead-tracking.get.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /publicCustomerPropertyReviewNote\(\s*customerPropertySubmissionStatus\s*,\s*row\.customer_property_submission_review_note\s*,?\s*\)/);
});

test("customer resubmission only wins when the rejected status and timestamp still match", async () => {
  const input = {
    id: "submission-1",
    expectedUpdatedAt: "2026-11-08 12:00:00.123456+00",
    ownerName: "مالک",
    ownerPhone: "09123456789",
    propertyData: "{}",
  };
  let queryText = "";
  let queryParams: unknown[] = [];
  const won = await resubmitCustomerPropertySubmission({
    query: async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
      queryText = text;
      queryParams = params;
      return [{ id: "submission-1" }] as T[];
    },
  }, input);

  assert.equal(won, true);
  assert.match(queryText, /where id=\$1 and status='rejected' and updated_at=\$5\s+returning id/i);
  assert.deepEqual(queryParams, [input.id, input.ownerName, input.ownerPhone, input.propertyData, input.expectedUpdatedAt]);

  const stale = await resubmitCustomerPropertySubmission({
    query: async () => [],
  }, input);
  assert.equal(stale, false);

  const route = await readFile(
    new URL("../../server/routes/api/customer-property-submissions.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /updated_at::text as updated_at/i);
});

test("customer resubmission preserves PostgreSQL timestamptz microseconds in its compare-and-swap", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      set time zone 'UTC';
      create table customer_property_submissions (
        id text primary key, status text not null, updated_at timestamptz not null,
        review_note text not null default '', reviewed_at timestamptz,
        queue_started_at timestamptz not null default current_timestamp,
        owner_name text not null, owner_phone text not null, property_data jsonb not null
      );
      insert into customer_property_submissions
        (id,status,updated_at,owner_name,owner_phone,property_data)
      values ('submission-1','rejected','2026-11-08 12:00:00.123456+00','مالک قبلی','09111111111','{}'::jsonb);
    `);

    const snapshot = await pg.query<{ updated_at: string }>(
      "select updated_at::text as updated_at from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    assert.equal(snapshot.rows[0]?.updated_at, "2026-11-08 12:00:00.123456+00");

    const resubmitted = await resubmitCustomerPropertySubmission({
      query: async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
        (await pg.query(text, params)).rows as T[],
    }, {
      id: "submission-1",
      expectedUpdatedAt: snapshot.rows[0]!.updated_at,
      ownerName: "مالک جدید",
      ownerPhone: "09123456789",
      propertyData: "{}",
    });

    assert.equal(resubmitted, true);
    const current = await pg.query<{ status: string; owner_name: string }>(
      "select status,owner_name from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    assert.deepEqual(current.rows[0], { status: "pending", owner_name: "مالک جدید" });
  } finally {
    await pg.close();
  }
});
