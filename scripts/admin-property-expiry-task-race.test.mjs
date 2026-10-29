import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const route = readFileSync(join(root, "server/routes/api/admin-property-expiry.post.ts"), "utf8");
const migration = readFileSync(join(root, "migrations/0104_admin_expiry_task_dedupe.sql"), "utf8");

test("expiry renewal task creation is safe against concurrent duplicate inserts", () => {
  assert.match(migration, /delete from admin_tasks older[\s\S]*older\.entity_id = newer\.entity_id/);
  assert.match(migration, /create unique index if not exists admin_tasks_one_open_property_renewal_idx/);
  assert.match(migration, /where status = 'open'[\s\S]*entity_type = 'property'[\s\S]*title like 'تمدید فایل:%'/);
  assert.match(route, /on conflict \(entity_type,entity_id\)[\s\S]*do nothing returning id/);
  assert.match(route, /if\(!inserted\.length\)continue/);
  assert.match(route, /createdTasks\+\+;/);
});
