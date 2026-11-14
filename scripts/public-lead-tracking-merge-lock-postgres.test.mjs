import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { test } from "node:test";
import {
  lockPublicLeadTrackingAliasGraphForMerge,
  sharePublicLeadTrackingTarget,
} from "../src/lib/public-lead-tracking.ts";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

function transaction(pool, callback) {
  return (async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const sql = {
        query: async (text, params = []) => (await client.query(text, params)).rows,
      };
      const result = await callback(sql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })();
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

test("tracking locks the alias graph before a merge can lock parent rows", {
  skip: !databaseUrl ? "TEST_DATABASE_URL must point to an isolated PostgreSQL test database" : false,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const schema = "public_tracking_merge_lock_" + randomUUID().replaceAll("-", "");
  let releaseTracking;
  let signalTrackingLocked;
  const trackingLocked = new Promise((resolve) => { signalTrackingLocked = resolve; });
  const holdTracking = new Promise((resolve) => { releaseTracking = resolve; });
  let mergePassedGraphLock = false;

  try {
    await pool.query(`create schema "${schema}"`);
    await pool.query(`
      create table "${schema}".leads (
        id text primary key,
        status text not null,
        public_tracking_token text not null unique,
        merged_into_lead_id text
      );
      insert into "${schema}".leads(id,status,public_tracking_token,merged_into_lead_id) values
        ('A','new','TOKEN-A',null),
        ('B','new','TOKEN-B',null),
        ('D','closed','TOKEN-D','B');
    `);

    const tracking = transaction(pool, async (sql) => {
      await sql.query(`set search_path to "${schema}"`);
      const target = await sharePublicLeadTrackingTarget(sql, "TOKEN-D");
      assert.deepEqual(target, { leadId: "B", trackingToken: "TOKEN-D" });
      signalTrackingLocked();
      await holdTracking;
      return target;
    });

    await withTimeout(
      trackingLocked,
      5_000,
      "tracking did not acquire its alias-chain locks",
    );

    const merge = transaction(pool, async (sql) => {
      await sql.query(`set search_path to "${schema}"`);
      await lockPublicLeadTrackingAliasGraphForMerge(sql);
      mergePassedGraphLock = true;
      await sql.query("select id from leads where id = any($1::text[]) order by id for update", [["A", "B"]]);
      await sql.query("update leads set status='closed', merged_into_lead_id='A' where id='B'");
      await sql.query("update leads set merged_into_lead_id='A' where merged_into_lead_id='B'");
    });

    await delay(150);
    assert.equal(mergePassedGraphLock, false, "merge must wait before taking any lead row lock");
    releaseTracking();

    const [trackingResult] = await withTimeout(
      Promise.all([tracking, merge]),
      5_000,
      "tracking and merge did not complete after the shared lock was released",
    );
    assert.deepEqual(trackingResult, { leadId: "B", trackingToken: "TOKEN-D" });

    const rows = await pool.query(`
      select id,status,merged_into_lead_id from "${schema}".leads order by id
    `);
    assert.deepEqual(rows.rows, [
      { id: "A", status: "new", merged_into_lead_id: null },
      { id: "B", status: "closed", merged_into_lead_id: "A" },
      { id: "D", status: "closed", merged_into_lead_id: "A" },
    ]);
  } finally {
    releaseTracking?.();
    await pool.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await pool.end();
  }
});
