import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildCustomerPropertySubmissionApprovalSql } from "../src/lib/customer-property-submission-approval.ts";
import { resubmitCustomerPropertySubmission } from "../src/lib/customer-property-submission-resubmit.ts";
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

function sqlFor(client) {
  return {
    query: async (text, params = []) => (await client.query(text, params)).rows,
  };
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
    CREATE TABLE properties (id text PRIMARY KEY, title text NOT NULL);
    CREATE TABLE leads (id text PRIMARY KEY, status text NOT NULL, updated_at timestamptz);
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

  await admin.query(
    `INSERT INTO leads (id,status) VALUES ('lead-failure','new'),('lead-success','new');
     INSERT INTO customer_property_submissions (id,lead_id,status,updated_at)
     VALUES ('submission-failure','lead-failure','pending','2026-10-31T00:00:00.123456Z'),
            ('submission-success','lead-success','pending','2026-10-31T00:00:00.123456Z')`,
  );
  await admin.query(`
    CREATE FUNCTION qa_fail_lead_activity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'qa injected lead activity failure';
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER qa_fail_lead_activity
      BEFORE INSERT ON lead_activities
      FOR EACH ROW EXECUTE FUNCTION qa_fail_lead_activity();
  `);

  const approval = await connectInSchema();
  const statement = approvalStatement();
  await assert.rejects(
    approval.query(statement, approvalParams("property-failure", "submission-failure", "event-failure", "property-failure")),
    /qa injected lead activity failure/,
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

  await admin.query("DROP TRIGGER qa_fail_lead_activity ON lead_activities; DROP FUNCTION qa_fail_lead_activity();");
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

  console.log("\n4 passed, 0 failed (real PostgreSQL)");
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
