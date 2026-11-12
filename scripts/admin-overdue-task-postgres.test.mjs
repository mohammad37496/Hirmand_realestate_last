import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { createOverdueLeadTasks } from "../src/lib/admin-overdue-lead-tasks.ts";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForBlockedBackend(admin, backendPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await admin.query(
      "select wait_event_type, cardinality(pg_blocking_pids(pid))::int as blockers from pg_stat_activity where pid=$1",
      [backendPid],
    );
    if (result.rows[0]?.wait_event_type === "Lock" && Number(result.rows[0]?.blockers) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`PostgreSQL backend ${backendPid} never waited on the overdue-task advisory lock`);
}

function createTransactionalSql(pool, hooks = {}) {
  return {
    transaction: async (callback) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const pid = Number((await client.query("select pg_backend_pid() as pid")).rows[0]?.pid);
        await hooks.onBegin?.(pid);
        const transactionSql = {
          query: async (text, params = []) => {
            const rows = (await client.query(text, params)).rows;
            if (/pg_advisory_xact_lock/i.test(text)) await hooks.afterAdvisoryLock?.(pid);
            return rows;
          },
        };
        const result = await callback(transactionSql);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

test("concurrent overdue lead task generation serializes across real PostgreSQL sessions", {
  skip: !databaseUrl && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `admin_overdue_tasks_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool;
  const lockHeld = deferred();
  const releaseLock = deferred();
  let lockHolderPid;
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
      create table leads (
        id text primary key, name text, deal text, neighborhood text,
        status text not null, follow_up_at timestamptz
      );
      create table admin_tasks (
        id text primary key, title text not null, description text not null,
        status text not null, priority text not null, due_at timestamptz,
        assignee text not null, entity_type text not null, entity_id text
      );
      insert into leads(id,name,deal,neighborhood,status,follow_up_at) values
        ('lead-1','مشتری یک','خرید','جردن','follow_up',current_timestamp - interval '1 day'),
        ('lead-2','مشتری دو','اجاره','سعادت‌آباد','contacted',current_timestamp - interval '2 hours');
    `);

    const first = createOverdueLeadTasks(createTransactionalSql(pool, {
      afterAdvisoryLock: async (pid) => {
        if (lockHolderPid == null) {
          lockHolderPid = pid;
          lockHeld.resolve();
          await releaseLock.promise;
        }
      },
    }));
    await lockHeld.promise;

    const secondPid = deferred();
    const second = createOverdueLeadTasks(createTransactionalSql(pool, {
      onBegin: (pid) => secondPid.resolve(pid),
    }));
    await waitForBlockedBackend(admin, await secondPid.promise);
    releaseLock.resolve();

    const results = await Promise.all([first, second]);
    assert.deepEqual(results, [2, 0]);
    const tasks = await pool.query(
      "select entity_id,count(*)::int as count from admin_tasks where entity_type='lead' and status='open' group by entity_id order by entity_id",
    );
    assert.deepEqual(tasks.rows, [
      { entity_id: "lead-1", count: 1 },
      { entity_id: "lead-2", count: 1 },
    ]);
  } finally {
    releaseLock.resolve();
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});
