import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import {
  createAdminCommissionSettlement,
  deleteAdminDeal,
} from "../src/lib/admin-deal-lifecycle.ts";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForSignal(promise, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
  assert.fail(`PostgreSQL backend ${backendPid} never entered a deal-row lock wait`);
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
            if (/from\s+admin_deals\s+where\s+id=\$1\s+limit\s+1\s+for\s+(?:update|key share)/i.test(text)) {
              await hooks.afterDealLock?.(pid, text);
            }
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

test("deal deletion and linked settlement creation serialize on the deal row in both lock orders", {
  skip: !databaseUrl && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `admin_deal_lifecycle_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool;
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
      create table admin_deals (id text primary key);
      create table admin_deal_documents (id text primary key, deal_id text not null);
      create table admin_commission_settlements (
        id text primary key, consultant text not null, deal_id text,
        commission_amount numeric not null, consultant_share numeric not null,
        office_share numeric not null, status text not null, note text not null, created_by text not null
      );
      insert into admin_deals(id) values ('settlement-first'),('delete-first');
      insert into admin_deal_documents(id,deal_id) values ('doc-settlement-first','settlement-first'),('doc-delete-first','delete-first');
    `);

    const firstHolder = deferred();
    const releaseFirst = deferred();
    const contenderPid = deferred();
    const seenPids = [];
    const sql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        seenPids.push(pid);
        if (seenPids.length === 2) contenderPid.resolve(pid);
      },
      afterDealLock: async (pid) => {
        if (seenPids.length === 1) {
          firstHolder.resolve(pid);
          await releaseFirst.promise;
        }
      },
    });
    const settlementOperation = createAdminCommissionSettlement(sql, {
      id: "settlement-1", consultant: "consultant", dealId: "settlement-first",
      commission: "1000", consultantShare: "600", officeShare: "400", note: "", createdBy: "owner",
    });
    await waitForSignal(firstHolder.promise, "settlement transaction to acquire the deal lock");
    const deletionOperation = deleteAdminDeal(sql, "settlement-first");
    const blockedDeletePid = await waitForSignal(contenderPid.promise, "delete transaction backend");
    try {
      await waitForBlockedBackend(admin, blockedDeletePid);
    } finally {
      releaseFirst.resolve();
    }
    const [settlementResult, deletionResult] = await Promise.all([settlementOperation, deletionOperation]);
    assert.equal(settlementResult.kind, "created");
    assert.equal(deletionResult.kind, "settlements_exist");
    assert.equal((await pool.query("select id from admin_deals where id='settlement-first'")).rows.length, 1);
    assert.equal((await pool.query("select id from admin_deal_documents where deal_id='settlement-first'")).rows.length, 1);
    assert.equal((await pool.query("select id from admin_commission_settlements where deal_id='settlement-first'")).rows.length, 1);

    const deleteHolder = deferred();
    const releaseDelete = deferred();
    const createPid = deferred();
    const reversePids = [];
    const reverseSql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        reversePids.push(pid);
        if (reversePids.length === 2) createPid.resolve(pid);
      },
      afterDealLock: async (pid) => {
        if (reversePids.length === 1) {
          deleteHolder.resolve(pid);
          await releaseDelete.promise;
        }
      },
    });
    const deletionFirst = deleteAdminDeal(reverseSql, "delete-first");
    await waitForSignal(deleteHolder.promise, "delete transaction to acquire the deal lock");
    const settlementSecond = createAdminCommissionSettlement(reverseSql, {
      id: "orphan-should-not-exist", consultant: "consultant", dealId: "delete-first",
      commission: "1000", consultantShare: "600", officeShare: "400", note: "", createdBy: "owner",
    });
    const blockedCreatePid = await waitForSignal(createPid.promise, "settlement transaction backend");
    try {
      await waitForBlockedBackend(admin, blockedCreatePid);
    } finally {
      releaseDelete.resolve();
    }
    const [deleted, rejectedSettlement] = await Promise.all([deletionFirst, settlementSecond]);
    assert.deepEqual(deleted, { kind: "deleted" });
    assert.deepEqual(rejectedSettlement, { kind: "deal_not_found" });
    assert.equal((await pool.query("select id from admin_deals where id='delete-first'")).rows.length, 0);
    assert.equal((await pool.query("select id from admin_deal_documents where deal_id='delete-first'")).rows.length, 0);
    assert.equal((await pool.query("select id from admin_commission_settlements where deal_id='delete-first'")).rows.length, 0);
  } finally {
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});
