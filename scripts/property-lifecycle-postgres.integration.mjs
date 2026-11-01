import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { permanentlyDeleteTrashedProperty, restoreTrashedProperty } from "../src/lib/admin-property-trash.ts";
import { softDeleteProperty } from "../src/lib/admin-property-soft-delete.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the real PostgreSQL property lifecycle integration suite.");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5_000 });
const prefix = `qa-property-trash-${randomUUID().replaceAll("-", "")}`;
const ids = {
  concurrent: `${prefix}-concurrent`,
  historyFailure: `${prefix}-history-failure`,
  auditFailure: `${prefix}-audit-failure`,
  restoreConcurrent: `${prefix}-restore-concurrent`,
  restoreHistoryFailure: `${prefix}-restore-history-failure`,
  restoreAuditFailure: `${prefix}-restore-audit-failure`,
  permanentDeleteAuditFailure: `${prefix}-permanent-delete-audit-failure`,
  permanentDeleteSuccess: `${prefix}-permanent-delete-success`,
};
const clients = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sqlFor(client) {
  return async (statement, params = []) => (await client.query(statement, params)).rows;
}

function releaseClient(client) {
  const index = clients.indexOf(client);
  if (index >= 0) clients.splice(index, 1);
  client.release();
}

async function inTransaction(client, callback) {
  await client.query("BEGIN");
  try {
    const result = await callback(sqlFor(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function insertProperty(id, title) {
  await pool.query(
    `insert into properties (
       id, slug, status, featured, featured_until, title, transaction_type,
       property_type, neighborhood, description, contact_name, contact_phone
     ) values ($1,$2,'published',true,current_timestamp + interval '1 day',$3,'sell','apartment','QA','QA','QA','QA')`,
    [id, `${id}-${randomUUID()}`, title],
  );
}

async function insertTrashedProperty(id, title) {
  await insertProperty(id, title);
  await pool.query(
    "update properties set status='archived',deleted_at=current_timestamp,deleted_from_status='published',featured=false,featured_until=null where id=$1",
    [id],
  );
}

async function waitForLock(pid) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const rows = await pool.query(
      "select wait_event_type from pg_stat_activity where pid=$1",
      [pid],
    );
    if (rows.rows[0]?.wait_event_type === "Lock") return true;
    await pause(10);
  }
  return false;
}

async function assertPropertyUnchanged(id) {
  const result = await pool.query(
    "select status,deleted_at,deleted_from_status,featured from properties where id=$1",
    [id],
  );
  assert.deepEqual(result.rows[0], {
    status: "published",
    deleted_at: null,
    deleted_from_status: null,
    featured: true,
  });
  const history = await pool.query("select id from property_change_history where property_id=$1", [id]);
  const audit = await pool.query("select id from admin_audit_log where entity_id=$1", [id]);
  assert.equal(history.rowCount, 0);
  assert.equal(audit.rowCount, 0);
}

async function assertRestoreUnchanged(id) {
  const result = await pool.query(
    "select status,deleted_at,deleted_from_status from properties where id=$1",
    [id],
  );
  assert.equal(result.rows[0]?.status, "archived");
  assert.ok(result.rows[0]?.deleted_at);
  assert.equal(result.rows[0]?.deleted_from_status, "published");
  const history = await pool.query("select id from property_change_history where property_id=$1", [id]);
  const audit = await pool.query("select id from admin_audit_log where entity_id=$1", [id]);
  assert.equal(history.rowCount, 0);
  assert.equal(audit.rowCount, 0);
}

try {
  const required = await pool.query(
    "select to_regclass('public.properties') as properties, to_regclass('public.property_change_history') as history, to_regclass('public.admin_audit_log') as audit",
  );
  assert.ok(required.rows[0]?.properties, "production properties table must be migrated");
  assert.ok(required.rows[0]?.history, "production property_change_history table must be migrated");
  assert.ok(required.rows[0]?.audit, "production admin_audit_log table must be migrated");

  await pool.query("drop trigger if exists qa_reject_property_trash_history on property_change_history");
  await pool.query("drop function if exists qa_reject_property_trash_history()");
  await pool.query(`
    create or replace function qa_reject_property_trash_history() returns trigger language plpgsql as $$
    begin
      if new.property_id = current_setting('hirmand.qa_fail_property_history_id', true) then
        raise exception 'simulated property history failure';
      end if;
      return new;
    end;
    $$;
    create trigger qa_reject_property_trash_history
    before insert on property_change_history
    for each row execute function qa_reject_property_trash_history();
  `);

  await pool.query("drop trigger if exists qa_reject_property_trash_audit on admin_audit_log");
  await pool.query("drop function if exists qa_reject_property_trash_audit()");
  await pool.query(`
    create or replace function qa_reject_property_trash_audit() returns trigger language plpgsql as $$
    begin
      if new.entity_id = current_setting('hirmand.qa_fail_property_audit_id', true) then
        raise exception 'simulated property audit failure';
      end if;
      return new;
    end;
    $$;
    create trigger qa_reject_property_trash_audit
    before insert on admin_audit_log
    for each row execute function qa_reject_property_trash_audit();
  `);

  await insertProperty(ids.concurrent, "Concurrent soft-delete QA property");
  const firstClient = await pool.connect();
  const secondClient = await pool.connect();
  clients.push(firstClient, secondClient);
  const firstPid = (await firstClient.query("select pg_backend_pid() as pid")).rows[0].pid;
  const secondPid = (await secondClient.query("select pg_backend_pid() as pid")).rows[0].pid;
  assert.notEqual(firstPid, secondPid, "the race must use two independent PostgreSQL connections");

  let firstOpen = false;
  let secondOpen = false;
  let secondPromise;
  try {
    await firstClient.query("BEGIN");
    firstOpen = true;
    const first = await softDeleteProperty(
      sqlFor(firstClient),
      ids.concurrent,
      (row) => ({ title: row.title, status: row.status, featured: row.featured }),
      "qa-admin-a",
    );
    assert.deepEqual(first, {
      id: ids.concurrent,
      title: "Concurrent soft-delete QA property",
      fromStatus: "published",
    });

    await secondClient.query("BEGIN");
    secondOpen = true;
    secondPromise = softDeleteProperty(
      sqlFor(secondClient),
      ids.concurrent,
      (row) => ({ title: row.title, status: row.status, featured: row.featured }),
      "qa-admin-b",
    ).then((value) => ({ value }), (error) => ({ error }));

    assert.equal(await waitForLock(secondPid), true, "the second connection must wait on the first row lock");
    await firstClient.query("COMMIT");
    firstOpen = false;
    const second = await secondPromise;
    if (second.error) throw second.error;
    assert.equal(second.value, null, "the second delete must become an idempotent no-op after the first commits");
    await secondClient.query("COMMIT");
    secondOpen = false;
  } catch (error) {
    if (firstOpen) await firstClient.query("ROLLBACK").catch(() => undefined);
    if (secondOpen) await secondClient.query("ROLLBACK").catch(() => undefined);
    if (secondPromise) await secondPromise;
    throw error;
  }

  const concurrentHistory = await pool.query(
    "select action,before_state from property_change_history where property_id=$1",
    [ids.concurrent],
  );
  const concurrentAudit = await pool.query(
    "select action,actor,metadata from admin_audit_log where entity_id=$1",
    [ids.concurrent],
  );
  assert.equal(concurrentHistory.rowCount, 1);
  assert.equal(concurrentHistory.rows[0].action, "deleted");
  assert.deepEqual(concurrentHistory.rows[0].before_state, {
    title: "Concurrent soft-delete QA property",
    status: "published",
    featured: true,
  });
  assert.equal(concurrentAudit.rowCount, 1);
  assert.equal(concurrentAudit.rows[0].action, "property.trashed");
  assert.equal(concurrentAudit.rows[0].actor, "qa-admin-a");
  assert.deepEqual(concurrentAudit.rows[0].metadata, { fromStatus: "published" });
  console.log("PASS property soft-delete two-connection row-lock race");

  await insertTrashedProperty(ids.restoreConcurrent, "Concurrent restore QA property");
  let firstRestoreOpen = false;
  let secondRestoreOpen = false;
  let secondRestorePromise;
  try {
    await firstClient.query("BEGIN");
    firstRestoreOpen = true;
    const firstRestore = await restoreTrashedProperty(
      sqlFor(firstClient), ids.restoreConcurrent, true, "qa-admin-a",
    );
    assert.deepEqual(firstRestore, {
      id: ids.restoreConcurrent,
      title: "Concurrent restore QA property",
      status: "published",
    });

    await secondClient.query("BEGIN");
    secondRestoreOpen = true;
    secondRestorePromise = restoreTrashedProperty(
      sqlFor(secondClient), ids.restoreConcurrent, true, "qa-admin-b",
    ).then((value) => ({ value }), (error) => ({ error }));
    assert.equal(await waitForLock(secondPid), true, "the second restore must wait for the first row update");
    await firstClient.query("COMMIT");
    firstRestoreOpen = false;
    const secondRestore = await secondRestorePromise;
    if (secondRestore.error) throw secondRestore.error;
    assert.equal(secondRestore.value, null, "the second restore must become an idempotent no-op after the first commits");
    await secondClient.query("COMMIT");
    secondRestoreOpen = false;
  } catch (error) {
    if (firstRestoreOpen) await firstClient.query("ROLLBACK").catch(() => undefined);
    if (secondRestoreOpen) await secondClient.query("ROLLBACK").catch(() => undefined);
    if (secondRestorePromise) await secondRestorePromise;
    throw error;
  }
  const restoredProperty = await pool.query(
    "select status,deleted_at,deleted_from_status from properties where id=$1",
    [ids.restoreConcurrent],
  );
  assert.deepEqual(restoredProperty.rows[0], {
    status: "published",
    deleted_at: null,
    deleted_from_status: null,
  });
  const restoreHistory = await pool.query(
    "select action,before_state,after_state from property_change_history where property_id=$1",
    [ids.restoreConcurrent],
  );
  const restoreAudit = await pool.query(
    "select action,actor,metadata from admin_audit_log where entity_id=$1",
    [ids.restoreConcurrent],
  );
  assert.equal(restoreHistory.rowCount, 1);
  assert.equal(restoreHistory.rows[0].action, "updated");
  assert.deepEqual(restoreHistory.rows[0].before_state, { status: "trash" });
  assert.deepEqual(restoreHistory.rows[0].after_state, { status: "published" });
  assert.equal(restoreAudit.rowCount, 1);
  assert.equal(restoreAudit.rows[0].action, "property.restored");
  assert.equal(restoreAudit.rows[0].actor, "qa-admin-a");
  assert.deepEqual(restoreAudit.rows[0].metadata, { restoredStatus: "published" });
  console.log("PASS property restore two-connection row-update race");
  releaseClient(firstClient);
  releaseClient(secondClient);

  await insertProperty(ids.historyFailure, "History rollback QA property");
  const historyClient = await pool.connect();
  clients.push(historyClient);
  await assert.rejects(
    inTransaction(historyClient, async (query) => {
      await historyClient.query("select set_config('hirmand.qa_fail_property_history_id',$1,true)", [ids.historyFailure]);
      return softDeleteProperty(
        query,
        ids.historyFailure,
        (row) => ({ title: row.title, status: row.status, featured: row.featured }),
        "qa-admin",
      );
    }),
    /simulated property history failure/,
  );
  releaseClient(historyClient);
  await assertPropertyUnchanged(ids.historyFailure);
  console.log("PASS property soft-delete rollback on lifecycle-history failure");

  await insertTrashedProperty(ids.restoreHistoryFailure, "Restore history rollback QA property");
  const restoreHistoryClient = await pool.connect();
  clients.push(restoreHistoryClient);
  await assert.rejects(
    inTransaction(restoreHistoryClient, async (query) => {
      await restoreHistoryClient.query("select set_config('hirmand.qa_fail_property_history_id',$1,true)", [ids.restoreHistoryFailure]);
      return restoreTrashedProperty(query, ids.restoreHistoryFailure, true, "qa-admin");
    }),
    /simulated property history failure/,
  );
  releaseClient(restoreHistoryClient);
  await assertRestoreUnchanged(ids.restoreHistoryFailure);
  console.log("PASS property restore rollback on lifecycle-history failure");

  await insertProperty(ids.auditFailure, "Audit rollback QA property");
  const auditClient = await pool.connect();
  clients.push(auditClient);
  await assert.rejects(
    inTransaction(auditClient, async (query) => {
      await auditClient.query("select set_config('hirmand.qa_fail_property_audit_id',$1,true)", [ids.auditFailure]);
      return softDeleteProperty(
        query,
        ids.auditFailure,
        (row) => ({ title: row.title, status: row.status, featured: row.featured }),
        "qa-admin",
      );
    }),
    /simulated property audit failure/,
  );
  releaseClient(auditClient);
  await assertPropertyUnchanged(ids.auditFailure);
  console.log("PASS property soft-delete rollback on audit failure");

  await insertTrashedProperty(ids.restoreAuditFailure, "Restore audit rollback QA property");
  const restoreAuditClient = await pool.connect();
  clients.push(restoreAuditClient);
  await assert.rejects(
    inTransaction(restoreAuditClient, async (query) => {
      await restoreAuditClient.query("select set_config('hirmand.qa_fail_property_audit_id',$1,true)", [ids.restoreAuditFailure]);
      return restoreTrashedProperty(query, ids.restoreAuditFailure, true, "qa-admin");
    }),
    /simulated property audit failure/,
  );
  releaseClient(restoreAuditClient);
  await assertRestoreUnchanged(ids.restoreAuditFailure);
  console.log("PASS property restore rollback on audit failure");

  await insertTrashedProperty(ids.permanentDeleteAuditFailure, "Permanent-delete audit rollback QA property");
  const permanentDeleteAuditClient = await pool.connect();
  clients.push(permanentDeleteAuditClient);
  await assert.rejects(
    inTransaction(permanentDeleteAuditClient, async (query) => {
      await permanentDeleteAuditClient.query("select set_config('hirmand.qa_fail_property_audit_id',$1,true)", [ids.permanentDeleteAuditFailure]);
      return permanentlyDeleteTrashedProperty(query, ids.permanentDeleteAuditFailure, "qa-admin");
    }),
    /simulated property audit failure/,
  );
  releaseClient(permanentDeleteAuditClient);
  const retainedAfterPermanentDeleteFailure = await pool.query(
    "select id,deleted_at from properties where id=$1",
    [ids.permanentDeleteAuditFailure],
  );
  assert.equal(retainedAfterPermanentDeleteFailure.rowCount, 1, "audit failure must roll back the permanent property deletion");
  assert.ok(retainedAfterPermanentDeleteFailure.rows[0].deleted_at);
  assert.equal((await pool.query("select id from admin_audit_log where entity_id=$1", [ids.permanentDeleteAuditFailure])).rowCount, 0);
  console.log("PASS permanent property deletion rollback on audit failure");

  await insertTrashedProperty(ids.permanentDeleteSuccess, "Permanent-delete success QA property");
  const permanentDeleteClient = await pool.connect();
  clients.push(permanentDeleteClient);
  const permanentDelete = await inTransaction(permanentDeleteClient, (query) =>
    permanentlyDeleteTrashedProperty(query, ids.permanentDeleteSuccess, "qa-admin-delete"),
  );
  assert.equal(permanentDelete?.id, ids.permanentDeleteSuccess);
  releaseClient(permanentDeleteClient);
  assert.equal((await pool.query("select id from properties where id=$1", [ids.permanentDeleteSuccess])).rowCount, 0);
  const permanentDeleteAudit = await pool.query(
    "select action,actor from admin_audit_log where entity_id=$1",
    [ids.permanentDeleteSuccess],
  );
  assert.deepEqual(permanentDeleteAudit.rows, [{ action: "property.permanently_deleted", actor: "qa-admin-delete" }]);
  console.log("PASS permanent property deletion and audit commit together");
  console.log("PASS property lifecycle PostgreSQL integration (delete/restore races, history, audit, rollback)");
} finally {
  for (const client of clients) client.release();
  await pool.query("drop trigger if exists qa_reject_property_trash_history on property_change_history").catch(() => undefined);
  await pool.query("drop function if exists qa_reject_property_trash_history()").catch(() => undefined);
  await pool.query("drop trigger if exists qa_reject_property_trash_audit on admin_audit_log").catch(() => undefined);
  await pool.query("drop function if exists qa_reject_property_trash_audit()").catch(() => undefined);
  await pool.query("delete from property_change_history where property_id = any($1::text[])", [Object.values(ids)]).catch(() => undefined);
  await pool.query("delete from admin_audit_log where entity_id = any($1::text[])", [Object.values(ids)]).catch(() => undefined);
  await pool.query("delete from properties where id = any($1::text[])", [Object.values(ids)]).catch(() => undefined);
  await pool.end();
}
