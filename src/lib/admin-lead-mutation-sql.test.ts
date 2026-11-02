import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ASSIGN_LEAD_WITH_ACTIVITY_SQL,
  UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL,
  UPDATE_LEAD_NOTE_WITH_ACTIVITY_SQL,
  UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL,
  UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL,
  UPDATE_EXISTING_BUDGET_LEAD_SQL,
} from "./admin-lead-mutation-sql.ts";

async function createDb(rejectActivity = false) {
  const db = new PGlite();
  await db.exec(`
    create table leads (
      id text primary key,
      status text not null default 'new',
      merged_into_lead_id text,
      follow_up_at timestamptz,
      last_contacted_at timestamptz,
      visit_status text not null default 'none',
      note text not null default '',
      consultant text not null default '',
      updated_at timestamptz
    );
    create table lead_activities (
      id bigserial primary key,
      lead_id text not null references leads(id) on delete cascade,
      activity_type text not null check (activity_type in ('note','call','whatsapp','match','visit','follow_up','status','document')),
      title text not null default '',
      note text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
      ${rejectActivity ? ", constraint reject_activity check (false)" : ""}
    );
    insert into leads (id,status,visit_status,note,consultant) values ('lead-1','new','none','original note','old consultant');
  `);
  return db;
}

const followUpAt = "2026-11-05T10:30:00.000Z";

test("lead status, visit, note, follow-up and assignment updates each write a matching activity", async () => {
  const db = await createDb();
  try {
    assert.equal((await db.query(UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "contacted", followUpAt, "Status changed", "New status: contacted", JSON.stringify({ status: "contacted" })])).rows.length, 1);
    assert.equal((await db.query(UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "confirmed", "Visit confirmed", "Confirmed with customer", JSON.stringify({ visitStatus: "confirmed" }), "none", "contacted"])).rows.length, 1);
    const note = await db.query<{ note: string }>(UPDATE_LEAD_NOTE_WITH_ACTIVITY_SQL, ["lead-1", "updated note", "Internal note updated", JSON.stringify({ noteUpdated: true })]);
    assert.equal(note.rows[0]?.note, "updated note");
    assert.equal((await db.query(UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL, ["lead-1", followUpAt, "Follow-up scheduled", `Follow-up at ${followUpAt}`, JSON.stringify({ followUpAt })])).rows.length, 1);
    assert.equal((await db.query(ASSIGN_LEAD_WITH_ACTIVITY_SQL, ["lead-1", "new consultant", "Consultant assigned", "Assignment from CRM balancing center", JSON.stringify({ consultant: "new consultant" })])).rows.length, 1);

    const lead = await db.query<{ status: string; visit_status: string; note: string; consultant: string; follow_up_at: string; last_contacted_at: string }>(
      "select status,visit_status,note,consultant,follow_up_at::text as follow_up_at,last_contacted_at::text as last_contacted_at from leads where id='lead-1'",
    );
    assert.equal(lead.rows[0]?.status, "contacted");
    assert.equal(lead.rows[0]?.visit_status, "confirmed");
    assert.equal(lead.rows[0]?.note, "updated note");
    assert.equal(lead.rows[0]?.consultant, "new consultant");
    assert.equal(Date.parse(lead.rows[0]?.follow_up_at ?? ""), Date.parse(followUpAt));
    assert.ok(lead.rows[0]?.last_contacted_at);

    const cleared = await db.query<{ follow_up_at: string | null }>(
      UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL,
      ["lead-1", null, "Follow-up cleared", "Next follow-up cleared", JSON.stringify({ followUpAt: null })],
    );
    assert.equal(cleared.rows[0]?.follow_up_at, null);

    const activities = await db.query<{ activity_type: string }>("select activity_type from lead_activities order by id");
    assert.deepEqual(activities.rows.map((row) => row.activity_type), ["status", "visit", "note", "follow_up", "status", "follow_up"]);
  } finally {
    await db.close();
  }
});

test("failed activity inserts roll back every associated lead mutation", async () => {
  const db = await createDb(true);
  try {
    const mutations: Array<[string, unknown[]]> = [
      [UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "contacted", followUpAt, "Status changed", "New status: contacted", JSON.stringify({ status: "contacted" })]],
      [UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "confirmed", "Visit confirmed", "Confirmed", JSON.stringify({ visitStatus: "confirmed" }), "none", "new"]],
      [UPDATE_LEAD_NOTE_WITH_ACTIVITY_SQL, ["lead-1", "updated note", "Internal note updated", JSON.stringify({ noteUpdated: true })]],
      [UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL, ["lead-1", followUpAt, "Follow-up scheduled", `Follow-up at ${followUpAt}`, JSON.stringify({ followUpAt })]],
      [ASSIGN_LEAD_WITH_ACTIVITY_SQL, ["lead-1", "new consultant", "Consultant assigned", "Assignment from CRM balancing center", JSON.stringify({ consultant: "new consultant" })]],
    ];

    for (const [sql, params] of mutations) {
      await assert.rejects(db.query(sql, params));
      const lead = await db.query<{ status: string; visit_status: string; note: string; consultant: string; follow_up_at: string | null; last_contacted_at: string | null }>(
        "select status,visit_status,note,consultant,follow_up_at,last_contacted_at from leads where id='lead-1'",
      );
      assert.deepEqual(lead.rows[0], {
        status: "new",
        visit_status: "none",
        note: "original note",
        consultant: "old consultant",
        follow_up_at: null,
        last_contacted_at: null,
      });
      const activities = await db.query<{ count: number }>("select count(*)::int as count from lead_activities");
      assert.equal(activities.rows[0]?.count, 0);
    }
  } finally {
    await db.close();
  }
});

test("closing or spamming a lead atomically cancels its active visit and records both timeline events", async () => {
  for (const [status, visitStatus] of [["closed", "requested"], ["spam", "confirmed"]] as const) {
    const db = await createDb();
    try {
      await db.query("update leads set visit_status=$1 where id='lead-1'", [visitStatus]);
      const updated = await db.query(
        UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL,
        ["lead-1", status, null, "Status changed", "New status: " + status, JSON.stringify({ status })],
      );
      assert.equal(updated.rows.length, 1);

      const lead = await db.query<{ status: string; visit_status: string }>(
        "select status,visit_status from leads where id='lead-1'",
      );
      assert.deepEqual(lead.rows[0], { status, visit_status: "cancelled" });

      const activities = await db.query<{ activity_type: string; metadata: Record<string, unknown> }>(
        "select activity_type,metadata from lead_activities order by id",
      );
      assert.deepEqual(activities.rows.map((activity) => activity.activity_type).sort(), ["status", "visit"]);
      const visitActivity = activities.rows.find((activity) => activity.activity_type === "visit");
      assert.deepEqual(visitActivity?.metadata, {
        visitStatus: "cancelled",
        reason: "lead_closed",
        leadStatus: status,
      });
    } finally {
      await db.close();
    }
  }
});

test("non-terminal lead status changes preserve an active visit", async () => {
  const db = await createDb();
  try {
    await db.query("update leads set visit_status='requested' where id='lead-1'");
    await db.query(
      UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL,
      ["lead-1", "contacted", followUpAt, "Status changed", "New status: contacted", JSON.stringify({ status: "contacted" })],
    );
    const lead = await db.query<{ status: string; visit_status: string }>(
      "select status,visit_status from leads where id='lead-1'",
    );
    assert.deepEqual(lead.rows[0], { status: "contacted", visit_status: "requested" });
    const activities = await db.query<{ activity_type: string }>("select activity_type from lead_activities order by id");
    assert.deepEqual(activities.rows.map((activity) => activity.activity_type), ["status"]);
  } finally {
    await db.close();
  }
});

test("visit status compare-and-set does not overwrite a state changed by a concurrent request", async () => {
  const db = await createDb();
  try {
    const rows = await db.query(
      UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL,
      ["lead-1", "confirmed", "Visit confirmed", "Confirmed", JSON.stringify({ visitStatus: "confirmed" }), "requested", "new"],
    );
    assert.equal(rows.rows.length, 0);
    const lead = await db.query<{ visit_status: string }>("select visit_status from leads where id='lead-1'");
    assert.equal(lead.rows[0]?.visit_status, "none");
    const activities = await db.query<{ count: number }>("select count(*)::int as count from lead_activities");
    assert.equal(activities.rows[0]?.count, 0);
  } finally {
    await db.close();
  }
});

test("visit status CAS refuses to reactivate a lead closed by a concurrent dedupe", async () => {
  const db = await createDb();
  try {
    await db.query("update leads set status='closed' where id='lead-1'");
    const rows = await db.query(
      UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL,
      ["lead-1", "requested", "Visit requested", "Requested after merge", JSON.stringify({ visitStatus: "requested" }), "none", "new"],
    );
    assert.equal(rows.rows.length, 0);
    const lead = await db.query<{ status: string; visit_status: string }>("select status,visit_status from leads where id='lead-1'");
    assert.equal(lead.rows[0]?.status, "closed");
    assert.equal(lead.rows[0]?.visit_status, "none");
    assert.equal((await db.query("select id from lead_activities")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("public budget refresh uses the canonical-lead guard and cannot mutate a merged duplicate", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key, merged_into_lead_id text, name text, people_count integer, job text, deal text,
        property_type text, neighborhood text, consultant text, note text, source text, follow_up_at timestamptz,
        lease_deadline timestamptz, acquisition_source text, acquisition_medium text, acquisition_campaign text,
        acquisition_referrer text, acquisition_landing_path text, budget_deposit numeric, budget_rent numeric,
        budget_purchase numeric, budget_sale numeric, budget_rate numeric, budget_equivalent numeric,
        budget_bedrooms integer, matched_properties jsonb, match_count integer, floor_preference text,
        budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric, budget_rent_max numeric,
        budget_purchase_min numeric, budget_purchase_max numeric, budget_sale_min numeric, budget_sale_max numeric,
        requested_amenities jsonb, requested_bedrooms integer, requested_area_min numeric, requested_area_max numeric,
        public_tracking_token text, updated_at timestamptz
      );
      insert into leads(id,name,public_tracking_token) values
        ('canonical','Before',null),('duplicate','Duplicate','HIR-26-BBBBBBBBBBBB');
      update leads set merged_into_lead_id='canonical',name='Duplicate' where id='duplicate';
    `);
    const params = (id: string) => [
      id, "After", 2, "job", "خرید", "apartment", "neighborhood", "consultant", "note", "budget_match",
      1000, 100, 200, 300, 1, 500, 3, JSON.stringify([]), 0, "utm-source", "utm-medium", "campaign",
      "referrer", "/landing", "floor", 900, 1100, 90, 120, 180, 220, 270, 330,
      JSON.stringify(["parking"]), 2, 70, 90, "HIR-26-AAAAAAAAAAAA",
    ];
    const canonical = await db.query<{ id: string; public_tracking_token: string }>(UPDATE_EXISTING_BUDGET_LEAD_SQL, params("canonical"));
    assert.equal(canonical.rows[0]?.id, "canonical");
    assert.equal(canonical.rows[0]?.public_tracking_token, "HIR-26-AAAAAAAAAAAA");
    const duplicate = await db.query(UPDATE_EXISTING_BUDGET_LEAD_SQL, params("duplicate"));
    assert.equal(duplicate.rows.length, 0);
    const preserved = await db.query<{ name: string; merged_into_lead_id: string }>(
      "select name,merged_into_lead_id from leads where id='duplicate'",
    );
    assert.deepEqual(preserved.rows[0], { name: "Duplicate", merged_into_lead_id: "canonical" });
  } finally {
    await db.close();
  }
});

test("CRM routes use atomic mutation-and-activity SQL without swallowing activity errors", () => {
  const leadsRoute = readFileSync(new URL("../../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8");
  const assignmentRoute = readFileSync(new URL("../../server/routes/api/admin-lead-assignment.post.ts", import.meta.url), "utf8");
  const publicActionsRoute = readFileSync(new URL("../../server/routes/api/public-lead-actions.post.ts", import.meta.url), "utf8");
  const publicLeadsRoute = readFileSync(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  const mutationSql = readFileSync(new URL("./admin-lead-mutation-sql.ts", import.meta.url), "utf8");
  const dedupeRoute = readFileSync(new URL("../../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url), "utf8");
  const dedupeServer = readFileSync(new URL("./admin-lead-dedupe.server.ts", import.meta.url), "utf8");
  const dedupeSql = readFileSync(new URL("./admin-lead-dedupe-sql.ts", import.meta.url), "utf8");
  for (const name of ["UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL", "UPDATE_LEAD_NOTE_WITH_ACTIVITY_SQL", "UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL"]) {
    assert.match(leadsRoute, new RegExp(`sql\\.query<\\{[^>]+\\}>\\(\\s*${name}`));
  }
  assert.match(leadsRoute, /tx\.query<\{ id: string \}>\(\s*UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL/);
  assert.match(assignmentRoute, /sql\.query<\{ id: string \}>\(\s*ASSIGN_LEAD_WITH_ACTIVITY_SQL/);
  assert.match(leadsRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(leadsRoute, /checkPropertyVisitSlot\(tx/);
  assert.match(publicActionsRoute, /reschedulePropertyVisit\(tx/);
  assert.match(publicActionsRoute, /cancelPropertyVisit\(tx/);
  assert.match(publicLeadsRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(publicLeadsRoute, /UPDATE_EXISTING_BUDGET_LEAD_SQL/);
  assert.match(publicLeadsRoute, /lockLeadReferencesForMutation\(tx, \[existing\[0\]\.id\]\)/);
  assert.match(mutationSql, /where id=\$1 and merged_into_lead_id is null\s+returning id,public_tracking_token/);
  assert.match(publicLeadsRoute, /checkPropertyVisitSlot\(tx/);
  assert.match(leadsRoute, /checkPropertyVisitSlot\(tx/);
  assert.match(leadsRoute, /visitTime < Date\.now\(\) \+ 30 \* 60 \* 1000/);
  assert.match(dedupeRoute, /planLeadVisitMerge\(canonical, duplicate\)/);
  assert.match(dedupeRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(dedupeRoute, /mergeLeadDedupeRelations\(tx, canonicalId, duplicateId\)/);
  assert.match(dedupeRoute, /lockLeadDedupeSnapshot\(tx, canonicalId, duplicateId, initialRows\)/);
  assert.match(dedupeServer, /String\(before\.status \?\? ""\) === String\(after\.status \?\? ""\)/);
  assert.doesNotMatch(dedupeRoute, /\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(dedupeSql, /id = any\(\$3::text\[\]\)/);
  assert.match(dedupeSql, /visit_status = case when visit_status in \('requested','confirmed'\) then 'cancelled'/);
  assert.match(dedupeSql, /merge_history as \(/);
  assert.match(dedupeSql, /merged_into_lead_id = \$1/);
  assert.doesNotMatch(leadsRoute, /\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.doesNotMatch(assignmentRoute, /\.catch\(\(\)\s*=>\s*\{\}\)/);
});
