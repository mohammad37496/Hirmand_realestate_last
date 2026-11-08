import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { updatePendingCustomerPropertySubmissionReview } from "../src/lib/customer-property-submission-review.ts";

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
  assert.fail(`PostgreSQL backend ${backendPid} never entered a submission-row lock wait`);
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
            if (/update\s+customer_property_submissions/i.test(text)) {
              await hooks.afterReviewUpdate?.(pid, text);
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

test("approval and rejection serialize across PostgreSQL sessions in both lock orders", {
  skip: !databaseUrl && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `submission_review_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool;
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
      create table customer_property_submissions (
        id text primary key,
        status text not null,
        updated_at timestamptz not null,
        property_id text,
        review_note text not null default '',
        reviewed_at timestamptz,
        property_data jsonb not null default '{}'::jsonb
      );
      create table properties (
        id text primary key,
        submission_id text not null unique
      );
      insert into customer_property_submissions(id,status,updated_at,property_data)
        values ('approve-first','pending','2026-11-08 12:00:00.123456+00','{}'::jsonb),
               ('reject-first','pending','2026-11-08 12:00:00.654321+00','{}'::jsonb);
    `);

    const runRace = async (submissionId, firstAction, secondAction) => {
      const snapshot = await pool.query(
        "select updated_at::text as updated_at from customer_property_submissions where id=$1",
        [submissionId],
      );
      const expectedUpdatedAt = snapshot.rows[0]?.updated_at;
      assert.ok(expectedUpdatedAt, `expected timestamp for ${submissionId}`);

      const firstLock = deferred();
      const releaseFirst = deferred();
      const secondBackend = deferred();
      const pids = [];
      let lockHolder;
      const sql = createTransactionalSql(pool, {
        onBegin: async (pid) => {
          pids.push(pid);
          if (pids.length === 2) secondBackend.resolve(pid);
        },
        afterReviewUpdate: async (pid) => {
          if (lockHolder == null) {
            lockHolder = pid;
            firstLock.resolve(pid);
            await releaseFirst.promise;
          }
        },
      });

      const applyReview = (action, propertyId) => sql.transaction(async (transactionSql) => {
        const updated = await updatePendingCustomerPropertySubmissionReview(transactionSql, {
          action,
          id: submissionId,
          expectedUpdatedAt,
          ...(action === "approve" ? { propertyId } : {}),
          reviewNote: action,
        });
        if (!updated) return false;
        if (action === "approve") {
          await transactionSql.query(
            "insert into properties(id,submission_id) values($1,$2)",
            [propertyId, submissionId],
          );
        }
        return true;
      });

      const first = applyReview(firstAction, `${submissionId}-property-first`);
      await waitForSignal(firstLock.promise, "first review transaction to acquire the row lock");
      const second = applyReview(secondAction, `${submissionId}-property-second`);
      const blockedPid = await waitForSignal(secondBackend.promise, "second review transaction backend");
      try {
        await waitForBlockedBackend(admin, blockedPid);
      } finally {
        releaseFirst.resolve();
      }
      const results = await Promise.all([first, second]);
      assert.deepEqual(results, [true, false], `${firstAction} must win over stale ${secondAction}`);
    };

    await runRace("approve-first", "approve", "reject");
    await runRace("reject-first", "reject", "approve");

    const submissions = await pool.query(
      "select id,status,property_id from customer_property_submissions order by id",
    );
    assert.deepEqual(submissions.rows, [
      { id: "approve-first", status: "approved", property_id: "approve-first-property-first" },
      { id: "reject-first", status: "rejected", property_id: null },
    ]);
    const properties = await pool.query("select id,submission_id from properties order by id");
    assert.deepEqual(properties.rows, [
      { id: "approve-first-property-first", submission_id: "approve-first" },
    ]);
  } finally {
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});
