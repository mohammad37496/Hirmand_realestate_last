import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mergeLeadDedupeRelations, lockLeadReferencesForMutation } from "../src/lib/admin-lead-dedupe.server.ts";
import { UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL } from "../src/lib/admin-lead-mutation-sql.ts";

const route = await readFile(new URL("../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url), "utf8");
const mergeSql = await readFile(new URL("../src/lib/admin-lead-dedupe-sql.ts", import.meta.url), "utf8");

test("lead dedupe preview exposes callback and offer fields that merge preserves", () => {
  const previewStart = route.indexOf('if (action === "preview")');
  const previewEnd = route.indexOf('if (action !== "merge")', previewStart);
  const preview = route.slice(previewStart, previewEnd);
  for (const field of ["callback_preferred_at", "offer_amount", "offer_conditions"]) assert.ok(preview.includes(field), "preview must expose " + field);
  assert.match(mergeSql, /callback_preferred_at = coalesce\(l\.callback_preferred_at, d\.callback_preferred_at\)/);
  assert.match(mergeSql, /offer_amount = coalesce\(l\.offer_amount, d\.offer_amount\)/);
  assert.ok(mergeSql.includes("offer_conditions = case when trim(coalesce(l.offer_conditions,'')) = '' then d.offer_conditions else l.offer_conditions end"));
});

test("merging a duplicate lead preserves missing callback and offer data without overwriting canonical values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (id text primary key, callback_preferred_at timestamptz, offer_amount numeric, offer_conditions text not null default '');
      insert into leads values
        ('canonical', null, null, ''),
        ('duplicate', '2026-11-02T10:00:00Z', 250000000, 'cash and transfer'),
        ('canonical-keeps', '2026-11-03T10:00:00Z', 300000000, 'existing terms'),
        ('duplicate-2', '2026-11-04T10:00:00Z', 400000000, 'new terms');
    `);
    const merge = async (canonicalId, duplicateId) => db.query(`
      update leads l set
        callback_preferred_at = coalesce(l.callback_preferred_at, d.callback_preferred_at),
        offer_amount = coalesce(l.offer_amount, d.offer_amount),
        offer_conditions = case when trim(coalesce(l.offer_conditions,'')) = '' then d.offer_conditions else l.offer_conditions end
      from leads d where l.id=$1 and d.id=$2
    `, [canonicalId, duplicateId]);
    await merge("canonical", "duplicate");
    const filled = await db.query("select callback_preferred_at, offer_amount, offer_conditions from leads where id='canonical'");
    assert.equal(new Date(filled.rows[0].callback_preferred_at).toISOString(), "2026-11-02T10:00:00.000Z");
    assert.equal(Number(filled.rows[0].offer_amount), 250000000);
    assert.equal(filled.rows[0].offer_conditions, "cash and transfer");
    await merge("canonical-keeps", "duplicate-2");
    const kept = await db.query("select callback_preferred_at, offer_amount, offer_conditions from leads where id='canonical-keeps'");
    assert.equal(new Date(kept.rows[0].callback_preferred_at).toISOString(), "2026-11-03T10:00:00.000Z");
    assert.equal(Number(kept.rows[0].offer_amount), 300000000);
    assert.equal(kept.rows[0].offer_conditions, "existing terms");
  } finally { await db.close(); }
});

async function dedupeFixture() {
  const db = new PGlite();
  await db.exec(`
    create table leads (
      id text primary key, status text not null default 'new', merged_into_lead_id text,
      name text, phone text, people_count integer, job text, deal text, property_type text,
      neighborhood text, consultant text, note text, source text, acquisition_source text,
      acquisition_medium text, acquisition_campaign text, acquisition_referrer text,
      follow_up_at timestamptz, last_contacted_at timestamptz, callback_preferred_at timestamptz,
      offer_amount numeric, offer_conditions text, property_id text, visit_preferred_at timestamptz,
      visit_requested_at timestamptz, visit_status text not null default 'none', lease_deadline timestamptz,
      budget_deposit numeric, budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric, budget_rent_max numeric,
      budget_purchase_min numeric, budget_purchase_max numeric, budget_sale_min numeric, budget_sale_max numeric,
      budget_equivalent numeric, budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb not null default '[]'::jsonb, matched_properties jsonb not null default '[]'::jsonb,
      match_count integer not null default 0, public_tracking_token text unique,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key, lead_id text not null references leads(id) on delete cascade,
      activity_type text not null, title text not null, note text not null default '',
      metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default current_timestamp
    );
    create table admin_deals (id text primary key, lead_id text, updated_at timestamptz not null default current_timestamp);
    create table finance_transactions (id bigserial primary key, lead_id text);
    create table admin_tasks (
      id text primary key, title text not null, description text not null default '',
      status text not null default 'open' check(status in ('open','done','cancelled')),
      entity_type text not null, entity_id text, dedupe_key text,
      created_at timestamptz not null default current_timestamp, updated_at timestamptz not null default current_timestamp
    );
    create unique index admin_tasks_one_open_lead_overdue_followup_idx
      on admin_tasks(entity_type,entity_id,dedupe_key)
      where status='open' and dedupe_key='overdue_follow_up';
    create table customer_messages (
      id text primary key, lead_id text not null references leads(id) on delete cascade,
      tracking_token text not null, message text not null
    );
    create table customer_message_cooldowns (
      lead_id text primary key references leads(id) on delete cascade, next_allowed_at timestamptz not null
    );
    create table lead_visit_feedback (
      id bigserial primary key, lead_id text not null unique, tracking_token text not null,
      rating smallint not null, interest text not null, note text not null default ''
    );
    create table customer_property_submissions (
      id text primary key, lead_id text, public_tracking_token text not null unique
    );
    insert into leads(id,status,name,phone,public_tracking_token) values
      ('canonical','new','Canonical','09130000001','HIR-30-AAAAAAAAAAAA'),
      ('duplicate','new','Duplicate','09130000001','HIR-30-BBBBBBBBBBBB');
  `);
  return db;
}

function txSql(tx) {
  return { query: async (statement, params = []) => (await tx.query(statement, params)).rows };
}

test("real PGlite transaction moves internal relationships, preserves token-bound records, and is idempotent", async () => {
  const db = await dedupeFixture();
  try {
    await db.exec(`
      insert into lead_activities(lead_id,activity_type,title) values('duplicate','call','Called customer');
      insert into admin_deals(id,lead_id) values('deal-1','duplicate');
      insert into finance_transactions(lead_id) values('duplicate');
      insert into admin_tasks(id,title,entity_type,entity_id,dedupe_key,created_at) values
        ('canonical-overdue','Old overdue','lead','canonical','overdue_follow_up','2026-10-01T00:00:00Z'),
        ('duplicate-overdue','New overdue','lead','duplicate','overdue_follow_up','2026-10-02T00:00:00Z'),
        ('duplicate-normal','Call back','lead','duplicate',null,'2026-10-03T00:00:00Z');
      insert into customer_messages(id,lead_id,tracking_token,message) values('message-1','duplicate','HIR-30-BBBBBBBBBBBB','Keep token thread');
      insert into customer_message_cooldowns(lead_id,next_allowed_at) values('duplicate','2030-01-01T00:00:00Z');
      insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values('duplicate','HIR-30-BBBBBBBBBBBB',5,'interested','Keep feedback token');
      insert into customer_property_submissions(id,lead_id,public_tracking_token) values('submission-1','duplicate','SUBMISSION-TRACKING-1');
    `);

    const result = await db.transaction((tx) => mergeLeadDedupeRelations(txSql(tx), "canonical", "duplicate"));
    assert.deepEqual(result, {
      movedActivities: 1,
      movedDeals: 1,
      movedFinanceTransactions: 1,
      movedTasks: 2,
      cancelledTaskCollisions: 1,
    });

    const leads = await db.query("select status,merged_into_lead_id from leads where id='duplicate'");
    assert.deepEqual(leads.rows[0], { status: "closed", merged_into_lead_id: "canonical" });
    assert.equal((await db.query("select count(*)::int as count from lead_activities where lead_id='canonical'")).rows[0].count, 2);
    assert.equal((await db.query("select lead_id from admin_deals where id='deal-1'")).rows[0].lead_id, "canonical");
    assert.equal((await db.query("select lead_id from finance_transactions")).rows[0].lead_id, "canonical");
    assert.equal((await db.query("select count(*)::int as count from admin_tasks where entity_id='canonical' and status='open'")).rows[0].count, 2);
    assert.equal((await db.query("select status from admin_tasks where id='canonical-overdue'")).rows[0].status, "cancelled");
    assert.equal((await db.query("select entity_id from admin_tasks where id='duplicate-overdue'")).rows[0].entity_id, "canonical");
    assert.equal((await db.query("select lead_id from customer_messages where id='message-1'")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from customer_message_cooldowns")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from lead_visit_feedback")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from customer_property_submissions")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select count(*)::int as count from lead_activities where title='ادغام لید تکراری'")).rows[0].count, 1);

    const repeated = await db.transaction((tx) => mergeLeadDedupeRelations(txSql(tx), "canonical", "duplicate"));
    assert.equal(repeated, null, "a second merge of the same duplicate must be rejected as stale");
    assert.equal((await db.query("select count(*)::int as count from lead_activities where title='ادغام لید تکراری'")).rows[0].count, 1);
    const locked = await db.transaction((tx) => lockLeadReferencesForMutation(txSql(tx), ["duplicate"]));
    assert.deepEqual(locked, { kind: "merged", canonicalId: "canonical" });
  } finally {
    await db.close();
  }
});

test("history insert failure rolls back the complete lead merge and every related mutation", async () => {
  const db = await dedupeFixture();
  try {
    await db.exec(`
      insert into lead_activities(lead_id,activity_type,title) values('duplicate','call','Original activity');
      insert into admin_deals(id,lead_id) values('deal-rollback','duplicate');
      insert into finance_transactions(lead_id) values('duplicate');
      insert into admin_tasks(id,title,entity_type,entity_id) values('task-rollback','Open task','lead','duplicate');
      create function fail_merge_history() returns trigger language plpgsql as $$
      begin
        if new.title='ادغام لید تکراری' then raise exception 'injected merge history failure'; end if;
        return new;
      end;
      $$;
      create trigger fail_merge_history before insert on lead_activities for each row execute function fail_merge_history();
    `);
    await assert.rejects(
      db.transaction((tx) => mergeLeadDedupeRelations(txSql(tx), "canonical", "duplicate")),
      /injected merge history failure/,
    );
    assert.equal((await db.query("select status,merged_into_lead_id from leads where id='duplicate'")).rows[0].status, "new");
    assert.equal((await db.query("select lead_id from lead_activities where title='Original activity'")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from admin_deals where id='deal-rollback'")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from finance_transactions")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select entity_id from admin_tasks where id='task-rollback'")).rows[0].entity_id, "duplicate");
    assert.equal((await db.query("select count(*)::int as count from lead_activities where title='ادغام لید تکراری'")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("a later relationship database failure also rolls back the lead, history and prior relationship writes", async () => {
  const db = await dedupeFixture();
  try {
    await db.exec(`
      insert into admin_deals(id,lead_id) values('deal-db-failure','duplicate');
      insert into finance_transactions(lead_id) values('duplicate');
      create function fail_finance_link() returns trigger language plpgsql as $$
      begin raise exception 'injected finance link failure'; end;
      $$;
      create trigger fail_finance_link before update on finance_transactions for each row execute function fail_finance_link();
    `);
    await assert.rejects(
      db.transaction((tx) => mergeLeadDedupeRelations(txSql(tx), "canonical", "duplicate")),
      /injected finance link failure/,
    );
    assert.equal((await db.query("select status,merged_into_lead_id from leads where id='duplicate'")).rows[0].status, "new");
    assert.equal((await db.query("select lead_id from admin_deals where id='deal-db-failure'")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select lead_id from finance_transactions")).rows[0].lead_id, "duplicate");
    assert.equal((await db.query("select count(*)::int as count from lead_activities where title='ادغام لید تکراری'")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("visit status SQL rejects a stale active-visit request after dedupe closes its lead", async () => {
  const db = await dedupeFixture();
  try {
    await db.exec("update leads set status='closed' where id='duplicate'");
    const result = await db.query(UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, [
      "duplicate", "requested", "Visit requested", "Stale request", JSON.stringify({ visitStatus: "requested" }), "none", "new",
    ]);
    assert.equal(result.rows.length, 0);
    assert.equal((await db.query("select status,visit_status from leads where id='duplicate'")).rows[0].visit_status, "none");
    assert.equal((await db.query("select count(*)::int as count from lead_activities")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("CRM relationship writers lock and reject merged lead IDs instead of creating new orphaned links", async () => {
  const [deals, finance, productivity, leadsAdmin, leads, matcher, submissions] = await Promise.all([
    readFile(new URL("../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes/api/admin-finance.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes/api/admin-productivity.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes/api/leads.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/lead-smart-matcher.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes/api/customer-property-submissions.post.ts", import.meta.url), "utf8"),
  ]);
  assert.match(deals, /lockLeadReferencesForMutation\(tx, \[leadId\]\)/);
  assert.match(finance, /lockLeadReferencesForMutation\(tx, \[leadId\]\)/);
  assert.match(productivity, /lockLeadReferencesForMutation\(tx, \[entityId\]\)/);
  assert.match(productivity, /lockLeadReferencesForMutation\(tx, leadReferences\)/);
  assert.match(leadsAdmin, /lockLeadReferencesForMutation\(tx, \[String\(row\.id\)\]\)/);
  assert.match(leads, /lockLeadReferencesForMutation\(tx, \[input\.leadId\]\)/);
  assert.match(matcher, /SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL/);
  assert.doesNotMatch(matcher, /\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(submissions, /merged_into_lead_id is null/);
});
