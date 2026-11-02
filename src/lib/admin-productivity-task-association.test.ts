import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { LOCK_ACTIVE_PROPERTY_FOR_TASK_SQL, lockActivePropertyForTask } from "./admin-productivity-task-association.ts";

test("tasks link only to existing active leads or non-archived properties", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (id text primary key, name text not null, phone text not null, status text not null, created_at timestamptz default current_timestamp);
      create table properties (id text primary key, slug text, title text, neighborhood text, status text not null, deleted_at timestamptz);
      create table admin_tasks (id text primary key, title text not null, entity_type text not null, entity_id text);
      insert into leads(id,name,phone,status) values
        ('active-1','مشتری فعال','09120000000','follow_up'),
        ('closed-1','مشتری بسته','09121111111','closed'),
        ('spam-1','هرزنامه','09122222222','spam');
      insert into properties(id,title,neighborhood,status,deleted_at) values
        ('property-1','آپارتمان نمونه','مرداویج','published',null),
        ('property-deleted','فایل حذف‌شده','مرداویج','published',current_timestamp),
        ('property-archived','فایل بایگانی','مرداویج','archived',null);
    `);
    const taskSql = {
      query: async <T = Record<string, unknown>>(statement: string, params?: unknown[]) =>
        (await db.query<T>(statement, params)).rows,
    };
    const valid = await db.query("select id from leads where id=$1 limit 1", ["active-1"]);
    const missing = await db.query("select id from leads where id=$1 limit 1", ["not-found"]);
    assert.equal(valid.rows.length, 1);
    assert.equal(missing.rows.length, 0);
    const options = await db.query<{ id: string }>("select id from leads where status not in ('closed','spam') order by created_at desc limit 250");
    assert.deepEqual(options.rows.map((row) => row.id), ["active-1"]);
    const propertyOptions = await db.query<{ id: string }>("select id from properties where deleted_at is null and status <> 'archived' order by id desc limit 250");
    assert.deepEqual(propertyOptions.rows.map((row) => row.id), ["property-1"]);
    const inserted = await db.query(
      "insert into admin_tasks(id,title,entity_type,entity_id) select $1,$2,$3,$4 where ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning *",
      ["task-1", "تماس با مشتری", "lead", "active-1"],
    );
    const rejectedInsert = await db.query(
      "insert into admin_tasks(id,title,entity_type,entity_id) select $1,$2,$3,$4 where ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning *",
      ["task-missing", "تماس با مشتری", "lead", "not-found"],
    );
    assert.equal(inserted.rows.length, 1);
    assert.equal(rejectedInsert.rows.length, 0);
    const propertyInsert = await db.query(
      "insert into admin_tasks(id,title,entity_type,entity_id) select $1,$2,$3,$4 where ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning *",
      ["task-property", "بررسی فایل", "property", "property-1"],
    );
    const deletedPropertyInsert = await db.query(
      "insert into admin_tasks(id,title,entity_type,entity_id) select $1,$2,$3,$4 where ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning *",
      ["task-property-deleted", "بررسی فایل", "property", "property-deleted"],
    );
    assert.equal(propertyInsert.rows.length, 1);
    assert.equal(deletedPropertyInsert.rows.length, 0);
    assert.equal(await lockActivePropertyForTask(taskSql, "property-1"), true);
    assert.equal(await lockActivePropertyForTask(taskSql, "property-deleted"), false);
    await db.query("update properties set status='archived' where id='property-1'");
    assert.equal(await lockActivePropertyForTask(taskSql, "property-1"), false);
    const linked = await db.query<{ entity_id: string }>("select entity_id from admin_tasks where id='task-1'");
    assert.equal(linked.rows[0]?.entity_id, "active-1");
    await db.query("delete from leads where id='active-1'");
    const racedUpdate = await db.query(
      "update admin_tasks set title=$2 where id=$1 and ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning id",
      ["task-1", "تغییر هم‌زمان", "lead", "active-1"],
    );
    assert.equal(racedUpdate.rows.length, 0);
    await db.query("delete from properties where id='property-1'");
    const racedPropertyUpdate = await db.query(
      "update admin_tasks set title=$2 where id=$1 and ($3 <> 'lead' or exists(select 1 from leads where id=$4)) and ($3 <> 'property' or exists(select 1 from properties where id=$4 and deleted_at is null and status <> 'archived')) returning id",
      ["task-property", "تغییر هم‌زمان", "property", "property-1"],
    );
    assert.equal(racedPropertyUpdate.rows.length, 0);
  } finally { await db.close(); }
});

test("productivity API validates lead associations and task mutations fail on invalid input or races", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-productivity.post.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-productivity-center.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
  assert.match(route, /validateTaskEntityAssociation\(sql, entityType, entityId\)/);
  assert.match(route, /action === "list_leads"/);
  assert.match(route, /action === "list_properties"/);
  assert.match(route, /select id,slug,title,neighborhood,status from properties where deleted_at is null and status <> 'archived'/);
  assert.match(route, /lockLeadReferencesForMutation\(tx, \[entityId\]\)/);
  assert.match(route, /lockLeadReferencesForMutation\(tx, leadReferences\)/);
  const createTransaction = route.indexOf('if (action === "create_task")');
  const createLock = route.indexOf("lockActivePropertyForTask(tx, entityId)", createTransaction);
  const createInsert = route.indexOf("insert into admin_tasks", createLock);
  assert.ok(createLock > createTransaction && createInsert > createLock, "create must lock and recheck the property inside its transaction before inserting");
  const updateTransaction = route.indexOf('if (action === "update_task")');
  const updateLock = route.indexOf("lockActivePropertyForTask(tx, entityId)", updateTransaction);
  const updateWrite = route.indexOf("update admin_tasks set", updateLock);
  assert.ok(updateLock > updateTransaction && updateWrite > updateLock, "update must lock and recheck the property inside its transaction before writing");
  assert.match(LOCK_ACTIVE_PROPERTY_FOR_TASK_SQL, /deleted_at is null and status <> 'archived'[\s\S]*for update/i);
  assert.match(route, /merged_into_lead_id is null/);
  assert.match(route, /withSqlTransaction\(async \(tx\)/);
  assert.match(route, /body\.status !== undefined && !TASK_STATUSES\.includes/);
  assert.match(route, /body\.priority !== undefined && !PRIORITIES\.includes/);
  assert.match(route, /if \(!rows\[0\]\) throw createError\(\{ statusCode: 404, statusMessage: "وظیفه هنگام به‌روزرسانی/);
  assert.match(ui, /const \[entityType, entityId\] = relatedEntity \? relatedEntity\.split/);
  assert.match(ui, /مشاهده درخواست مشتری/);
  assert.match(admin, /onOpenLead=\{openLeadFromTask\}/);
  assert.match(admin, /focusLeadId=\{leadFocusId\}/);
  const matchRoute = readFileSync(new URL("../../server/routes/api/admin-match.post.ts", import.meta.url), "utf8");
  const matchUi = readFileSync(new URL("../components/hirmand/admin-matching-manager.tsx", import.meta.url), "utf8");
  assert.match(matchRoute, /where \$\{MATCHABLE_PROPERTY_SQL\}/);
  assert.match(matchRoute, /buildMatchWarnings/);
  assert.match(matchRoute, /normalizeMatchLabel/);
  assert.match(matchUi, /match\.warnings\?\.map/);
});
