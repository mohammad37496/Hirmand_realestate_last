import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import {
  createAdminCommissionSettlement,
  deleteAdminCommissionSettlement,
  deleteAdminDeal,
} from "../src/lib/admin-deal-lifecycle.ts";
import {
  updateAdminDealStatusWithSettlementGuard,
  updateCommissionSettlementStatusWithDealGuard,
} from "../src/lib/admin-deal-status-sql.ts";

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
            if (/from\s+admin_deals\s+where\s+id=\$1(?:\s+limit\s+1)?\s+for\s+(?:update|key share)/i.test(text)) {
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
      create table admin_deals (
        id text primary key, status text not null default 'prospect',
        consultant text not null default '', commission numeric,
        updated_at timestamptz not null default current_timestamp
      );
      create table admin_deal_documents (id text primary key, deal_id text not null);
      create table admin_commission_settlements (
        id text primary key, consultant text not null, deal_id text,
        commission_amount numeric not null, consultant_share numeric not null,
        office_share numeric not null, status text not null, paid_at timestamptz,
        note text not null, created_by text not null, updated_at timestamptz not null default current_timestamp
      );
      insert into admin_deals(id,status,consultant,commission) values
        ('settlement-first','contracted','consultant',1000),('delete-first','contracted','consultant',1000);
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

    // Two concurrent creators serialize on the same deal row; only one active
    // settlement can be inserted even when both requests start together.
    await pool.query("insert into admin_deals(id,status,consultant,commission) values('duplicate-create','completed','consultant',1000)");
    const duplicateHolder = deferred();
    const releaseDuplicate = deferred();
    const duplicateContenderPid = deferred();
    const duplicatePids = [];
    const duplicateSql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        duplicatePids.push(pid);
        if (duplicatePids.length === 2) duplicateContenderPid.resolve(pid);
      },
      afterDealLock: async (pid) => {
        if (duplicatePids.length === 1) {
          duplicateHolder.resolve(pid);
          await releaseDuplicate.promise;
        }
      },
    });
    const firstCreate = createAdminCommissionSettlement(duplicateSql, {
      id: "duplicate-first", consultant: "consultant", dealId: "duplicate-create",
      commission: "1000", consultantShare: "600", officeShare: "400", note: "", createdBy: "owner",
    });
    await waitForSignal(duplicateHolder.promise, "first duplicate settlement to lock its deal");
    const secondCreate = createAdminCommissionSettlement(duplicateSql, {
      id: "duplicate-second", consultant: "consultant", dealId: "duplicate-create",
      commission: "1000", consultantShare: "600", officeShare: "400", note: "", createdBy: "owner",
    });
    const duplicateWaiterPid = await waitForSignal(duplicateContenderPid.promise, "second duplicate settlement backend");
    try {
      await waitForBlockedBackend(admin, duplicateWaiterPid);
    } finally {
      releaseDuplicate.resolve();
    }
    const duplicateResults = await Promise.all([firstCreate, secondCreate]);
    assert.deepEqual(duplicateResults.map((result) => result.kind).sort(), ["created", "duplicate_active"]);
    assert.equal((await pool.query("select count(*)::int as count from admin_commission_settlements where deal_id='duplicate-create' and status<>'cancelled'")).rows[0].count, 1);

    // The same deal → settlement lock order serializes a downgrade against
    // reactivation of a previously cancelled settlement in both race orders.
    await pool.query(`
      insert into admin_deals(id,status,consultant,commission) values
        ('deal-downgrade-first','contracted','consultant',1000),
        ('deal-reactivation-first','contracted','consultant',1000);
      insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values
        ('settlement-downgrade-first','consultant','deal-downgrade-first',1000,600,400,'cancelled','','owner'),
        ('settlement-reactivation-first','consultant','deal-reactivation-first',1000,600,400,'cancelled','','owner');
    `);

    const downgradeHolder = deferred();
    const releaseDowngrade = deferred();
    const reactivationPid = deferred();
    const downgradePids = [];
    const downgradeSql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        downgradePids.push(pid);
        if (downgradePids.length === 2) reactivationPid.resolve(pid);
      },
      afterDealLock: async () => {
        if (downgradePids.length === 1) {
          downgradeHolder.resolve();
          await releaseDowngrade.promise;
        }
      },
    });
    const downgradeFirst = updateAdminDealStatusWithSettlementGuard(downgradeSql, "deal-downgrade-first", "cancelled");
    await waitForSignal(downgradeHolder.promise, "deal downgrade to lock its deal");
    const reactivationSecond = updateCommissionSettlementStatusWithDealGuard(downgradeSql, "settlement-downgrade-first", "pending");
    const reactivationSecondPid = await waitForSignal(reactivationPid.promise, "settlement reactivation backend");
    try {
      await waitForBlockedBackend(admin, reactivationSecondPid);
    } finally {
      releaseDowngrade.resolve();
    }
    assert.deepEqual(await downgradeFirst, { kind: "updated" });
    assert.deepEqual(await reactivationSecond, { kind: "deal_not_contractual" });

    const reactivationHolder = deferred();
    const releaseReactivation = deferred();
    const downgradePid = deferred();
    const reactivationPids = [];
    const reactivationSql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        reactivationPids.push(pid);
        if (reactivationPids.length === 2) downgradePid.resolve(pid);
      },
      afterDealLock: async () => {
        if (reactivationPids.length === 1) {
          reactivationHolder.resolve();
          await releaseReactivation.promise;
        }
      },
    });
    const reactivationFirst = updateCommissionSettlementStatusWithDealGuard(reactivationSql, "settlement-reactivation-first", "pending");
    await waitForSignal(reactivationHolder.promise, "settlement reactivation to lock its deal");
    const downgradeSecond = updateAdminDealStatusWithSettlementGuard(reactivationSql, "deal-reactivation-first", "cancelled");
    const downgradeSecondPid = await waitForSignal(downgradePid.promise, "deal downgrade backend");
    try {
      await waitForBlockedBackend(admin, downgradeSecondPid);
    } finally {
      releaseReactivation.resolve();
    }
    assert.deepEqual(await reactivationFirst, { kind: "updated" });
    assert.deepEqual(await downgradeSecond, { kind: "settlement_exists" });

    // Approved and paid accounting rows cannot be deleted; pending/cancelled
    // rows can be removed after taking the linked deal lock first.
    await pool.query(`
      insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values
        ('delete-pending','consultant','settlement-first',1000,600,400,'pending','','owner'),
        ('delete-cancelled','consultant','settlement-first',1000,600,400,'cancelled','','owner'),
        ('retain-approved','consultant','settlement-first',1000,600,400,'approved','','owner'),
        ('retain-paid','consultant','settlement-first',1000,600,400,'paid','','owner');
    `);
    assert.deepEqual(await deleteAdminCommissionSettlement(sql, "delete-pending"), { kind: "deleted" });
    assert.deepEqual(await deleteAdminCommissionSettlement(sql, "delete-cancelled"), { kind: "deleted" });
    assert.deepEqual(await deleteAdminCommissionSettlement(sql, "retain-approved"), { kind: "not_deletable" });
    assert.deepEqual(await deleteAdminCommissionSettlement(sql, "retain-paid"), { kind: "not_deletable" });

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
