import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_MATCH_FEEDBACK_SQL, SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL } from "./admin-match-mutation-sql.ts";

async function createDb(rejectActivity = false) {
  const db = new PGlite();
  await db.exec(`
    create table leads (id text primary key, merged_into_lead_id text, matched_properties jsonb not null default '[]', match_count integer not null default 0, updated_at timestamptz);
    create table properties (id text primary key, title text not null, status text not null);
    create table lead_activities (id bigserial primary key, lead_id text not null references leads(id), activity_type text not null, title text not null, note text not null, metadata jsonb not null default '{}'::jsonb ${rejectActivity ? ", constraint reject_activity check (false)" : ""});
    insert into leads(id) values ('lead-1');
    insert into properties(id,title,status) values ('property-1','آپارتمان نمونه','published'),('property-hidden','فایل غیرمنتشر','draft');
  `);
  return db;
}

test("match snapshot and timeline activity commit together", async () => {
  const db = await createDb();
  try {
    const result = await db.query(SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL, ["lead-1", JSON.stringify([{ id: "property-1" }]), 1, "مچ فایل‌ها انجام شد", "یک فایل پیشنهاد شد", JSON.stringify({ mode: "smart", count: 1 })]);
    assert.equal(result.rows.length, 1);
    const lead = await db.query<{ match_count: number; matched_properties: Array<{ id: string }> }>("select match_count,matched_properties from leads where id='lead-1'");
    assert.equal(lead.rows[0]?.match_count, 1);
    assert.equal(lead.rows[0]?.matched_properties[0]?.id, "property-1");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from lead_activities")).rows[0]?.count, 1);
  } finally { await db.close(); }
});

test("failed timeline insert rolls back match snapshot", async () => {
  const db = await createDb(true);
  try {
    await assert.rejects(db.query(SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL, ["lead-1", JSON.stringify([{ id: "property-1" }]), 1, "مچ فایل‌ها انجام شد", "یک فایل پیشنهاد شد", JSON.stringify({ mode: "smart", count: 1 })]));
    const lead = await db.query<{ match_count: number; matched_properties: unknown }>("select match_count,matched_properties from leads where id='lead-1'");
    assert.equal(lead.rows[0]?.match_count, 0);
    assert.deepEqual(lead.rows[0]?.matched_properties, []);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from lead_activities")).rows[0]?.count, 0);
  } finally { await db.close(); }
});

test("feedback requires an existing lead and a published property", async () => {
  const db = await createDb();
  try {
    assert.equal((await db.query(INSERT_MATCH_FEEDBACK_SQL, ["lead-1", "property-1", "فایل برای مشتری ارسال شد", "نتیجه مچ ثبت شد.", "sent"])).rows.length, 1);
    assert.equal((await db.query(INSERT_MATCH_FEEDBACK_SQL, ["missing-lead", "property-1", "فایل برای مشتری ارسال شد", "نتیجه مچ ثبت شد.", "sent"])).rows.length, 0);
    assert.equal((await db.query(INSERT_MATCH_FEEDBACK_SQL, ["lead-1", "property-hidden", "فایل برای مشتری ارسال شد", "نتیجه مچ ثبت شد.", "sent"])).rows.length, 0);
    const activity = await db.query<{ metadata: Record<string, unknown> }>("select metadata from lead_activities");
    assert.deepEqual(activity.rows[0]?.metadata, { feedback: "sent", propertyId: "property-1", propertyTitle: "آپارتمان نمونه" });
  } finally { await db.close(); }
});

test("match and feedback mutations refuse to append activity to a merged duplicate", async () => {
  const db = await createDb();
  try {
    await db.exec("insert into leads(id,merged_into_lead_id) values('merged-lead','lead-1')");
    const match = await db.query(SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL, ["merged-lead", JSON.stringify([{ id: "property-1" }]), 1, "Match", "Merged", JSON.stringify({ mode: "smart" })]);
    assert.equal(match.rows.length, 0);
    const feedback = await db.query(INSERT_MATCH_FEEDBACK_SQL, ["merged-lead", "property-1", "Sent", "Feedback", "sent"]);
    assert.equal(feedback.rows.length, 0);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from lead_activities")).rows[0]?.count, 0);
  } finally { await db.close(); }
});

test("match route fails closed for unavailable storage and uses atomic SQL", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-match.post.ts", import.meta.url), "utf8");
  assert.match(route, /dbSource === "unconfigured"\)[\s\S]{0,180}statusCode: 503/);
  assert.match(route, /SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL/);
  assert.match(route, /INSERT_MATCH_FEEDBACK_SQL/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\{\}\)/);
});
