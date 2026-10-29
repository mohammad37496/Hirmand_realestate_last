import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const route = readFileSync(join(root, "server/routes/api/admin-property-expiry.post.ts"), "utf8");
const migration = readFileSync(join(root, "migrations/0104_admin_expiry_task_dedupe.sql"), "utf8");

test("expiry renewal task creation uses the database uniqueness guard and counts only inserted rows", async () => {
  assert.match(route, /on conflict \(entity_type,entity_id\)[\s\S]*do nothing returning id/);
  assert.match(route, /if\(!inserted\.length\)continue/);
  assert.match(route, /createdTasks\+\+;/);

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
        ('old','تمدید فایل: خانه','open','property','property-1','2026-01-01T00:00:00Z'),
        ('new','تمدید فایل: خانه (جدید)','open','property','property-1','2026-01-02T00:00:00Z');
    `);
    await db.exec(migration);

    const retained = await db.query("select id from admin_tasks where status='open' and entity_type='property' and entity_id='property-1' and title like 'تمدید فایل:%'");
    assert.deepEqual(retained.rows.map((row) => row.id), ["new"]);

    const insert = (id) => db.query(
      `insert into admin_tasks(id,title,status,entity_type,entity_id)
       values($1,'تمدید فایل: خانه','open','property','property-2')
       on conflict (entity_type,entity_id)
         where status='open' and entity_type='property' and title like 'تمدید فایل:%'
       do nothing returning id`,
      [id],
    );
    const results = await Promise.all([insert("candidate-a"), insert("candidate-b")]);
    assert.equal(results.reduce((sum, result) => sum + result.rows.length, 0), 1);
    const created = await db.query("select count(*)::int as count from admin_tasks where status='open' and entity_type='property' and entity_id='property-2' and title like 'تمدید فایل:%'");
    assert.equal(Number(created.rows[0].count), 1);
  } finally {
    await db.close();
  }
});
