import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ownerStatusEventNote,
  publicCustomerPropertyReviewNote,
} from "./customer-property-owner-status.ts";
import { updatePendingCustomerPropertySubmissionReview } from "./customer-property-submission-review.ts";
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

test("concurrent customer submission approval creates one property and one successful review", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table customer_property_submissions (
        id text primary key, status text not null, updated_at timestamptz not null,
        property_id text, review_note text not null default '', reviewed_at timestamptz,
        property_data jsonb not null default '{}'::jsonb
      );
      create table properties (id text primary key, submission_id text not null unique);
      insert into customer_property_submissions(id,status,updated_at,property_data)
        values ('submission-1','pending','2026-11-08 12:00:00.123456+00','{}'::jsonb);
    `);
    const snapshot = await pg.query<{ updated_at: string }>(
      "select updated_at::text as updated_at from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    const expectedUpdatedAt = snapshot.rows[0]!.updated_at;

    const approve = (propertyId: string) => pg.transaction(async (tx) => {
      const sql = {
        query: async <T>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as T[],
      };
      const updated = await updatePendingCustomerPropertySubmissionReview(sql, {
        action: "approve",
        id: "submission-1",
        expectedUpdatedAt,
        propertyId,
        reviewNote: "approved",
      });
      if (!updated) return false;
      await tx.query("insert into properties(id,submission_id) values ($1,$2)", [propertyId, "submission-1"]);
      return true;
    });

    const results = await Promise.all([approve("property-a"), approve("property-b")]);
    assert.deepEqual(results.sort(), [false, true]);

    const submissions = await pg.query<{ status: string; property_id: string }>(
      "select status,property_id from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    const properties = await pg.query<{ id: string; submission_id: string }>(
      "select id,submission_id from properties where submission_id=$1",
      ["submission-1"],
    );
    assert.equal(submissions.rows[0]?.status, "approved");
    assert.equal(properties.rows.length, 1);
    assert.equal(submissions.rows[0]?.property_id, properties.rows[0]?.id);
  } finally {
    await pg.close();
  }
});

test("concurrent approval and rejection cannot leave a rejected submission with a published property", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table customer_property_submissions (
        id text primary key, status text not null, updated_at timestamptz not null,
        property_id text, review_note text not null default '', reviewed_at timestamptz,
        property_data jsonb not null default '{}'::jsonb
      );
      create table properties (id text primary key, submission_id text not null unique);
      insert into customer_property_submissions(id,status,updated_at,property_data)
        values ('submission-1','pending','2026-11-08 12:00:00.123456+00','{}'::jsonb);
    `);
    const snapshot = await pg.query<{ updated_at: string }>(
      "select updated_at::text as updated_at from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    const expectedUpdatedAt = snapshot.rows[0]!.updated_at;

    const approve = () => pg.transaction(async (tx) => {
      const updated = await updatePendingCustomerPropertySubmissionReview({
        query: async <T>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as T[],
      }, {
        action: "approve",
        id: "submission-1",
        expectedUpdatedAt,
        propertyId: "property-approved",
        reviewNote: "approved",
      });
      if (!updated) return "stale";
      await tx.query("insert into properties(id,submission_id) values ($1,$2)", ["property-approved", "submission-1"]);
      return "approved";
    });
    const reject = () => pg.transaction(async (tx) => {
      const updated = await updatePendingCustomerPropertySubmissionReview({
        query: async <T>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as T[],
      }, {
        action: "reject",
        id: "submission-1",
        expectedUpdatedAt,
        reviewNote: "rejected",
      });
      return updated ? "rejected" : "stale";
    });

    const results = await Promise.all([approve(), reject()]);
    assert.equal(results.filter((result) => result !== "stale").length, 1);

    const submissions = await pg.query<{ status: string; property_id: string | null }>(
      "select status,property_id from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    const properties = await pg.query<{ id: string }>(
      "select id from properties where submission_id=$1",
      ["submission-1"],
    );
    if (submissions.rows[0]?.status === "approved") {
      assert.equal(properties.rows.length, 1);
      assert.equal(submissions.rows[0]?.property_id, properties.rows[0]?.id);
    } else {
      assert.equal(submissions.rows[0]?.status, "rejected");
      assert.equal(submissions.rows[0]?.property_id, null);
      assert.equal(properties.rows.length, 0);
    }
  } finally {
    await pg.close();
  }
});

test("review edits reject a stale pending snapshot and preserve exact timestamp precision", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table customer_property_submissions (
        id text primary key, status text not null, updated_at timestamptz not null,
        property_data jsonb not null, review_note text not null default '', reviewed_at timestamptz
      );
      insert into customer_property_submissions(id,status,updated_at,property_data)
        values ('submission-1','pending','2026-11-08 12:00:00.123456+00','{}'::jsonb);
    `);
    const snapshot = await pg.query<{ updated_at: string }>(
      "select updated_at::text as updated_at from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    const sql = {
      query: async <T>(text: string, params: unknown[] = []) =>
        (await pg.query(text, params)).rows as T[],
    };

    assert.equal(await updatePendingCustomerPropertySubmissionReview(sql, {
      action: "edit",
      id: "submission-1",
      expectedUpdatedAt: snapshot.rows[0]!.updated_at,
      propertyData: JSON.stringify({ title: "Fresh edit" }),
      reviewNote: "edit",
    }), true);
    const refreshed = await pg.query<{ updated_at: string }>(
      "select updated_at::text as updated_at from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    assert.notEqual(refreshed.rows[0]?.updated_at, snapshot.rows[0]?.updated_at);
    assert.equal(await updatePendingCustomerPropertySubmissionReview(sql, {
      action: "reject",
      id: "submission-1",
      expectedUpdatedAt: snapshot.rows[0]!.updated_at,
      reviewNote: "stale reject",
    }), false);
    const current = await pg.query<{ status: string; property_data: { title: string } }>(
      "select status,property_data from customer_property_submissions where id=$1",
      ["submission-1"],
    );
    assert.equal(current.rows[0]?.status, "pending");
    assert.equal(current.rows[0]?.property_data.title, "Fresh edit");
  } finally {
    await pg.close();
  }
});

test("admin customer submission review route uses timestamp CAS and approval transactions", async () => {
  const route = await readFile(
    new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /updated_at::text as updated_at_text/i);
  assert.match(route, /updatePendingCustomerPropertySubmissionReview/);
  assert.match(route, /sql\.transaction\(async\s*\(transactionSql\)/);
  assert.match(route, /where id=\$1 and status='pending' returning id/i);
});
