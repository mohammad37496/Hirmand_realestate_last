import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const route = await readFile(new URL("../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0105_admin_lead_overdue_task_dedupe.sql", import.meta.url), "utf8");
const overdueTitlePrefix = "\u067e\u06cc\u06af\u06cc\u0631\u06cc \u0641\u0648\u0631\u06cc \u0644\u06cc\u062f:";

test("overdue lead task creation uses a unique conflict-safe insert and propagates database errors", () => {
  const start = route.indexOf('if (body.action === "create_overdue_tasks")');
  const end = route.indexOf("if (!body.id)", start);
  const action = route.slice(start, end);
  assert.match(action, /on conflict \(entity_type,entity_id,dedupe_key\).*do nothing returning id/);
  assert.match(action, /dedupe_key='overdue_follow_up'/);
  assert.doesNotMatch(action, /\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.match(migration, /create unique index if not exists admin_tasks_one_open_lead_overdue_followup_idx/);
  assert.match(migration, /set status = 'cancelled'/);
});

test("migration preserves the newest legacy task and concurrent overdue scans create one open task per lead", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_tasks (id text primary key, title text not null, status text not null, entity_type text not null, entity_id text, created_at timestamptz not null default current_timestamp, updated_at timestamptz not null default current_timestamp);
    `);
    await db.query("insert into admin_tasks (id,title,status,entity_type,entity_id,created_at) values ($1,$2,'open','lead','lead-legacy','2026-01-01'),($3,$4,'open','lead','lead-legacy','2026-01-02')", ["legacy-old", overdueTitlePrefix+" old", "legacy-new", overdueTitlePrefix+" new"]);
    await db.exec(migration);
    const legacy = await db.query("select id,status,dedupe_key from admin_tasks where entity_id='lead-legacy' order by id");
    assert.deepEqual(legacy.rows, [
      { id: "legacy-new", status: "open", dedupe_key: "overdue_follow_up" },
      { id: "legacy-old", status: "cancelled", dedupe_key: "overdue_follow_up" },
    ]);
    const insertOverdue = (id, leadId) => db.query(
      "insert into admin_tasks(id,title,status,entity_type,entity_id,dedupe_key) values($1,$2,'open','lead',$3,'overdue_follow_up') on conflict (entity_type,entity_id,dedupe_key) where status='open' and dedupe_key='overdue_follow_up' do nothing returning id",
      [id, overdueTitlePrefix+" auto", leadId],
    );
    const results = await Promise.all([insertOverdue("task-a","lead-1"),insertOverdue("task-b","lead-1")]);
    assert.equal(results.reduce((count,result)=>count+result.rows.length,0),1);
    await db.query("insert into admin_tasks(id,title,status,entity_type,entity_id) values('other-task','Schedule visit','open','lead','lead-1')");
    const open = await db.query("select id from admin_tasks where entity_type='lead' and entity_id='lead-1' and status='open'");
    assert.equal(open.rows.length,2);
  } finally { await db.close(); }
});
