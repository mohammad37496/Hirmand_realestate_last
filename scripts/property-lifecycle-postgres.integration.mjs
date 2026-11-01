import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
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
};
const clients = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sqlFor(client) {
  return async (statement, params = []) => (await client.query(statement, params)).rows;
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
  await assertPropertyUnchanged(ids.historyFailure);
  console.log("PASS property soft-delete rollback on lifecycle-history failure");

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
  await assertPropertyUnchanged(ids.auditFailure);
  console.log("PASS property soft-delete rollback on audit failure");
  console.log("PASS property lifecycle PostgreSQL integration (two connections, history, audit, rollback)");
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
