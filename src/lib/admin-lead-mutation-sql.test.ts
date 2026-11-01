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
} from "./admin-lead-mutation-sql.ts";

async function createDb(rejectActivity = false) {
  const db = new PGlite();
  await db.exec(`
    create table leads (
      id text primary key,
      status text not null default 'new',
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
    assert.equal((await db.query(UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "confirmed", "Visit confirmed", "Confirmed with customer", JSON.stringify({ visitStatus: "confirmed" }), "none"])).rows.length, 1);
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
      [UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL, ["lead-1", "confirmed", "Visit confirmed", "Confirmed", JSON.stringify({ visitStatus: "confirmed" }), "none"]],
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

test("visit status compare-and-set does not overwrite a state changed by a concurrent request", async () => {
  const db = await createDb();
  try {
    const rows = await db.query(
      UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL,
      ["lead-1", "confirmed", "Visit confirmed", "Confirmed", JSON.stringify({ visitStatus: "confirmed" }), "requested"],
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

test("CRM routes use atomic mutation-and-activity SQL without swallowing activity errors", () => {
  const leadsRoute = readFileSync(new URL("../../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8");
  const assignmentRoute = readFileSync(new URL("../../server/routes/api/admin-lead-assignment.post.ts", import.meta.url), "utf8");
  const publicActionsRoute = readFileSync(new URL("../../server/routes/api/public-lead-actions.post.ts", import.meta.url), "utf8");
  const publicLeadsRoute = readFileSync(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  const dedupeRoute = readFileSync(new URL("../../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url), "utf8");
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
  assert.match(publicLeadsRoute, /checkPropertyVisitSlot\(tx/);
  assert.match(leadsRoute, /checkPropertyVisitSlot\(tx/);
  assert.match(leadsRoute, /visitTime < Date\.now\(\) \+ 30 \* 60 \* 1000/);
  assert.match(dedupeRoute, /planLeadVisitMerge\(canonical, duplicate\)/);
  assert.match(dedupeRoute, /withSqlTransaction\(async \(tx\)/);
  assert.match(dedupeRoute, /MERGE_LEADS_WITH_ACTIVITY_SQL/);
  assert.match(dedupeRoute, /\[canonicalId, duplicateId, \[canonicalId, duplicateId\]\]/);
  assert.match(dedupeSql, /id = any\(\$3::text\[\]\)/);
  assert.match(dedupeSql, /visit_status = case when visit_status in \('requested','confirmed'\) then 'cancelled'/);
  assert.doesNotMatch(leadsRoute, /\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.doesNotMatch(assignmentRoute, /\.catch\(\(\)\s*=>\s*\{\}\)/);
});
