import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildCustomerPropertySubmissionApprovalSql } from "../src/lib/customer-property-submission-approval.ts";
import { resubmitCustomerPropertySubmission } from "../src/lib/customer-property-submission-resubmit.ts";
import {
  cancelPropertyVisit,
  checkPropertyVisitSlot,
  reschedulePropertyVisit,
} from "../src/lib/property-visit-scheduling.server.ts";
import { MERGE_LEADS_WITH_ACTIVITY_SQL } from "../src/lib/admin-lead-dedupe-sql.ts";
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
      property_type text NOT NULL DEFAULT '', neighborhood text NOT NULL DEFAULT '', contact_name text NOT NULL DEFAULT ''
    );
    CREATE TABLE leads (
      id text PRIMARY KEY, status text NOT NULL, updated_at timestamptz,
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

  await admin.query(`
    INSERT INTO leads(id,status,name,phone,property_id,visit_preferred_at,visit_requested_at,visit_status)
    VALUES ('dedupe-canonical','new','Canonical','09130000004','visit-scheduling-property',NULL,NULL,'none'),
           ('dedupe-duplicate','new','Duplicate','09130000004','visit-scheduling-property','2030-06-04T10:00:00Z','2030-06-04T09:00:00Z','requested');
    INSERT INTO lead_activities(lead_id,activity_type,title,note,metadata)
    VALUES ('dedupe-duplicate','visit','Visit requested','', '{}'::jsonb);
  `);
  const dedupeResult = await admin.query(MERGE_LEADS_WITH_ACTIVITY_SQL, [
    "dedupe-canonical", "dedupe-duplicate", ["dedupe-canonical", "dedupe-duplicate"],
  ]);
  assert.equal(dedupeResult.rows[0]?.canonical_id, "dedupe-canonical");
  assert.equal(dedupeResult.rows[0]?.duplicate_id, "dedupe-duplicate");
  const mergedVisitRows = await admin.query(
    "SELECT id,visit_status FROM leads WHERE id IN ('dedupe-canonical','dedupe-duplicate') ORDER BY id",
  );
  assert.deepEqual(mergedVisitRows.rows, [
    { id: "dedupe-canonical", visit_status: "requested" },
    { id: "dedupe-duplicate", visit_status: "cancelled" },
  ]);
  console.log("ok   PostgreSQL dedupe SQL transfers the active visit and cancels the duplicate booking");
  await admin.query("DELETE FROM lead_activities WHERE lead_id='dedupe-canonical'; DELETE FROM leads WHERE id IN ('dedupe-canonical','dedupe-duplicate')");
  releaseClient(visitA);
  releaseClient(visitB);

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
  assert.equal((await admin.query("SELECT id FROM lead_activities")).rowCount, 0);
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

  console.log("\n10 passed, 0 failed (real PostgreSQL)");
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
