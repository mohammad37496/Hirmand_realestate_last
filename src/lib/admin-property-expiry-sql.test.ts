import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ARCHIVE_EXPIRED_PROPERTIES_SQL,
  CREATE_PROPERTY_RENEWAL_TASK_SQL,
  EXTEND_PROPERTY_EXPIRY_SQL,
} from "./admin-property-expiry-sql.ts";

const route = readFileSync(
  new URL("../../server/routes/api/admin-property-expiry.post.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../migrations/0104_admin_expiry_task_dedupe.sql", import.meta.url),
  "utf8",
);

async function createDb({ rejectAction }: { rejectAction?: "archive" | "task" | "extend" } = {}) {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key,
      status text not null,
      deleted_at timestamptz,
      unpublish_at timestamptz,
      updated_at timestamptz,
      published_at timestamptz,
      featured boolean not null default false,
      featured_until timestamptz,
      created_at timestamptz not null default current_timestamp
    );
    create table admin_tasks (
      id text primary key,
      title text not null,
      description text not null,
      status text not null,
      priority text not null,
      due_at timestamptz,
      assignee text,
      entity_type text not null,
      entity_id text,
      created_at timestamptz not null default current_timestamp
    );
    create table admin_property_expiry_actions (
      id text primary key,
      property_id text not null,
      action text not null check (action in ('archive','extend','task')),
      details text not null default '',
      created_by text not null default '',
      created_at timestamptz not null default current_timestamp
    );
  `);
  await db.exec(migration);
  if (rejectAction) {
    await db.exec(`alter table admin_property_expiry_actions add constraint reject_test_action check (action <> '${rejectAction}')`);
  }
  return db;
}

test("expiry route uses atomic statements for every state change and its audit event", () => {
  assert.match(route, /sql\.query<\{property_id:string\}>\(ARCHIVE_EXPIRED_PROPERTIES_SQL/);
  assert.match(route, /sql\.query<\{property_id:string\}>\(CREATE_PROPERTY_RENEWAL_TASK_SQL/);
  assert.match(route, /sql\.query<\{property_id:string\}>\(EXTEND_PROPERTY_EXPIRY_SQL/);
  assert.doesNotMatch(route, /for\(const r of rows\)await sql\.query\("insert into admin_property_expiry_actions/);
});

test("expiry API marks an unconfigured database unavailable and rejects every mutation", () => {
  assert.match(route, /if\(dbSource==="unconfigured"\)\{[\s\S]*if\(action!=="list"\)throw createError\(\{statusCode:503/);
  assert.match(route, /return \{available:false,expired:\[\],soon:\[\],review:\[\]/);
  assert.match(route, /if\(action==="list"\)return \{available:true,/);
});

test("expiry panel validates availability and exposes retry instead of showing false zero counts", () => {
  const component = readFileSync(new URL("../components/hirmand/admin-property-expiry.tsx", import.meta.url), "utf8");
  assert.match(component, /typeof x\?\.available!=="boolean"/);
  assert.match(component, /if\(!data\?\.available\)return[\s\S]*AdminErrorBanner/);
  assert.match(component, /loadError&&!data[\s\S]*onRetry/);
});
test("archiving updates only active expired properties, clears featured flags, and logs exactly those updates", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      insert into properties (id,status,deleted_at,unpublish_at,featured,featured_until) values
        ('expired','published',null,current_timestamp-interval '1 day',true,current_timestamp+interval '5 days'),
        ('expired-old-featured','published',null,current_timestamp-interval '1 day',true,current_timestamp-interval '1 day'),
        ('trashed','published',current_timestamp,current_timestamp-interval '1 day',true,current_timestamp+interval '5 days'),
        ('future','published',null,current_timestamp+interval '1 day',true,current_timestamp+interval '5 days');
    `);
    const archived = await db.query<{ property_id: string }>(ARCHIVE_EXPIRED_PROPERTIES_SQL, ["مدیر"]);
    assert.deepEqual(archived.rows.map((row) => row.property_id).sort(), ["expired", "expired-old-featured"]);
    const rows = await db.query<{ id: string; status: string; featured: boolean; has_featured_until: boolean }>(
      "select id,status,featured,featured_until is not null as has_featured_until from properties order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "expired", status: "archived", featured: false, has_featured_until: false },
      { id: "expired-old-featured", status: "archived", featured: false, has_featured_until: false },
      { id: "future", status: "published", featured: true, has_featured_until: true },
      { id: "trashed", status: "published", featured: true, has_featured_until: true },
    ]);
    const events = await db.query<{ property_id: string }>("select property_id from admin_property_expiry_actions where action='archive'");
    assert.deepEqual(events.rows.map((row) => row.property_id).sort(), ["expired", "expired-old-featured"]);
    const staleFeatured = await db.query<{ count: number }>(
      "select count(*)::int as count from properties where status='archived' and featured=true",
    );
    assert.equal(staleFeatured.rows[0]?.count, 0, "archived listings must not remain in featured dashboard or action-center queries");
  } finally {
    await db.close();
  }
});

test("failed archive audit rolls back the property status change", async () => {
  const db = await createDb({ rejectAction: "archive" });
  try {
    await db.exec("insert into properties (id,status,unpublish_at,featured,featured_until) values ('expired','published',current_timestamp-interval '1 day',true,current_timestamp+interval '5 days')");
    await assert.rejects(db.query(ARCHIVE_EXPIRED_PROPERTIES_SQL, ["مدیر"]));
    const rows = await db.query<{ status: string; featured: boolean; has_featured_until: boolean }>(
      "select status,featured,featured_until is not null as has_featured_until from properties where id='expired'",
    );
    assert.deepEqual(rows.rows[0], { status: "published", featured: true, has_featured_until: true });
  } finally {
    await db.close();
  }
});

test("renewal task and audit event are atomic and concurrent inserts count once", async () => {
  const db = await createDb();
  try {
    await db.exec("insert into properties (id,status,unpublish_at) values ('property-1','published',current_timestamp+interval '3 days')");
    const insert = (taskId: string, eventId: string) => db.query<{ property_id: string }>(
      CREATE_PROPERTY_RENEWAL_TASK_SQL,
      [taskId, "تمدید فایل: خانه", "بررسی وضعیت فایل", "property-1", eventId, "مدیر"],
    );
    const results = await Promise.all([insert("task-a", "event-a"), insert("task-b", "event-b")]);
    assert.equal(results.reduce((count, result) => count + result.rows.length, 0), 1);
    const tasks = await db.query<{ id: string }>("select id from admin_tasks where entity_id='property-1'");
    const events = await db.query<{ property_id: string }>("select property_id from admin_property_expiry_actions where action='task'");
    assert.equal(tasks.rows.length, 1);
    assert.deepEqual(events.rows.map((row) => row.property_id), ["property-1"]);
  } finally {
    await db.close();
  }
});

test("failed renewal audit rolls back the task insert", async () => {
  const db = await createDb({ rejectAction: "task" });
  try {
    await db.exec("insert into properties (id,status,unpublish_at) values ('property-1','published',current_timestamp+interval '3 days')");
    await assert.rejects(db.query(CREATE_PROPERTY_RENEWAL_TASK_SQL, [
      "task-a", "تمدید فایل: خانه", "بررسی وضعیت فایل", "property-1", "event-a", "مدیر",
    ]));
    const tasks = await db.query<{ id: string }>("select id from admin_tasks where entity_id='property-1'");
    assert.equal(tasks.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("renewal task creation rechecks and locks the current property state", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      insert into properties (id,status,deleted_at,unpublish_at,created_at) values
        ('trashed','published',current_timestamp,current_timestamp+interval '3 days',current_timestamp-interval '120 days'),
        ('archived','archived',null,current_timestamp+interval '3 days',current_timestamp-interval '120 days'),
        ('expired','published',null,current_timestamp-interval '1 second',current_timestamp-interval '120 days'),
        ('stale-review','published',null,null,current_timestamp-interval '20 days'),
        ('eligible','published',null,current_timestamp+interval '3 days',current_timestamp-interval '10 days');
    `);
    const insert = (propertyId: string, index: number) => db.query<{ property_id: string }>(
      CREATE_PROPERTY_RENEWAL_TASK_SQL,
      [`task-${index}`, "تمدید فایل: خانه", "بررسی وضعیت فایل", propertyId, `event-${index}`, "مدیر"],
    );
    const results = await Promise.all([
      insert("trashed", 1),
      insert("archived", 2),
      insert("expired", 3),
      insert("stale-review", 4),
      insert("eligible", 5),
    ]);
    assert.deepEqual(results.map((result) => result.rows.length), [0, 0, 0, 0, 1]);
    const tasks = await db.query<{ entity_id: string }>("select entity_id from admin_tasks order by entity_id");
    const events = await db.query<{ property_id: string }>("select property_id from admin_property_expiry_actions where action='task'");
    assert.deepEqual(tasks.rows, [{ entity_id: "eligible" }]);
    assert.deepEqual(events.rows.map((row) => row.property_id), ["eligible"]);
  } finally {
    await db.close();
  }
});
test("property extension and audit event commit together", async () => {
  const db = await createDb();
  try {
    await db.exec("insert into properties (id,status,unpublish_at) values ('property-1','published',current_timestamp)");
    const result = await db.query<{ property_id: string }>(EXTEND_PROPERTY_EXPIRY_SQL, ["property-1", 30, "event-1", "مدیر"]);
    assert.deepEqual(result.rows.map((row) => row.property_id), ["property-1"]);
    const events = await db.query<{ action: string; details: string }>("select action,details from admin_property_expiry_actions where property_id='property-1'");
    assert.deepEqual(events.rows, [{ action: "extend", details: "تمدید 30 روزه" }]);
    const property = await db.query<{ unpublish_at: string }>("select unpublish_at::text as unpublish_at from properties where id='property-1'");
    assert.ok(Date.parse(property.rows[0]?.unpublish_at ?? "") > Date.now() + 29 * 86400000);
  } finally {
    await db.close();
  }
});

test("failed extension audit rolls back the expiry change", async () => {
  const db = await createDb({ rejectAction: "extend" });
  try {
    await db.exec("insert into properties (id,status,unpublish_at) values ('property-1','published','2026-11-01T00:00:00Z')");
    await assert.rejects(db.query(EXTEND_PROPERTY_EXPIRY_SQL, ["property-1", 30, "event-1", "مدیر"]));
    const property = await db.query<{ unpublish_at: string }>("select unpublish_at::text as unpublish_at from properties where id='property-1'");
    assert.equal(Date.parse(property.rows[0]?.unpublish_at ?? ""), Date.parse("2026-11-01T00:00:00Z"));
  } finally {
    await db.close();
  }
});
