import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { lockActivePropertyForTask } from "../src/lib/admin-productivity-task-association.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required for the admin productivity property race test.");
const database = new URL(databaseUrl);
const databaseName = decodeURIComponent(database.pathname.slice(1));
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname) || !/(?:^|[_-])(?:test|verify)$/i.test(databaseName)) {
  throw new Error("Admin productivity property race test requires a local disposable database ending in _test or _verify.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
const schema = "qa_task_property_" + randomUUID().replace(/-/g, "");
let lifecycleClient;
let taskClient;
let schemaCreated = false;
let lifecycleOpen = false;
let taskOpen = false;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  await pool.query(`create schema "${schema}"`);
  schemaCreated = true;
  lifecycleClient = await pool.connect();
  taskClient = await pool.connect();
  await lifecycleClient.query(`set search_path to "${schema}"`);
  await taskClient.query(`set search_path to "${schema}"`);
  await lifecycleClient.query(`
    create table properties (id text primary key, status text not null, deleted_at timestamptz);
    create table admin_tasks (id text primary key, entity_type text not null, entity_id text not null, title text not null);
    insert into properties (id,status) values ('property-create','published'),('property-update','published');
    insert into admin_tasks (id,entity_type,entity_id,title)
      values ('task-update','property','property-update','Before archive');
  `);

  async function proveArchiveWins(propertyId, taskMutation) {
    await lifecycleClient.query("begin");
    lifecycleOpen = true;
    await lifecycleClient.query("select id from properties where id=$1 for update", [propertyId]);

    await taskClient.query("begin");
    taskOpen = true;
    const backendPid = Number((await taskClient.query("select pg_backend_pid() as pid")).rows[0].pid);
    let settled = false;
    const taskAttempt = (async () => {
      const taskSql = {
        query: async (statement, params) => (await taskClient.query(statement, params)).rows,
      };
      const active = await lockActivePropertyForTask(taskSql, propertyId);
      if (!active) return false;
      await taskMutation(taskClient);
      return true;
    })().then(
      (result) => { settled = true; return result; },
      (error) => { settled = true; throw error; },
    );

    let waitingForRowLock = false;
    for (let attempt = 0; attempt < 250; attempt += 1) {
      if (settled) break;
      const activity = await lifecycleClient.query(
        "select wait_event_type from pg_stat_activity where pid=$1",
        [backendPid],
      );
      if (activity.rows[0]?.wait_event_type === "Lock") {
        waitingForRowLock = true;
        break;
      }
      await delay(20);
    }
    assert.equal(waitingForRowLock, true, "task association must block on the property row lock held by archive");

    await lifecycleClient.query(
      "update properties set status='archived',deleted_at=current_timestamp where id=$1",
      [propertyId],
    );
    await lifecycleClient.query("commit");
    lifecycleOpen = false;

    assert.equal(await taskAttempt, false, "the active-property predicate must be rechecked after archive commits");
    await taskClient.query("commit");
    taskOpen = false;
  }

  await proveArchiveWins("property-create", async (client) => {
    await client.query(
      "insert into admin_tasks (id,entity_type,entity_id,title) values ('task-create','property','property-create','Created')",
    );
  });
  const created = await pool.query(
    `select id from "${schema}".admin_tasks where id='task-create'`,
  );
  assert.equal(created.rows.length, 0, "a task must not be created after the property is archived");

  await proveArchiveWins("property-update", async (client) => {
    await client.query("update admin_tasks set title='Updated' where id='task-update'");
  });
  const updated = await pool.query(
    `select title from "${schema}".admin_tasks where id='task-update'`,
  );
  assert.equal(updated.rows[0]?.title, "Before archive", "task updates must not pass after the property is archived");

  console.log("ok   create_task and update_task wait for property archive, recheck the locked state, and refuse the stale association");
} finally {
  if (lifecycleOpen && lifecycleClient) await lifecycleClient.query("rollback").catch(() => {});
  if (taskOpen && taskClient) await taskClient.query("rollback").catch(() => {});
  taskClient?.release();
  lifecycleClient?.release();
  if (schemaCreated) await pool.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
  await pool.end();
}
