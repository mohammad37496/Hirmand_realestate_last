import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildCustomerPropertySubmissionApprovalSql } from "../src/lib/customer-property-submission-approval.ts";
import { resubmitCustomerPropertySubmission } from "../src/lib/customer-property-submission-resubmit.ts";
import {
  cancelPropertyVisit,
  checkPropertyVisitSlot,
  lockPropertyVisitSchedule,
  planLeadVisitMerge,
  reschedulePropertyVisit,
} from "../src/lib/property-visit-scheduling.server.ts";
import { lockLeadDedupeSnapshot, mergeLeadDedupeRelations } from "../src/lib/admin-lead-dedupe.server.ts";
import { UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL } from "../src/lib/admin-lead-mutation-sql.ts";
import {
  createOpenHouseSchedule,
  registerOpenHouseRsvp,
} from "../src/lib/property-open-house-scheduling.server.ts";
import { acquireMigrationAdvisoryLock } from "./migration-lock.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the real PostgreSQL database API integration suite.");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl, max: 6, connectionTimeoutMillis: 5_000 });
const schema = `qa_dbapi_${randomUUID().replaceAll("-", "")}`;
const clients = [];
let schemaCreated = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectInSchema() {
  const client = await pool.connect();
  clients.push(client);
  await client.query(`SET search_path TO ${schema}`);
  return client;
}

function releaseClient(client) {
  const index = clients.indexOf(client);
  if (index >= 0) clients.splice(index, 1);
  client.release();
}

function sqlFor(client) {
  return {
    query: async (text, params = []) => (await client.query(text, params)).rows,
  };
}

async function inTransaction(client, callback, { delayInsertMs = 0 } = {}) {
  await client.query("BEGIN");
  try {
    const tx = {
      query: async (text, params = []) => {
        if (delayInsertMs > 0 && /^\s*insert into (?:property_open_houses|property_open_house_rsvps)\b/i.test(text)) {
          await new Promise((resolve) => setTimeout(resolve, delayInsertMs));
        }
        return (await client.query(text, params)).rows;
      },
    };
    const result = await callback(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function mergeUsingRouteSnapshot(tx, canonicalId, duplicateId) {
  const snapshotRows = await tx.query(
    "select id,status,merged_into_lead_id,property_id,visit_preferred_at,visit_status from leads where id=any($1::text[]) order by id",
    [[canonicalId, duplicateId]],
  );
  if (snapshotRows.length !== 2) return { kind: "missing" };
  const byId = new Map(snapshotRows.map((row) => [row.id, row]));
  const canonicalSnapshot = byId.get(canonicalId);
  const duplicateSnapshot = byId.get(duplicateId);
  if (!canonicalSnapshot || !duplicateSnapshot) return { kind: "missing" };

  const activeProperties = [canonicalSnapshot, duplicateSnapshot]
    .filter((lead) => lead.visit_status === "requested" || lead.visit_status === "confirmed")
    .map((lead) => lead.property_id == null ? "" : String(lead.property_id).trim())
    .filter(Boolean);
  for (const propertyId of [...new Set(activeProperties)].sort()) {
    if (!await lockPropertyVisitSchedule(tx, propertyId)) return { kind: "property_missing" };
  }

  const locked = await lockLeadDedupeSnapshot(tx, canonicalId, duplicateId, snapshotRows);
  if (locked.kind !== "locked") return locked;
  const visitPlan = planLeadVisitMerge(locked.canonical, locked.duplicate);
  if (visitPlan.kind === "conflicting_visits") return { kind: "conflicting_visits" };
  if (visitPlan.kind === "keep_canonical" || visitPlan.kind === "move_duplicate") {
    const slot = await checkPropertyVisitSlot(tx, {
      propertyId: visitPlan.propertyId,
      visitAt: new Date(Date.parse(visitPlan.visitAt)).toISOString(),
      excludeLeadIds: [canonicalId, duplicateId],
    });
    if (slot.kind !== "available") return { kind: slot.kind === "property_missing" ? "property_missing" : "visit_conflict" };
  }
  if (locked.canonical.merged_into_lead_id || locked.duplicate.merged_into_lead_id) return { kind: "stale" };
  const mutation = await mergeLeadDedupeRelations(tx, canonicalId, duplicateId);
  return mutation ? { kind: "merged", mutation } : { kind: "stale" };
}

async function waitForLockWait(observer, pid, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await observer.query(
      "select wait_event_type from pg_stat_activity where pid=$1",
      [pid],
    );
    if (rows.rows[0]?.wait_event_type === "Lock") return;
    await pause(10);
  }
  throw new Error(`Timed out waiting for PostgreSQL lock contention: ${label}`);
}

function approvalParams(propertyId, submissionId, eventId, slug) {
  const params = Array.from({ length: 48 }, () => null);
  params[0] = propertyId;
  params[1] = "PostgreSQL integration property";
  params[41] = submissionId;
  params[42] = "PostgreSQL integration approval";
  params[43] = "2026-10-31T00:00:00.123456Z";
  params[44] = JSON.stringify({ title: "PostgreSQL integration property", status: "published" });
  params[45] = eventId;
  params[46] = JSON.stringify({ propertyId, propertySlug: slug, source: "database-api-postgres-integration" });
  params[47] = slug;
  return params;
}

function approvalStatement() {
  // Match the production 48-parameter contract, including the typed property
  // fields that are not needed by this minimal isolated-schema fixture.
  const typedUnusedParams = Array.from({ length: 39 }, (_, index) => `$${index + 3}::text as unused_${index}`).join(",");
  return buildCustomerPropertySubmissionApprovalSql(
    `insert into properties (id,title)
     select $1,$2 from claimed cross join (select ${typedUnusedParams}) typed_params returning id`,
  );
}

async function createSchemaFixture(admin) {
  await admin.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  await admin.query(`SET search_path TO ${schema}`);
  await admin.query(`
    CREATE TABLE customer_property_submissions (
      id text PRIMARY KEY,
      lead_id text,
      status text NOT NULL,
      property_id text,
      review_note text NOT NULL DEFAULT '',
      reviewed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      queue_started_at timestamptz,
      owner_name text,
      owner_phone text,
      property_data jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE properties (
      id text PRIMARY KEY, title text NOT NULL,
      status text NOT NULL DEFAULT 'published', availability_status text NOT NULL DEFAULT 'available',
      property_type text NOT NULL DEFAULT '', neighborhood text NOT NULL DEFAULT '', contact_name text NOT NULL DEFAULT '',
      deleted_at timestamptz, publish_at timestamptz, unpublish_at timestamptz
    );
    CREATE TABLE leads (
      id text PRIMARY KEY, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz,
      property_id text, visit_preferred_at timestamptz, visit_status text NOT NULL DEFAULT 'none',
      visit_requested_at timestamptz, public_tracking_token text,
      name text, phone text, people_count integer, job text, deal text, property_type text,
      neighborhood text, consultant text, note text, source text, acquisition_source text,
      acquisition_medium text, acquisition_campaign text, acquisition_referrer text,
      follow_up_at timestamptz, last_contacted_at timestamptz, callback_preferred_at timestamptz,
      offer_amount numeric, offer_conditions text, lease_deadline timestamptz,
      budget_deposit numeric, budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric, budget_rent_max numeric,
      budget_purchase_min numeric, budget_purchase_max numeric, budget_sale_min numeric, budget_sale_max numeric,
      budget_equivalent numeric, budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
      matched_properties jsonb NOT NULL DEFAULT '[]'::jsonb, match_count integer NOT NULL DEFAULT 0
    );
    CREATE TABLE lead_activities (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      lead_id text NOT NULL,
      activity_type text NOT NULL,
      title text NOT NULL,
      note text NOT NULL,
      metadata jsonb NOT NULL
    );
    CREATE TABLE admin_deals (
      id text PRIMARY KEY, lead_id text, updated_at timestamptz NOT NULL DEFAULT current_timestamp
    );
    CREATE TABLE finance_transactions (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, lead_id text
    );
    CREATE TABLE admin_tasks (
      id text PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')),
      entity_type text NOT NULL, entity_id text, dedupe_key text,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp
    );
    CREATE UNIQUE INDEX admin_tasks_one_open_lead_overdue_followup_idx
      ON admin_tasks(entity_type,entity_id,dedupe_key)
      WHERE status='open' AND dedupe_key='overdue_follow_up';
    CREATE TABLE property_change_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      property_id text NOT NULL,
      action text NOT NULL,
      before_state jsonb,
      after_state jsonb
    );
    CREATE TABLE customer_property_submission_events (
      id text PRIMARY KEY,
      submission_id text NOT NULL,
      action text NOT NULL,
      note text NOT NULL,
      metadata jsonb NOT NULL
    );
  `);
}

try {
  const admin = await pool.connect();
  clients.push(admin);
  await createSchemaFixture(admin);
  // The merge statement uses columns introduced by the same production
  // migrations as the application schema. Keep this isolated PostgreSQL
  // fixture aligned with those migrations instead of duplicating their DDL.
  for (const migrationName of [
    "0016_lead_attribution.sql",
    "0038_lead_floor_preference.sql",
    "0107_lead_area_preferences.sql",
    "0111_atomic_lead_dedupe.sql",
  ]) {
    const migration = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), "utf8");
    await admin.query(migration);
  }

  await admin.query(`
    CREATE TABLE property_open_houses (
      id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id),
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      capacity integer NOT NULL, note text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'scheduled', created_at timestamptz NOT NULL DEFAULT current_timestamp
    );
    CREATE TABLE property_open_house_rsvps (
      id text PRIMARY KEY, open_house_id text NOT NULL REFERENCES property_open_houses(id),
      name text NOT NULL, phone text NOT NULL, party_size integer NOT NULL,
      note text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'requested',
      created_at timestamptz NOT NULL DEFAULT current_timestamp
    );
    INSERT INTO properties(id,title,status) VALUES ('open-house-property','Open house integration property','published');
  `);
  const openHouseMigration = await readFile(new URL("../migrations/0108_open_house_rsvp_concurrency.sql", import.meta.url), "utf8");
  await admin.query(openHouseMigration);

  const scheduleA = await connectInSchema();
  const scheduleB = await connectInSchema();
  const overlapResults = await Promise.all([
    inTransaction(scheduleA, (tx) => createOpenHouseSchedule(tx, {
      id: "open-house-a", propertyId: "open-house-property",
      startsAt: "2030-06-01T10:00:00Z", endsAt: "2030-06-01T12:00:00Z", capacity: 1, note: "",
    }), { delayInsertMs: 150 }),
    inTransaction(scheduleB, (tx) => createOpenHouseSchedule(tx, {
      id: "open-house-b", propertyId: "open-house-property",
      startsAt: "2030-06-01T11:00:00Z", endsAt: "2030-06-01T13:00:00Z", capacity: 1, note: "",
    }), { delayInsertMs: 150 }),
  ]);
  assert.equal(overlapResults.filter((result) => result.kind === "created").length, 1);
  assert.equal(overlapResults.filter((result) => result.kind === "overlap").length, 1);
  const createdOpenHouseId = overlapResults.find((result) => result.kind === "created")?.id;
  assert.ok(createdOpenHouseId, "one overlapping open-house event must be created");
  console.log("ok   PostgreSQL property row lock prevents concurrent overlapping open-house events");

  const capacityResults = await Promise.all([
    inTransaction(scheduleA, (tx) => registerOpenHouseRsvp(tx, {
      id: "open-house-rsvp-a", eventId: createdOpenHouseId, name: "Guest A", phone: "09130000001", partySize: 1, note: "",
    }, new Date("2030-01-01T00:00:00Z")), { delayInsertMs: 150 }),
    inTransaction(scheduleB, (tx) => registerOpenHouseRsvp(tx, {
      id: "open-house-rsvp-b", eventId: createdOpenHouseId, name: "Guest B", phone: "09130000002", partySize: 1, note: "",
    }, new Date("2030-01-01T00:00:00Z")), { delayInsertMs: 150 }),
  ]);
  assert.equal(capacityResults.filter((result) => result.kind === "created").length, 1);
  assert.equal(capacityResults.filter((result) => result.kind === "full").length, 1);
  const bookedSeats = await admin.query(
    "SELECT coalesce(sum(party_size),0)::int AS seats FROM property_open_house_rsvps WHERE open_house_id=$1 AND status <> 'cancelled'",
    [createdOpenHouseId],
  );
  assert.equal(bookedSeats.rows[0]?.seats, 1);
  console.log("ok   PostgreSQL event row lock prevents concurrent RSVP capacity oversubscription");

  await admin.query(
    "INSERT INTO property_open_houses(id,property_id,starts_at,ends_at,capacity) VALUES ('open-house-duplicate','open-house-property','2030-06-02T10:00:00Z','2030-06-02T12:00:00Z',8)",
  );
  const duplicateResults = await Promise.all([
    inTransaction(scheduleA, (tx) => registerOpenHouseRsvp(tx, {
      id: "open-house-duplicate-a", eventId: "open-house-duplicate", name: "Guest A", phone: "09130000003", partySize: 1, note: "",
    }, new Date("2030-01-01T00:00:00Z")), { delayInsertMs: 150 }),
    inTransaction(scheduleB, (tx) => registerOpenHouseRsvp(tx, {
      id: "open-house-duplicate-b", eventId: "open-house-duplicate", name: "Guest B", phone: "09130000003", partySize: 1, note: "",
    }, new Date("2030-01-01T00:00:00Z")), { delayInsertMs: 150 }),
  ]);
  assert.equal(duplicateResults.filter((result) => result.kind === "created").length, 1);
  assert.equal(duplicateResults.filter((result) => result.kind === "duplicate").length, 1);
  await assert.rejects(
    admin.query(
      "INSERT INTO property_open_house_rsvps(id,open_house_id,name,phone,party_size) VALUES ('open-house-duplicate-direct','open-house-duplicate','Guest C','09130000003',1)",
    ),
    /unique/i,
  );
  console.log("ok   PostgreSQL event row lock and partial unique index prevent duplicate active phone RSVPs");

  let releasePropertyAvailability;
  let propertyAvailabilityLocked;
  const propertyAvailabilityStarted = new Promise((resolve) => { propertyAvailabilityLocked = resolve; });
  const allowPropertyAvailabilityCommit = new Promise((resolve) => { releasePropertyAvailability = resolve; });
  const markOpenHousePropertyUnavailable = inTransaction(scheduleA, async (tx) => {
    await tx.query("UPDATE properties SET availability_status='sold' WHERE id='open-house-property'");
    propertyAvailabilityLocked();
    await allowPropertyAvailabilityCommit;
  });
  await propertyAvailabilityStarted;
  const scheduleBPid = Number((await scheduleB.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  const createAfterSale = inTransaction(scheduleB, (tx) => createOpenHouseSchedule(tx, {
    id: "open-house-after-sale",
    propertyId: "open-house-property",
    startsAt: "2030-06-04T10:00:00Z",
    endsAt: "2030-06-04T12:00:00Z",
    capacity: 8,
    note: "",
  }));
  await waitForLockWait(admin, scheduleBPid, "open-house creation waits for property availability update");
  releasePropertyAvailability();
  await markOpenHousePropertyUnavailable;
  assert.deepEqual(await createAfterSale, { kind: "property_missing" });

  await admin.query("UPDATE properties SET availability_status='available' WHERE id='open-house-property'");
  await admin.query(
    "INSERT INTO property_open_houses(id,property_id,starts_at,ends_at,capacity) VALUES ('open-house-after-sale-rsvp','open-house-property','2030-06-05T10:00:00Z','2030-06-05T12:00:00Z',8)",
  );
  await admin.query("UPDATE properties SET availability_status='sold' WHERE id='open-house-property'");
  const rsvpAfterSale = await inTransaction(scheduleA, (tx) => registerOpenHouseRsvp(tx, {
    id: "open-house-rsvp-after-sale",
    eventId: "open-house-after-sale-rsvp",
    name: "Guest",
    phone: "09130000005",
    partySize: 1,
    note: "",
  }, new Date("2030-01-01T00:00:00Z")));
  assert.deepEqual(rsvpAfterSale, { kind: "property_unavailable" });
  assert.equal((await admin.query("SELECT id FROM property_open_house_rsvps WHERE id='open-house-rsvp-after-sale'")).rowCount, 0);
  console.log("ok   PostgreSQL property row lock blocks open-house creation and RSVP after a property is sold");
  releaseClient(scheduleA);
  releaseClient(scheduleB);

  await admin.query("INSERT INTO properties(id,title) VALUES ('visit-scheduling-property','Visit scheduling integration property')");
  const visitA = await connectInSchema();
  const visitB = await connectInSchema();
  const createVisit = (client, id) => inTransaction(client, async (tx) => {
    const slot = await checkPropertyVisitSlot(tx, {
      propertyId: "visit-scheduling-property",
      visitAt: "2030-06-03T10:00:00Z",
    });
    if (slot.kind !== "available") return slot.kind;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await tx.query(
      "INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status) VALUES ($1,'new','visit-scheduling-property','2030-06-03T10:00:00Z','requested')",
      [id],
    );
    return "created";
  });
  const visitCreateResults = await Promise.all([
    createVisit(visitA, "visit-race-a"),
    createVisit(visitB, "visit-race-b"),
  ]);
  assert.equal(visitCreateResults.filter((result) => result === "created").length, 1);
  assert.equal(visitCreateResults.filter((result) => result === "conflict").length, 1);
  console.log("ok   PostgreSQL property row lock prevents concurrent public visit bookings");

  await admin.query(
    "INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status,public_tracking_token) VALUES ('visit-reschedule-race','new','visit-scheduling-property','2030-06-03T12:00:00Z','confirmed','HIR-30-ABCDEF123456')",
  );
  const delayedVisitSql = {
    query: async (text, params = []) => {
      if (/^\s*update leads/i.test(text)) await new Promise((resolve) => setTimeout(resolve, 150));
      return (await visitA.query(text, params)).rows;
    },
  };
  const reschedulePromise = inTransaction(visitA, () => reschedulePropertyVisit(delayedVisitSql, {
    leadId: "visit-reschedule-race",
    trackingToken: "HIR-30-ABCDEF123456",
    propertyId: "visit-scheduling-property",
    expectedVisitAt: "2030-06-03T12:00:00Z",
    visitAt: "2030-06-03T14:00:00Z",
  }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const delayedCancelSql = {
    query: async (text, params = []) => {
      if (/^\s*update leads/i.test(text)) await new Promise((resolve) => setTimeout(resolve, 250));
      return (await visitB.query(text, params)).rows;
    },
  };
  const cancelPromise = inTransaction(visitB, () => cancelPropertyVisit(delayedCancelSql, {
    leadId: "visit-reschedule-race",
    trackingToken: "HIR-30-ABCDEF123456",
    propertyId: "visit-scheduling-property",
    expectedVisitAt: "2030-06-03T12:00:00Z",
  }));
  assert.equal(await reschedulePromise, "rescheduled");
  assert.equal(await cancelPromise, "stale");
  const cancelledVisit = await admin.query("SELECT visit_status,visit_preferred_at FROM leads WHERE id='visit-reschedule-race'");
  assert.equal(cancelledVisit.rows[0]?.visit_status, "requested");
  assert.equal(new Date(cancelledVisit.rows[0]?.visit_preferred_at).toISOString(), "2030-06-03T14:00:00.000Z");
  console.log("ok   PostgreSQL property lock and snapshot compare-and-set prevent stale cancellation of a rescheduled visit");

  await admin.query(
    "INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status,public_tracking_token) VALUES ('visit-reschedule-after-sale','new','visit-scheduling-property','2030-06-03T16:00:00Z','confirmed','HIR-30-SOLD123456')",
  );
  await admin.query("UPDATE properties SET availability_status='sold' WHERE id='visit-scheduling-property'");
  const rescheduleAfterSale = await inTransaction(visitA, (tx) => reschedulePropertyVisit(tx, {
    leadId: "visit-reschedule-after-sale",
    trackingToken: "HIR-30-SOLD123456",
    propertyId: "visit-scheduling-property",
    expectedVisitAt: "2030-06-03T16:00:00Z",
    visitAt: "2030-06-03T18:00:00Z",
  }));
  assert.equal(rescheduleAfterSale, "property_missing");
  const unchangedAfterSale = await admin.query(
    "SELECT visit_status,visit_preferred_at FROM leads WHERE id='visit-reschedule-after-sale'",
  );
  assert.equal(unchangedAfterSale.rows[0]?.visit_status, "confirmed");
  assert.equal(new Date(unchangedAfterSale.rows[0]?.visit_preferred_at).toISOString(), "2030-06-03T16:00:00.000Z");
  await admin.query("UPDATE properties SET availability_status='available' WHERE id='visit-scheduling-property'");
  console.log("ok   PostgreSQL public reschedule refuses a property that became sold after the original visit");

  await admin.query(`
    INSERT INTO leads(id,status,name,phone,property_id,visit_preferred_at,visit_requested_at,visit_status)
    VALUES ('dedupe-canonical','new','Canonical','09130000004','visit-scheduling-property','2030-06-03T08:00:00Z','2030-06-03T08:00:00Z','none'),
           ('dedupe-duplicate','new','Duplicate','09130000004','visit-scheduling-property','2030-06-04T10:00:00Z','2030-06-04T09:00:00Z','requested');
    INSERT INTO lead_activities(lead_id,activity_type,title,note,metadata)
    VALUES ('dedupe-duplicate','visit','Visit requested','', '{}'::jsonb);
    INSERT INTO admin_deals(id,lead_id) VALUES ('dedupe-deal','dedupe-duplicate');
    INSERT INTO finance_transactions(lead_id) VALUES ('dedupe-duplicate');
    INSERT INTO admin_tasks(id,title,entity_type,entity_id,dedupe_key,created_at) VALUES
      ('dedupe-task-canonical-old','Old overdue','lead','dedupe-canonical','overdue_follow_up','2026-10-01T00:00:00Z'),
      ('dedupe-task-duplicate-new','New overdue','lead','dedupe-duplicate','overdue_follow_up','2026-10-02T00:00:00Z'),
      ('dedupe-task-duplicate-normal','Call customer','lead','dedupe-duplicate',null,'2026-10-03T00:00:00Z');
  `);
  const mergeClientA = await connectInSchema();
  const mergeClientB = await connectInSchema();
  const delayedMergeSql = {
    query: async (text, params = []) => {
      const rows = (await mergeClientA.query(text, params)).rows;
      if (/^\s*with locked as materialized/i.test(text)) await new Promise((resolve) => setTimeout(resolve, 220));
      return rows;
    },
  };
  const firstMerge = inTransaction(mergeClientA, (_tx) => mergeLeadDedupeRelations(delayedMergeSql, "dedupe-canonical", "dedupe-duplicate"));
  await new Promise((resolve) => setTimeout(resolve, 35));
  const secondMerge = inTransaction(mergeClientB, (tx) => mergeLeadDedupeRelations(tx, "dedupe-canonical", "dedupe-duplicate"));
  const [dedupeResult, repeatedDedupeResult] = await Promise.all([firstMerge, secondMerge]);
  assert.deepEqual(dedupeResult, {
    movedActivities: 1,
    movedDeals: 1,
    movedFinanceTransactions: 1,
    movedTasks: 2,
    cancelledTaskCollisions: 1,
  });
  assert.equal(repeatedDedupeResult, null, "a concurrent second merge must observe the committed merged marker and become stale");
  const mergedVisitRows = await admin.query(
    "SELECT id,visit_status,visit_preferred_at::text AS visit_preferred_at FROM leads WHERE id IN ('dedupe-canonical','dedupe-duplicate') ORDER BY id",
  );
  assert.equal(mergedVisitRows.rows[0]?.visit_status, "requested");
  assert.equal(new Date(mergedVisitRows.rows[0]?.visit_preferred_at).toISOString(), "2030-06-04T10:00:00.000Z");
  assert.equal(mergedVisitRows.rows[1]?.visit_status, "cancelled");
  assert.equal((await admin.query("SELECT merged_into_lead_id FROM leads WHERE id='dedupe-duplicate'")).rows[0]?.merged_into_lead_id, "dedupe-canonical");
  assert.equal((await admin.query("SELECT lead_id FROM admin_deals WHERE id='dedupe-deal'")).rows[0]?.lead_id, "dedupe-canonical");
  assert.equal((await admin.query("SELECT lead_id FROM finance_transactions")).rows[0]?.lead_id, "dedupe-canonical");
  assert.equal((await admin.query("SELECT count(*)::int AS count FROM admin_tasks WHERE entity_id='dedupe-canonical' AND status='open'")).rows[0]?.count, 2);
  assert.equal((await admin.query("SELECT status FROM admin_tasks WHERE id='dedupe-task-canonical-old'")).rows[0]?.status, "cancelled");
  assert.equal((await admin.query("SELECT count(*)::int AS count FROM lead_activities WHERE title='ادغام لید تکراری'")).rows[0]?.count, 1);
  console.log("ok   PostgreSQL dedupe transaction moves internal relationships, preserves one overdue task, and rejects concurrent replay");
  releaseClient(mergeClientA);
  releaseClient(mergeClientB);

  await admin.query(`
    INSERT INTO leads(id,status,name,phone) VALUES ('dedupe-fail-canonical','new','Canonical fail','09130000005'),('dedupe-fail-duplicate','new','Duplicate fail','09130000005');
    INSERT INTO lead_activities(lead_id,activity_type,title,note,metadata) VALUES ('dedupe-fail-duplicate','call','Keep original','', '{}'::jsonb);
    INSERT INTO admin_deals(id,lead_id) VALUES ('dedupe-fail-deal','dedupe-fail-duplicate');
    INSERT INTO finance_transactions(lead_id) VALUES ('dedupe-fail-duplicate');
    CREATE FUNCTION qa_fail_dedupe_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.title='ادغام لید تکراری' THEN RAISE EXCEPTION 'qa injected dedupe history failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER qa_fail_dedupe_history BEFORE INSERT ON lead_activities FOR EACH ROW EXECUTE FUNCTION qa_fail_dedupe_history();
  `);
  const historyFailureClient = await connectInSchema();
  await assert.rejects(
    inTransaction(historyFailureClient, (tx) => mergeLeadDedupeRelations(tx, "dedupe-fail-canonical", "dedupe-fail-duplicate")),
    /qa injected dedupe history failure/,
  );
  assert.equal((await admin.query("SELECT status,merged_into_lead_id FROM leads WHERE id='dedupe-fail-duplicate'")).rows[0]?.status, "new");
  assert.equal((await admin.query("SELECT lead_id FROM lead_activities WHERE title='Keep original'")).rows[0]?.lead_id, "dedupe-fail-duplicate");
  assert.equal((await admin.query("SELECT lead_id FROM admin_deals WHERE id='dedupe-fail-deal'")).rows[0]?.lead_id, "dedupe-fail-duplicate");
  assert.equal((await admin.query("SELECT lead_id FROM finance_transactions ORDER BY id DESC LIMIT 1")).rows[0]?.lead_id, "dedupe-fail-duplicate");
  await admin.query("DROP TRIGGER qa_fail_dedupe_history ON lead_activities; DROP FUNCTION qa_fail_dedupe_history();");
  console.log("ok   PostgreSQL history insert failure rolls back the duplicate close, activities, deals and finance links");
  releaseClient(historyFailureClient);

  await admin.query(`
    INSERT INTO leads(id,status,name,phone) VALUES ('dedupe-db-canonical','new','Canonical db','09130000006'),('dedupe-db-duplicate','new','Duplicate db','09130000006');
    INSERT INTO admin_deals(id,lead_id) VALUES ('dedupe-db-deal','dedupe-db-duplicate');
    INSERT INTO finance_transactions(lead_id) VALUES ('dedupe-db-duplicate');
    CREATE FUNCTION qa_fail_dedupe_finance_link() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'qa injected dedupe finance failure'; END;
    $$;
    CREATE TRIGGER qa_fail_dedupe_finance_link BEFORE UPDATE ON finance_transactions FOR EACH ROW EXECUTE FUNCTION qa_fail_dedupe_finance_link();
  `);
  const financeFailureClient = await connectInSchema();
  await assert.rejects(
    inTransaction(financeFailureClient, (tx) => mergeLeadDedupeRelations(tx, "dedupe-db-canonical", "dedupe-db-duplicate")),
    /qa injected dedupe finance failure/,
  );
  assert.equal((await admin.query("SELECT status,merged_into_lead_id FROM leads WHERE id='dedupe-db-duplicate'")).rows[0]?.status, "new");
  assert.equal((await admin.query("SELECT lead_id FROM admin_deals WHERE id='dedupe-db-deal'")).rows[0]?.lead_id, "dedupe-db-duplicate");
  assert.equal((await admin.query("SELECT count(*)::int AS count FROM lead_activities WHERE title='ادغام لید تکراری'")).rows[0]?.count, 1);
  await admin.query("DROP TRIGGER qa_fail_dedupe_finance_link ON finance_transactions; DROP FUNCTION qa_fail_dedupe_finance_link();");
  console.log("ok   PostgreSQL relationship database failure rolls back prior lead, history and deal writes");
  releaseClient(financeFailureClient);

  await admin.query("INSERT INTO properties(id,title) VALUES ('dedupe-visit-race-property','Dedupe visit race integration property')");
  await admin.query(`
    INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status)
    VALUES ('dedupe-visit-race-canonical','new','dedupe-visit-race-property','2030-06-03T09:00:00Z','none'),
           ('dedupe-visit-race-duplicate','new','dedupe-visit-race-property','2030-06-03T10:00:00Z','none');
  `);
  let releaseVisitActivation;
  let visitActivationStarted;
  const activationStarted = new Promise((resolve) => { visitActivationStarted = resolve; });
  const allowVisitActivation = new Promise((resolve) => { releaseVisitActivation = resolve; });
  const activationPromise = inTransaction(visitA, async (tx) => {
    const before = (await tx.query("SELECT status,visit_status FROM leads WHERE id='dedupe-visit-race-duplicate'"))[0];
    const slot = await checkPropertyVisitSlot(tx, {
      propertyId: "dedupe-visit-race-property",
      visitAt: "2030-06-03T10:00:00Z",
      excludeLeadIds: ["dedupe-visit-race-duplicate"],
    });
    assert.equal(slot.kind, "available");
    visitActivationStarted();
    await allowVisitActivation;
    await tx.query("SELECT id FROM leads WHERE id='dedupe-visit-race-duplicate' FOR UPDATE");
    return tx.query(UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, [
      "dedupe-visit-race-duplicate", "requested", "Visit requested", "Activation after merge", JSON.stringify({ visitStatus: "requested" }), before.visit_status, before.status,
    ]);
  });
  await activationStarted;
  await inTransaction(visitB, (tx) => mergeLeadDedupeRelations(tx, "dedupe-visit-race-canonical", "dedupe-visit-race-duplicate"));
  releaseVisitActivation();
  const staleActivation = await activationPromise;
  assert.equal(staleActivation.length, 0, "a request that read the pre-merge status must not reactivate the closed duplicate");
  assert.equal((await admin.query("SELECT status,visit_status FROM leads WHERE id='dedupe-visit-race-duplicate'")).rows[0]?.status, "closed");
  console.log("ok   PostgreSQL status CAS prevents a delayed visit activation from reopening a deduped lead");

  releaseClient(visitA);
  releaseClient(visitB);

  const terminalMergeClient = await connectInSchema();
  for (const terminalStatus of ["cancelled", "completed"]) {
    const canonicalId = `terminal-canonical-${terminalStatus}`;
    const duplicateId = `terminal-duplicate-${terminalStatus}`;
    await admin.query(
      `INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status)
       VALUES ($1,'new','visit-scheduling-property','2030-06-03T08:00:00Z',$3),
              ($2,'new','visit-scheduling-property','2030-06-03T10:00:00Z','requested')`,
      [canonicalId, duplicateId, terminalStatus],
    );
    const result = await inTransaction(terminalMergeClient, (tx) => mergeLeadDedupeRelations(tx, canonicalId, duplicateId));
    assert.equal(result, null, `an active duplicate visit must not be moved over canonical ${terminalStatus} history`);
    const rows = await admin.query(
      "SELECT id,status,visit_status,merged_into_lead_id FROM leads WHERE id=ANY($1::text[]) ORDER BY id",
      [[canonicalId, duplicateId]],
    );
    assert.equal(rows.rows.find((row) => row.id === canonicalId)?.visit_status, terminalStatus);
    assert.equal(rows.rows.find((row) => row.id === duplicateId)?.visit_status, "requested");
    assert.equal(rows.rows.find((row) => row.id === duplicateId)?.merged_into_lead_id, null);
  }
  releaseClient(terminalMergeClient);
  console.log("ok   PostgreSQL dedupe preserves cancelled/completed canonical visit history and leaves active duplicate visits untouched");

  const cancelOwner = await connectInSchema();
  const mergeWaiter = await connectInSchema();
  await admin.query(
    `INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status,public_tracking_token)
     VALUES ('cancel-before-merge-canonical','new','visit-scheduling-property',null,'none',null),
            ('cancel-before-merge-duplicate','new','visit-scheduling-property','2030-06-05T10:00:00Z','requested','HIR-30-CANCEL123456')`,
  );
  let allowCancelCommit;
  let signalCancelLocked;
  const cancelLocked = new Promise((resolve) => { signalCancelLocked = resolve; });
  const waitForCancelCommit = new Promise((resolve) => { allowCancelCommit = resolve; });
  const cancelFirst = inTransaction(cancelOwner, async (tx) => {
    const result = await cancelPropertyVisit(tx, {
      leadId: "cancel-before-merge-duplicate",
      trackingToken: "HIR-30-CANCEL123456",
      propertyId: "visit-scheduling-property",
      expectedVisitAt: "2030-06-05T10:00:00Z",
    });
    assert.equal(result, "cancelled");
    signalCancelLocked();
    await waitForCancelCommit;
    return result;
  });
  await cancelLocked;
  const mergeWaiterPid = Number((await mergeWaiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  const mergeAfterCancel = inTransaction(mergeWaiter, (tx) => mergeUsingRouteSnapshot(tx, "cancel-before-merge-canonical", "cancel-before-merge-duplicate"));
  await waitForLockWait(admin, mergeWaiterPid, "dedupe waits behind public cancellation");
  allowCancelCommit();
  assert.equal(await cancelFirst, "cancelled");
  assert.equal((await mergeAfterCancel).kind, "stale");
  const cancelFirstRows = await admin.query(
    "SELECT id,visit_status,merged_into_lead_id FROM leads WHERE id=ANY($1::text[]) ORDER BY id",
    [["cancel-before-merge-canonical", "cancel-before-merge-duplicate"]],
  );
  assert.equal(cancelFirstRows.rows.find((row) => row.id === "cancel-before-merge-canonical")?.visit_status, "none");
  assert.equal(cancelFirstRows.rows.find((row) => row.id === "cancel-before-merge-duplicate")?.visit_status, "cancelled");
  assert.equal(cancelFirstRows.rows.find((row) => row.id === "cancel-before-merge-duplicate")?.merged_into_lead_id, null);
  releaseClient(cancelOwner);
  releaseClient(mergeWaiter);

  const mergeOwner = await connectInSchema();
  const cancelWaiter = await connectInSchema();
  await admin.query(
    `INSERT INTO leads(id,status,property_id,visit_preferred_at,visit_status,public_tracking_token)
     VALUES ('merge-before-cancel-canonical','new','visit-scheduling-property',null,'none',null),
            ('merge-before-cancel-duplicate','new','visit-scheduling-property','2030-06-06T10:00:00Z','requested','HIR-30-MERGE123456')`,
  );
  let allowMergeCommit;
  let signalMergeLocked;
  const mergeLocked = new Promise((resolve) => { signalMergeLocked = resolve; });
  const waitForMergeCommit = new Promise((resolve) => { allowMergeCommit = resolve; });
  const mergeFirst = inTransaction(mergeOwner, async (tx) => {
    const result = await mergeUsingRouteSnapshot(tx, "merge-before-cancel-canonical", "merge-before-cancel-duplicate");
    assert.equal(result.kind, "merged");
    signalMergeLocked();
    await waitForMergeCommit;
    return result;
  });
  await mergeLocked;
  const cancelWaiterPid = Number((await cancelWaiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  const cancelAfterMerge = inTransaction(cancelWaiter, (tx) => cancelPropertyVisit(tx, {
    leadId: "merge-before-cancel-duplicate",
    trackingToken: "HIR-30-MERGE123456",
    propertyId: "visit-scheduling-property",
    expectedVisitAt: "2030-06-06T10:00:00Z",
  }));
  await waitForLockWait(admin, cancelWaiterPid, "public cancellation waits behind dedupe");
  allowMergeCommit();
  await mergeFirst;
  assert.equal(await cancelAfterMerge, "stale");
  const mergeFirstRows = await admin.query(
    "SELECT id,visit_status,visit_preferred_at,merged_into_lead_id FROM leads WHERE id=ANY($1::text[]) ORDER BY id",
    [["merge-before-cancel-canonical", "merge-before-cancel-duplicate"]],
  );
  assert.equal(mergeFirstRows.rows.find((row) => row.id === "merge-before-cancel-canonical")?.visit_status, "requested");
  assert.equal(mergeFirstRows.rows.find((row) => row.id === "merge-before-cancel-duplicate")?.visit_status, "cancelled");
  releaseClient(mergeOwner);
  releaseClient(cancelWaiter);
  console.log("ok   PostgreSQL two-connection cancellation/merge races preserve exactly the winning visit state without stale success or lost active bookings");

  const raceA = await connectInSchema();
  const raceB = await connectInSchema();
  await admin.query(
    `INSERT INTO customer_property_submissions (id,status,owner_name,owner_phone,property_data)
     VALUES ('submission-resubmit-race','rejected','Original owner','09130000000','{"title":"Original"}')`,
  );
  const resubmitInput = {
    id: "submission-resubmit-race",
    ownerName: "Owner A",
    ownerPhone: "09131111111",
    propertyData: JSON.stringify({ title: "Resubmitted property" }),
  };
  const resubmitResults = await Promise.all([
    resubmitCustomerPropertySubmission(sqlFor(raceA), resubmitInput),
    resubmitCustomerPropertySubmission(sqlFor(raceB), { ...resubmitInput, ownerName: "Owner B" }),
  ]);
  assert.equal(resubmitResults.filter(Boolean).length, 1, "only one concurrent resubmit may claim a rejected submission");
  const resubmitted = await admin.query(
    "SELECT status,owner_name FROM customer_property_submissions WHERE id='submission-resubmit-race'",
  );
  assert.equal(resubmitted.rows[0]?.status, "pending");
  assert.ok(["Owner A", "Owner B"].includes(resubmitted.rows[0]?.owner_name));
  console.log("ok   PostgreSQL compare-and-set allows exactly one concurrent resubmission");
  releaseClient(raceA);
  releaseClient(raceB);

  await admin.query(
    `INSERT INTO leads (id,status) VALUES ('lead-failure','new'),('lead-success','new');
     INSERT INTO customer_property_submissions (id,lead_id,status,updated_at)
     VALUES ('submission-failure','lead-failure','pending','2026-10-31T00:00:00.123456Z'),
            ('submission-success','lead-success','pending','2026-10-31T00:00:00.123456Z')`,
  );
  await admin.query(`
    CREATE FUNCTION qa_fail_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'qa injected submission audit failure';
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER qa_fail_submission_audit
      BEFORE INSERT ON customer_property_submission_events
      FOR EACH ROW EXECUTE FUNCTION qa_fail_submission_audit();
  `);

  const approval = await connectInSchema();
  const statement = approvalStatement();
  await assert.rejects(
    approval.query(statement, approvalParams("property-failure", "submission-failure", "event-failure", "property-failure")),
    /qa injected submission audit failure/,
  );
  const failedSubmission = await admin.query(
    "SELECT status,property_id FROM customer_property_submissions WHERE id='submission-failure'",
  );
  const failedLead = await admin.query("SELECT status FROM leads WHERE id='lead-failure'");
  assert.equal(failedSubmission.rows[0]?.status, "pending");
  assert.equal(failedSubmission.rows[0]?.property_id, null);
  assert.equal(failedLead.rows[0]?.status, "new");
  assert.equal((await admin.query("SELECT id FROM properties WHERE id='property-failure'")).rowCount, 0);
  assert.equal((await admin.query("SELECT id FROM property_change_history")).rowCount, 0);
  assert.equal((await admin.query("SELECT id FROM customer_property_submission_events")).rowCount, 0);
  assert.equal((await admin.query("SELECT id FROM lead_activities WHERE lead_id='lead-failure'")).rowCount, 0);
  console.log("ok   PostgreSQL audit-event failure rolls back submission, property, lead and history writes");

  await admin.query("DROP TRIGGER qa_fail_submission_audit ON customer_property_submission_events; DROP FUNCTION qa_fail_submission_audit();");
  const approved = await approval.query(
    statement,
    approvalParams("property-success", "submission-success", "event-success", "property-success"),
  );
  assert.equal(approved.rows[0]?.id, "property-success");
  assert.equal((await admin.query("SELECT status FROM customer_property_submissions WHERE id='submission-success'")).rows[0]?.status, "approved");
  assert.equal((await admin.query("SELECT status FROM leads WHERE id='lead-success'")).rows[0]?.status, "contacted");
  assert.equal((await admin.query("SELECT id FROM lead_activities WHERE lead_id='lead-success'")).rowCount, 1);
  assert.equal((await admin.query("SELECT id FROM property_change_history WHERE property_id='property-success'")).rowCount, 1);
  assert.equal((await admin.query("SELECT id FROM customer_property_submission_events WHERE id='event-success'")).rowCount, 1);
  console.log("ok   PostgreSQL approval commits the property, CRM activity and review audit together");
  releaseClient(approval);

  const lockOwner = await connectInSchema();
  const lockWaiter = await connectInSchema();
  const lockKey = 741206511n;
  await lockOwner.query("SELECT pg_advisory_lock($1::bigint)", [String(lockKey)]);
  const lockStartedAt = Date.now();
  await assert.rejects(
    acquireMigrationAdvisoryLock(lockWaiter, lockKey, { timeoutMs: 250, pollIntervalMs: 10 }),
    /Timed out waiting for database migration advisory lock after 250ms/,
  );
  const lockElapsedMs = Date.now() - lockStartedAt;
  assert.ok(lockElapsedMs >= 200 && lockElapsedMs < 5_000, `lock timeout elapsed ${lockElapsedMs}ms`);
  await lockOwner.query("SELECT pg_advisory_unlock($1::bigint)", [String(lockKey)]);
  await acquireMigrationAdvisoryLock(lockWaiter, lockKey, { timeoutMs: 1_000, pollIntervalMs: 10 });
  const released = await lockWaiter.query("SELECT pg_advisory_unlock($1::bigint) AS unlocked", [String(lockKey)]);
  assert.equal(released.rows[0]?.unlocked, true);
  console.log("ok   PostgreSQL advisory-lock contention times out, then succeeds after the owner releases it");

  console.log("\n15 passed, 0 failed (real PostgreSQL)");
} finally {
  for (const client of clients.reverse()) {
    try {
      client.release();
    } catch {
      // Preserve the primary integration failure; pool shutdown handles cleanup.
    }
  }
  if (schemaCreated) {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  }
  await pool.end();
}
