import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const route = readFileSync(join(root, "server/routes/api/admin-property-lifecycle.post.ts"), "utf8");
const migration = readFileSync(join(root, "migrations/0103_admin_lifecycle_task_dedupe.sql"), "utf8");

test("property lifecycle refresh task uniqueness survives competing inserts", async () => {
  assert.match(route, /on conflict \(entity_type, entity_id\)[\s\S]*do nothing[\s\S]*returning id/);
  assert.match(route, /if \(inserted\.length > 0\) createdTasks \+= 1/);

  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_tasks (
        id text primary key,
        title text not null,
        status text not null,
        entity_type text not null,
        entity_id text,
        created_at timestamptz not null default current_timestamp
      );
      insert into admin_tasks (id,title,status,entity_type,entity_id,created_at) values
        ('older','تازه‌سازی فایل: خانه','open','property','property-1','2026-01-01T00:00:00Z'),
        ('newer','تازه‌سازی فایل: خانه (جدید)','open','property','property-1','2026-01-02T00:00:00Z');
    `);
    await db.exec(migration);

    const retained = await db.query("select id from admin_tasks where status='open' and entity_type='property' and entity_id='property-1' and title like 'تازه‌سازی فایل:%'");
    assert.deepEqual(retained.rows.map((row) => row.id), ["newer"]);

    const insert = (id) => db.query(
      `insert into admin_tasks(id,title,status,entity_type,entity_id)
       values($1,'تازه‌سازی فایل: خانه','open','property','property-2')
       on conflict (entity_type, entity_id)
         where status='open' and entity_type='property' and title like 'تازه‌سازی فایل:%'
       do nothing returning id`,
      [id],
    );
    const results = await Promise.all([insert("candidate-a"), insert("candidate-b")]);
    assert.equal(results.reduce((sum, result) => sum + result.rows.length, 0), 1);
    const created = await db.query("select count(*)::int as count from admin_tasks where status='open' and entity_type='property' and entity_id='property-2' and title like 'تازه‌سازی فایل:%'");
    assert.equal(Number(created.rows[0].count), 1);
  } finally {
    await db.close();
  }
});
