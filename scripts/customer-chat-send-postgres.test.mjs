import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { sendCustomerChatMessage } from "../src/lib/customer-chat-send.ts";

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
  assert.fail(`PostgreSQL backend ${backendPid} never entered the lead-row lock wait`);
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
            if (/for\s+update/i.test(text)) await hooks.afterLeadLock?.(pid);
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

test("concurrent customer chat sends serialize across independent PostgreSQL sessions", {
  skip: !databaseUrl && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `customer_chat_send_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool;
  const releaseFirst = deferred();
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
      create table leads (
        id text primary key,
        public_tracking_token text not null unique,
        merged_into_lead_id text references leads(id) on delete restrict
      );
      create table customer_messages (
        id text primary key,
        lead_id text not null references leads(id) on delete cascade,
        tracking_token text not null,
        sender_type text not null,
        sender_name text not null,
        message text not null,
        created_at timestamptz not null default current_timestamp
      );
      insert into leads(id,public_tracking_token) values ('lead-1','HIR-26-ABCDEF123456');
    `);

    const backendPids = [];
    const secondBackend = deferred();
    let lockHolderPid;
    const sql = createTransactionalSql(pool, {
      onBegin: async (pid) => {
        backendPids.push(pid);
        if (backendPids.length === 2) secondBackend.resolve(pid);
      },
      afterLeadLock: async (pid) => {
        if (lockHolderPid == null) {
          lockHolderPid = pid;
          await releaseFirst.promise;
        }
      },
    });
    const input = {
      trackingCode: "HIR-26-ABCDEF123456",
      senderName: "مشتری",
      message: "لطفاً با من تماس بگیرید.",
    };
    const first = sendCustomerChatMessage(sql, input);
    const firstPidDeadline = Date.now() + 5_000;
    while (lockHolderPid == null && Date.now() < firstPidDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(lockHolderPid, "the first PostgreSQL session must lock the lead row");

    const second = sendCustomerChatMessage(sql, input);
    const blockedPid = await waitForSignal(secondBackend.promise, "second PostgreSQL session");
    try {
      assert.notEqual(blockedPid, lockHolderPid);
      await waitForBlockedBackend(admin, blockedPid);
    } finally {
      releaseFirst.resolve();
    }

    const results = await Promise.all([first, second]);
    assert.equal(results.filter((result) => result.kind === "sent").length, 1);
    assert.equal(results.filter((result) => result.kind === "cooldown").length, 1);
    const messages = await pool.query("select id,sender_type from customer_messages where lead_id='lead-1'");
    assert.equal(messages.rows.length, 1);
    assert.equal(messages.rows[0]?.sender_type, "customer");
  } finally {
    releaseFirst.resolve();
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});
