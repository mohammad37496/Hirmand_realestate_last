import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { listAdminLeadDuplicateCandidates, mergeAdminLeadDuplicate } from "./admin-lead-dedupe.ts";
import type { Sql } from "./db.ts";

const { Pool } = pg;

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table consultants (id text primary key, name text not null);
    insert into consultants(id,name) values ('consultant-2','مشاور دوم');
    create table leads (
      id text primary key, name text not null, phone text not null,
      people_count integer, job text, deal text, property_type text, neighborhood text,
      consultant text, consultant_id text, consultant_link_state text not null default 'legacy_unresolved', note text, status text not null, source text,
      acquisition_source text, acquisition_medium text, acquisition_campaign text,
      acquisition_referrer text, acquisition_landing_path text, follow_up_at timestamptz, last_contacted_at timestamptz,
      property_id text, visit_preferred_at timestamptz, visit_requested_at timestamptz,
      visit_status text, lease_deadline timestamptz, floor_preference text not null default '',
      callback_preferred_at timestamptz, offer_amount numeric, offer_conditions text not null default '', budget_deposit numeric,
      budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric,
      budget_rent_max numeric, budget_purchase_min numeric, budget_purchase_max numeric,
      budget_sale_min numeric, budget_sale_max numeric, budget_equivalent numeric,
      budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb, matched_properties jsonb, match_count integer,
      merged_into_lead_id text,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key, lead_id text not null, activity_type text not null,
      title text not null default '', note text not null default '', metadata jsonb not null default '{}'::jsonb
    );
    create table admin_tasks (id text primary key, entity_type text not null, entity_id text, updated_at timestamptz not null default current_timestamp);
    create table customer_property_submissions (id text primary key, lead_id text);
    create table customer_messages (id text primary key, lead_id text not null, tracking_token text not null, sender_type text not null, sender_name text not null, message text not null);
    create table finance_transactions (id text primary key, lead_id text);
    create table admin_deals (id text primary key, lead_id text, updated_at timestamptz not null default current_timestamp);
    create table lead_visit_feedback (id bigserial primary key, lead_id text not null, tracking_token text not null);
    insert into leads(id,name,phone,status,note,source,requested_amenities,matched_properties,match_count)
      values
        ('A','Canonical A','09123456789','new','','website','[]'::jsonb,'[]'::jsonb,0),
        ('B','Duplicate B','09123456789','new','B-only context','divar','[]'::jsonb,'[]'::jsonb,0),
        ('C','Canonical C','09123456789','new','','website','[]'::jsonb,'[]'::jsonb,0);
    insert into lead_activities(lead_id,activity_type,title,note)
      values ('B','note','B activity','Activity must move exactly once');
  `);
  const sql = {
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
    query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as R[],
  } as Sql;
  return { pg, sql };
}

test("duplicate candidate listing propagates database query failures", async () => {
  const pg = new PGlite();
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  try {
    await assert.rejects(listAdminLeadDuplicateCandidates(sql), /relation .*leads.* does not exist/i);
  } finally {
    await pg.close();
  }
});

test("duplicate merge keeps the canonical consultant ID and does not attach a mismatched duplicate ID to a nonblank snapshot", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("update leads set consultant='Snapshot A',consultant_link_state='legacy_unresolved' where id='A'");
    await sql.query("update leads set consultant='مشاور دوم',consultant_id='consultant-2',consultant_link_state='linked' where id='B'");
    const result = await mergeAdminLeadDuplicate(sql, "A", "B");
    assert.equal(result.kind, "merged");
    if (result.kind === "merged") assert.equal(result.movedActivities, 1);
    const row = await sql.query<{ consultant: string; consultant_id: string | null; consultant_link_state: string }>(
      "select consultant,consultant_id,consultant_link_state from leads where id='A'",
    );
    assert.deepEqual(row[0], { consultant: "Snapshot A", consultant_id: null, consultant_link_state: "legacy_unresolved" });
  } finally {
    await pg.close();
  }
});

test("duplicate merge copies a linked consultant only when the canonical snapshot is blank", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("update leads set consultant='',consultant_link_state='unassigned' where id='A'");
    await sql.query("update leads set consultant='مشاور دوم',consultant_id='consultant-2',consultant_link_state='linked' where id='B'");
    const result = await mergeAdminLeadDuplicate(sql, "A", "B");
    assert.equal(result.kind, "merged");
    if (result.kind === "merged") assert.equal(result.movedActivities, 1);
    const row = await sql.query<{ consultant: string; consultant_id: string | null; consultant_link_state: string }>(
      "select consultant,consultant_id,consultant_link_state from leads where id='A'",
    );
    assert.deepEqual(row[0], { consultant: "مشاور دوم", consultant_id: "consultant-2", consultant_link_state: "linked" });
  } finally {
    await pg.close();
  }
});

test("duplicate candidate listing returns actual active duplicate pairs", async () => {
  const { pg, sql } = await createFixture();
  try {
    const rows = await listAdminLeadDuplicateCandidates(sql);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.reason === "تلفن مشترک"));
  } finally {
    await pg.close();
  }
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForBlockedBackend(admin: InstanceType<typeof Pool>, backendPid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await admin.query(
      "select wait_event_type, cardinality(pg_blocking_pids(pid))::int as blockers from pg_stat_activity where pid=$1",
      [backendPid],
    );
    if (result.rows[0]?.wait_event_type === "Lock" && Number(result.rows[0]?.blockers) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`PostgreSQL backend ${backendPid} never entered a row-lock wait`);
}

async function waitForSignal(promise: Promise<unknown>, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createPostgresSql(pool: InstanceType<typeof Pool>, hooks: {
  onBegin?: (pid: number) => Promise<void>;
  afterLeadLock?: (pid: number) => Promise<void>;
} = {}): Sql {
  return {
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const pid = Number((await client.query("select pg_backend_pid() as pid")).rows[0]?.pid);
        await hooks.onBegin?.(pid);
        const transactionSql = {
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => {
            const rows = (await client.query(text, params)).rows as R[];
            if (/select\s+id,status,consultant,consultant_id,consultant_link_state\s+from\s+leads[\s\S]*for update/i.test(text)) {
              await hooks.afterLeadLock?.(pid);
            }
            return rows;
          },
        } as Sql;
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
  } as Sql;
}

test("a closed duplicate is excluded from active suggestions and rejected by stale merge IDs", async () => {
  const { pg, sql } = await createFixture();
  try {
    const result = await mergeAdminLeadDuplicate(sql, "A", "B");
    assert.equal(result.kind, "merged");
    if (result.kind === "merged") assert.equal(result.movedActivities, 1);

    const activeCandidates = await sql.query<{ id: string }>(
      "select id from leads where status not in ('closed','spam') and regexp_replace(phone,'[^0-9]','','g')=$1 order by id",
      ["09123456789"],
    );
    assert.deepEqual(activeCandidates.map((row) => row.id), ["A", "C"]);

    assert.deepEqual(await mergeAdminLeadDuplicate(sql, "C", "B"), {
      kind: "duplicate_inactive",
    });
    const leads = await sql.query<{ id: string; name: string; note: string; status: string; source: string }>(
      "select id,name,note,status,source from leads order by id",
    );
    assert.deepEqual(leads[0], { id: "A", name: "Canonical A", note: "B-only context", status: "new", source: "website" });
    assert.equal(leads[1]?.id, "B");
    assert.equal(leads[1]?.name, "Duplicate B");
    assert.equal(leads[1]?.status, "closed");
    assert.match(leads[1]?.note ?? "", /^B-only context\nاین لید در .+ با لید A ادغام شد\.$/);
    assert.deepEqual(leads[2], { id: "C", name: "Canonical C", note: "", status: "new", source: "website" });
    const activities = await sql.query<{ lead_id: string; title: string }>(
      "select lead_id,title from lead_activities order by id",
    );
    assert.deepEqual(activities.map((row) => row.lead_id), ["A", "A"]);
    assert.ok(activities.some((row) => row.title === "ادغام لید تکراری"));
  } finally {
    await pg.close();
  }
});

test("two concurrent merge requests cannot consume the same duplicate lead", async () => {
  const { pg, sql } = await createFixture();
  try {
    const results = await Promise.all([
      mergeAdminLeadDuplicate(sql, "A", "B"),
      mergeAdminLeadDuplicate(sql, "C", "B"),
    ]);
    assert.equal(results.filter((result) => result.kind === "merged").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate_inactive").length, 1);
    const activities = await sql.query<{ lead_id: string; title: string }>(
      "select lead_id,title from lead_activities order by id",
    );
    assert.equal(activities.filter((row) => row.title === "B activity").length, 1);
    assert.notEqual(activities.find((row) => row.title === "B activity")?.lead_id, "B");
    const duplicate = await sql.query<{ status: string }>("select status from leads where id='B'");
    assert.equal(duplicate[0]?.status, "closed");
  } finally {
    await pg.close();
  }
});

test("two PostgreSQL sessions serialize competing merges of the same duplicate lead", {
  skip: !process.env.TEST_DATABASE_URL?.trim() && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL!.trim();
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `lead_dedupe_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool: InstanceType<typeof Pool> | undefined;
  const releaseFirst = deferred();
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
      create table consultants (id text primary key, name text not null);
      insert into consultants(id,name) values ('consultant-2','مشاور دوم');
      create table leads (
        id text primary key, name text not null, phone text not null, status text not null,
        people_count integer, job text, deal text, property_type text, neighborhood text,
        consultant text, consultant_id text, consultant_link_state text not null default 'legacy_unresolved', note text, source text, acquisition_source text, acquisition_medium text,
        acquisition_campaign text, acquisition_referrer text, follow_up_at timestamptz,
        acquisition_landing_path text,
        last_contacted_at timestamptz, property_id text, visit_preferred_at timestamptz,
        visit_requested_at timestamptz, visit_status text, lease_deadline timestamptz,
        floor_preference text not null default '', callback_preferred_at timestamptz,
        offer_amount numeric, offer_conditions text not null default '', merged_into_lead_id text,
        budget_deposit numeric, budget_rent numeric, budget_purchase numeric, budget_sale numeric,
        budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric,
        budget_rent_max numeric, budget_purchase_min numeric, budget_purchase_max numeric,
        budget_sale_min numeric, budget_sale_max numeric, budget_equivalent numeric,
        budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
        requested_amenities jsonb not null default '[]'::jsonb,
        matched_properties jsonb not null default '[]'::jsonb,
        match_count integer not null default 0,
        updated_at timestamptz not null default current_timestamp
      );
      create table lead_activities (
        id bigserial primary key, lead_id text not null, activity_type text not null,
        title text not null default '', note text not null default '', metadata jsonb not null default '{}'::jsonb
      );
      create table admin_tasks (id text primary key, entity_type text not null, entity_id text, updated_at timestamptz not null default current_timestamp);
      create table customer_property_submissions (id text primary key, lead_id text);
      create table customer_messages (id text primary key, lead_id text not null, tracking_token text not null, sender_type text not null, sender_name text not null, message text not null);
      create table finance_transactions (id text primary key, lead_id text);
      create table admin_deals (id text primary key, lead_id text, updated_at timestamptz not null default current_timestamp);
      create table lead_visit_feedback (id bigserial primary key, lead_id text not null, tracking_token text not null);
      insert into leads(id,name,phone,status,note,source)
        values ('A','Canonical A','09123456789','new','','website'),
               ('B','Duplicate B','09123456789','new','B-only context','divar'),
               ('C','Canonical C','09123456789','new','','website');
      insert into lead_activities(lead_id,activity_type,title,note)
        values ('B','note','B activity','Must move exactly once');
    `);

    const backendPids: number[] = [];
    let firstHolderPid: number | undefined;
    const bothTransactionsStarted = deferred();
    const bothStartedBarrier = async (pid: number) => {
      backendPids.push(pid);
      if (backendPids.length === 2) bothTransactionsStarted.resolve();
      await waitForSignal(bothTransactionsStarted.promise, "both PostgreSQL sessions");
    };
    const sql = createPostgresSql(pool, {
      onBegin: bothStartedBarrier,
      afterLeadLock: async (pid) => {
        if (firstHolderPid == null) {
          firstHolderPid = pid;
          await releaseFirst.promise;
        }
      },
    });
    const operations = Promise.all([
      mergeAdminLeadDuplicate(sql, "A", "B"),
      mergeAdminLeadDuplicate(sql, "C", "B"),
    ]);

    try {
      const holderDeadline = Date.now() + 5_000;
      while (firstHolderPid == null && Date.now() < holderDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.ok(firstHolderPid, "one PostgreSQL session must acquire the lead row locks");
      const contenderPid = backendPids.find((pid) => pid !== firstHolderPid);
      assert.ok(contenderPid, "the second PostgreSQL session must have started");
      await waitForBlockedBackend(admin, contenderPid);
    } finally {
      releaseFirst.resolve();
    }

    const results = await operations;
    assert.equal(results.filter((result) => result.kind === "merged").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate_inactive").length, 1);
    const duplicate = await pool.query("select status from leads where id='B'");
    assert.equal(duplicate.rows[0]?.status, "closed");
    const activities = await pool.query("select lead_id,title from lead_activities order by id");
    assert.equal(activities.rows.filter((row) => row.title === "B activity").length, 1);
    assert.notEqual(activities.rows.find((row) => row.title === "B activity")?.lead_id, "B");
    assert.equal(activities.rows.filter((row) => row.title === "ادغام لید تکراری").length, 1);
  } finally {
    releaseFirst.resolve();
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});

test("lead dedupe suggestions and preview exclude closed and spam leads", async () => {
  const route = await readFile(
    new URL("../../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url),
    "utf8",
  );
  const helper = await readFile(new URL("./admin-lead-dedupe.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/hirmand/admin-lead-dedupe.tsx", import.meta.url), "utf8");
  assert.match(route, /listAdminLeadDuplicateCandidates\(sql\)/);
  assert.match(helper, /from leads\s+where status not in \('closed','spam'\)/i);
  assert.doesNotMatch(helper, /\.catch\(/, "database failures must not be converted into an empty duplicate list");
  assert.match(route, /from leads where id = any\(\$1::text\[\]\) and status not in \('closed','spam'\)/i);
  assert.match(route, /mergeAdminLeadDuplicate\(sql, canonicalId, duplicateId\)/);
  assert.match(route, /statusCode: 409[\s\S]*?قبلاً بسته یا ادغام شده است/);
  assert.match(component, /setLoadError\(message\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!loading && !loadError && !groups\.length/);
});
