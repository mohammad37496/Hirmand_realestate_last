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
import { bulkRejectPendingCustomerPropertySubmissions, resubmitCustomerPropertySubmissionWithLeadSync } from "./customer-property-submission-lead-sync.ts";
import type { Sql } from "./db.ts";

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

async function createSubmissionSyncFixture(options: {
  failLeadUpdate?: boolean;
  failLeadActivity?: boolean;
  failOwnerEvent?: boolean;
} = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table customer_property_submissions (
      id text primary key,
      status text not null,
      updated_at timestamptz not null,
      review_note text not null default '',
      reviewed_at timestamptz,
      queue_started_at timestamptz not null default current_timestamp,
      owner_name text not null,
      owner_phone text not null,
      property_data jsonb not null,
      lead_id text
    );
    create table leads (
      id text primary key,
      status text not null default 'new',
      updated_at timestamptz not null default current_timestamp,
      follow_up_at timestamptz,
      name text,
      phone text,
      job text,
      deal text,
      property_type text,
      neighborhood text,
      note text
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id),
      activity_type text not null,
      title text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb
    );
    create table customer_property_submission_events (
      id text primary key,
      submission_id text not null references customer_property_submissions(id),
      action text not null,
      note text not null,
      metadata jsonb not null default '{}'::jsonb
    );
    insert into leads(id,status,name,phone) values ('lead-1','closed','مالک قبلی','09111111111'), ('lead-2','new','مالک دوم','09122222222');
    insert into customer_property_submissions(id,status,updated_at,owner_name,owner_phone,property_data,lead_id)
      values
        ('submission-1','rejected','2026-11-08 12:00:00.123456+00','مالک قبلی','09111111111','{}'::jsonb,'lead-1'),
        ('submission-2','pending','2026-11-08 12:00:00.654321+00','مالک دوم','09122222222','{}'::jsonb,'lead-2');
    ${options.failLeadUpdate ? `create function reject_lead_sync() returns trigger language plpgsql as $$ begin raise exception 'lead sync unavailable'; end $$;
      create trigger reject_lead_sync before update on leads for each row execute function reject_lead_sync();` : ""}
    ${options.failLeadActivity ? `create function reject_submission_lead_activity() returns trigger language plpgsql as $$ begin raise exception 'lead activity unavailable'; end $$;
      create trigger reject_submission_lead_activity before insert on lead_activities for each row execute function reject_submission_lead_activity();` : ""}
    ${options.failOwnerEvent ? `create function reject_submission_owner_event() returns trigger language plpgsql as $$ begin raise exception 'owner event unavailable'; end $$;
      create trigger reject_submission_owner_event before insert on customer_property_submission_events for each row execute function reject_submission_owner_event();` : ""}
  `);

  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;
  return { pg, sql };
}

const resubmitInput = {
  id: "submission-1",
  expectedUpdatedAt: "2026-11-08 12:00:00.123456+00",
  ownerName: "مالک جدید",
  ownerPhone: "09123456789",
  propertyData: JSON.stringify({ title: "ملک اصلاح‌شده" }),
  previousReviewNote: "تصویر سند را اصلاح کنید",
  trackingToken: "tracking-1",
  leadId: "lead-1",
  deal: "اصلاح ثبت ملک - اجاره",
  propertyType: "آپارتمان",
  neighborhood: "مرداویج",
  leadNote: "اطلاعات اصلاح‌شده مالک",
};

test("customer resubmission commits the submission, linked lead and both timelines together", async () => {
  const { pg, sql } = await createSubmissionSyncFixture();
  try {
    assert.equal(await resubmitCustomerPropertySubmissionWithLeadSync(sql, resubmitInput), true);
    const submission = await sql.query("select status,owner_name,owner_phone from customer_property_submissions where id='submission-1'");
    const lead = await sql.query("select status,name,phone,deal,property_type,neighborhood,note from leads where id='lead-1'");
    const activities = await sql.query("select activity_type,title,note from lead_activities where lead_id='lead-1'");
    const events = await sql.query("select action,note,metadata from customer_property_submission_events where submission_id='submission-1'");
    assert.deepEqual(submission, [{ status: "pending", owner_name: "مالک جدید", owner_phone: "09123456789" }]);
    assert.deepEqual(lead, [{ status: "new", name: "مالک جدید", phone: "09123456789", deal: "اصلاح ثبت ملک - اجاره", property_type: "آپارتمان", neighborhood: "مرداویج", note: "اطلاعات اصلاح‌شده مالک" }]);
    assert.equal(activities.length, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "resubmit");
  } finally {
    await pg.close();
  }
});

for (const failure of ["failLeadUpdate", "failLeadActivity", "failOwnerEvent"] as const) {
  test(`customer resubmission rolls back when ${failure} fails`, async () => {
    const { pg, sql } = await createSubmissionSyncFixture({ [failure]: true });
    try {
      await assert.rejects(resubmitCustomerPropertySubmissionWithLeadSync(sql, resubmitInput));
      assert.deepEqual(await sql.query("select status,owner_name from customer_property_submissions where id='submission-1'"), [{ status: "rejected", owner_name: "مالک قبلی" }]);
      assert.deepEqual(await sql.query("select status,name from leads where id='lead-1'"), [{ status: "closed", name: "مالک قبلی" }]);
      assert.deepEqual(await sql.query("select id from lead_activities"), []);
      assert.deepEqual(await sql.query("select id from customer_property_submission_events"), []);
    } finally {
      await pg.close();
    }
  });
}

test("stale customer resubmission does not touch its linked lead or timelines", async () => {
  const { pg, sql } = await createSubmissionSyncFixture();
  try {
    assert.equal(await resubmitCustomerPropertySubmissionWithLeadSync(sql, {
      ...resubmitInput,
      expectedUpdatedAt: "2026-11-08 11:59:00.000000+00",
    }), false);
    assert.deepEqual(await sql.query("select status from customer_property_submissions where id='submission-1'"), [{ status: "rejected" }]);
    assert.deepEqual(await sql.query("select status from leads where id='lead-1'"), [{ status: "closed" }]);
    assert.deepEqual(await sql.query("select id from lead_activities"), []);
    assert.deepEqual(await sql.query("select id from customer_property_submission_events"), []);
  } finally {
    await pg.close();
  }
});

test("bulk rejection commits each pending submission, linked lead and both timelines together", async () => {
  const { pg, sql } = await createSubmissionSyncFixture();
  try {
    const updatedCount = await bulkRejectPendingCustomerPropertySubmissions(sql, {
      ids: ["submission-1", "submission-2"],
      reviewNote: "مدارک کافی نیست",
    });
    assert.equal(updatedCount, 1);
    assert.deepEqual(await sql.query("select id,status from customer_property_submissions order by id"), [
      { id: "submission-1", status: "rejected" },
      { id: "submission-2", status: "rejected" },
    ]);
    assert.deepEqual(await sql.query("select id,status from leads order by id"), [
      { id: "lead-1", status: "closed" },
      { id: "lead-2", status: "closed" },
    ]);
    assert.equal((await sql.query("select id from lead_activities")).length, 1);
    assert.equal((await sql.query("select id from customer_property_submission_events")).length, 1);
  } finally {
    await pg.close();
  }
});

for (const failure of ["failLeadUpdate", "failLeadActivity", "failOwnerEvent"] as const) {
  test(`bulk rejection rolls back all changes when ${failure} fails`, async () => {
    const { pg, sql } = await createSubmissionSyncFixture({ [failure]: true });
    try {
      await assert.rejects(bulkRejectPendingCustomerPropertySubmissions(sql, {
        ids: ["submission-2"],
        reviewNote: "مدارک کافی نیست",
      }));
      assert.deepEqual(await sql.query("select status from customer_property_submissions where id='submission-2'"), [{ status: "pending" }]);
      assert.deepEqual(await sql.query("select status from leads where id='lead-2'"), [{ status: "new" }]);
      assert.deepEqual(await sql.query("select id from lead_activities"), []);
      assert.deepEqual(await sql.query("select id from customer_property_submission_events"), []);
    } finally {
      await pg.close();
    }
  });
}

test("bulk rejection skips submissions that are no longer pending", async () => {
  const { pg, sql } = await createSubmissionSyncFixture();
  try {
    assert.equal(await bulkRejectPendingCustomerPropertySubmissions(sql, { ids: ["submission-1"], reviewNote: "note" }), 0);
    assert.deepEqual(await sql.query("select status from customer_property_submissions where id='submission-1'"), [{ status: "rejected" }]);
    assert.deepEqual(await sql.query("select id from customer_property_submission_events"), []);
  } finally {
    await pg.close();
  }
});

test("customer submission lead sync fails closed without transaction support", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(resubmitCustomerPropertySubmissionWithLeadSync(sql, resubmitInput), /transaction support is required/);
  await assert.rejects(bulkRejectPendingCustomerPropertySubmissions(sql, { ids: ["submission-1"], reviewNote: "note" }), /transaction support is required/);
});

test("customer submission resubmit and bulk reject routes use transactional lead-sync helpers", async () => {
  const resubmitRoute = await readFile(
    new URL("../../server/routes/api/customer-property-submissions.post.ts", import.meta.url),
    "utf8",
  );
  const adminRoute = await readFile(
    new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(resubmitRoute, /resubmitCustomerPropertySubmissionWithLeadSync\(sql/);
  const resubmitStart = resubmitRoute.indexOf("const previousReviewNote");
  const resubmitEnd = resubmitRoute.indexOf("return {", resubmitStart);
  assert.doesNotMatch(resubmitRoute.slice(resubmitStart, resubmitEnd), /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  assert.match(adminRoute, /bulkRejectPendingCustomerPropertySubmissions\(sql/);
  const bulkStart = adminRoute.indexOf('if (action === "bulk_set_priority" || action === "bulk_reject")');
  const bulkEnd = adminRoute.indexOf('if (action === "export")', bulkStart);
  assert.doesNotMatch(adminRoute.slice(bulkStart, bulkEnd), /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});
