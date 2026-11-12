import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, helper] = await Promise.all([
  readFile(new URL("../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/admin-overdue-lead-tasks.ts", import.meta.url), "utf8"),
]);

test("overdue lead task generation requires a transaction and propagates task lookup errors", () => {
  assert.match(route, /createOverdueLeadTasks\(sql\)/);
  assert.match(route, /typeof sql\.transaction !== "function"[\s\S]*?statusCode:\s*503/);
  assert.doesNotMatch(route, /select id from admin_tasks[\s\S]*?\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.match(helper, /sql\.transaction\(/);
  assert.match(helper, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(helper, /select id from admin_tasks where entity_type='lead'/);
  assert.match(helper, /returning id/);
});
