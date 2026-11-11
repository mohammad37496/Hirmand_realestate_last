import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { test } from "node:test";
import { findRecentPublicCallbackLead, withPublicLeadPhoneDedupeLock } from "../src/lib/public-lead-phone-dedupe.ts";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

function createSql(pool) {
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return (await pool.query(text, values)).rows;
  };
  sql.query = async (text, params = []) => (await pool.query(text, params)).rows;
  sql.transaction = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const transactionSql = async (strings, ...values) => {
        let text = strings[0];
        for (let index = 0; index < values.length; index += 1) {
          text += `$${index + 1}${strings[index + 1]}`;
        }
        return (await client.query(text, values)).rows;
      };
      transactionSql.query = async (text, params = []) => (await client.query(text, params)).rows;
      transactionSql.transaction = async (nestedCallback) => nestedCallback(transactionSql);
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return sql;
}

test("same-phone public lead submissions serialize across independent PostgreSQL sessions", {
  skip: !databaseUrl ? "TEST_DATABASE_URL must point to an isolated PostgreSQL test database" : false,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const schema = "public_lead_dedupe_" + randomUUID().replaceAll("-", "");
  const phone = "09123456789";
  try {
    await pool.query(`create schema "${schema}"`);
    await pool.query(`
      create table "${schema}".leads (
        id text primary key,
        phone text not null,
        budget_amount integer,
        callback_preferred_at timestamptz,
        public_tracking_token text,
        created_at timestamptz not null default current_timestamp
      );
      create table "${schema}".lead_activities (id bigserial primary key, lead_id text not null references "${schema}".leads(id));
      create table "${schema}".admin_tasks (id text primary key, lead_id text not null references "${schema}".leads(id));
    `);

    const sql = createSql(pool);
    const submit = async ({ id, budgetAmount = null, onLocked }) => withPublicLeadPhoneDedupeLock(
      sql,
      phone,
      async (lockedSql) => {
        await lockedSql.query("set search_path to \"" + schema + "\"");
        onLocked?.();
        const existing = await lockedSql.query(
          "select id from leads where phone=$1 and created_at > current_timestamp - interval '10 minutes' limit 1",
          [phone],
        );
        if (existing[0]) {
          if (budgetAmount != null) {
            await lockedSql.query("update leads set budget_amount=$2 where id=$1", [existing[0].id, budgetAmount]);
          }
          return { kind: "duplicate", id: existing[0].id };
        }

        await lockedSql.query("insert into leads(id,phone,budget_amount) values($1,$2,$3)", [id, phone, budgetAmount]);
        await lockedSql.query("insert into lead_activities(lead_id) values($1)", [id]);
        await lockedSql.query("insert into admin_tasks(id,lead_id) values($1,$2)", ["task-" + id, id]);
        await delay(100);
        return { kind: "created", id };
      },
    );

    let releaseFirstLock;
    const firstLocked = new Promise((resolve) => { releaseFirstLock = resolve; });
    const first = submit({ id: "lead-first", onLocked: releaseFirstLock });
    await firstLocked;
    const second = submit({ id: "lead-second" });
    const results = await Promise.all([first, second]);

    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate").length, 1);
    const counts = await pool.query(`
      select
        (select count(*)::int from "${schema}".leads) as leads,
        (select count(*)::int from "${schema}".lead_activities) as activities,
        (select count(*)::int from "${schema}".admin_tasks) as tasks
    `);
    assert.deepEqual(counts.rows[0], { leads: 1, activities: 1, tasks: 1 });

    const budgetUpdate = await submit({ id: "lead-budget", budgetAmount: 250 });
    assert.equal(budgetUpdate.kind, "duplicate");
    const lead = await pool.query(`select id,budget_amount from "${schema}".leads`);
    assert.equal(lead.rows.length, 1);
    assert.equal(lead.rows[0].budget_amount, 250);

    const callbackAt = new Date("2026-11-12T10:00:00.000Z");
    const callbackBackendPids = [];
    const submitCallback = (id) => withPublicLeadPhoneDedupeLock(sql, phone, async (lockedSql) => {
      const backend = await lockedSql.query("select pg_backend_pid() as pid");
      callbackBackendPids.push(Number(backend[0].pid));
      await lockedSql.query("set search_path to \"" + schema + "\"");
      const existing = await findRecentPublicCallbackLead(lockedSql, phone, callbackAt);
      if (existing) return { kind: "duplicate", id: existing.id, trackingToken: existing.public_tracking_token };
      await lockedSql.query(
        "insert into leads(id,phone,callback_preferred_at,public_tracking_token) values($1,$2,$3,$4)",
        [id, phone, callbackAt.toISOString(), "token-" + id],
      );
      await lockedSql.query("insert into lead_activities(lead_id) values($1)", [id]);
      await lockedSql.query("insert into admin_tasks(id,lead_id) values($1,$2)", ["task-" + id, id]);
      await delay(100);
      return { kind: "created", id, trackingToken: "token-" + id };
    });
    const callbackResults = await Promise.all([submitCallback("callback-first"), submitCallback("callback-retry")]);
    assert.equal(callbackResults.filter((result) => result.kind === "created").length, 1);
    assert.equal(callbackResults.filter((result) => result.kind === "duplicate").length, 1);
    assert.equal(callbackResults[0].trackingToken, callbackResults[1].trackingToken);
    assert.equal(new Set(callbackBackendPids).size, 2, "callback retries must use independent PostgreSQL sessions");
    const callbackCounts = await pool.query(`
      select
        (select count(*)::int from "${schema}".leads where callback_preferred_at is not null) as leads,
        (select count(*)::int from "${schema}".lead_activities) as activities,
        (select count(*)::int from "${schema}".admin_tasks) as tasks
    `);
    assert.deepEqual(callbackCounts.rows[0], { leads: 1, activities: 2, tasks: 2 });

    await assert.rejects(
      withPublicLeadPhoneDedupeLock(sql, "09123456780", async () => {
        throw new Error("expected rollback");
      }),
      /expected rollback/,
    );
    const afterRollback = await withPublicLeadPhoneDedupeLock(sql, "09123456780", async (lockedSql) => {
      await lockedSql.query("set search_path to \"" + schema + "\"");
      await lockedSql.query("insert into leads(id,phone) values('lead-after-rollback','09123456780')");
      return "created";
    });
    assert.equal(afterRollback, "created", "a rollback must release the transaction-scoped phone lock");

    let entered = 0;
    let timeoutId;
    let releaseBoth;
    const bothEntered = new Promise((resolve) => { releaseBoth = resolve; });
    const waitForBoth = Promise.race([
      bothEntered,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("different phone locks unexpectedly serialized")), 3_000);
      }),
    ]);
    const acquireDifferentPhone = (differentPhone) => withPublicLeadPhoneDedupeLock(
      sql,
      differentPhone,
      async () => {
        entered += 1;
        if (entered === 2) releaseBoth();
        await waitForBoth;
        return differentPhone;
      },
    );
    try {
      assert.deepEqual(
        await Promise.all([acquireDifferentPhone("09123456781"), acquireDifferentPhone("09123456782")]),
        ["09123456781", "09123456782"],
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    await pool.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await pool.end();
  }
});
