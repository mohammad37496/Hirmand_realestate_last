import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ARCHIVE_EXPIRED_PROPERTIES_SQL,
  CREATE_PROPERTY_RENEWAL_TASK_SQL,
  EXTEND_PROPERTY_EXPIRY_SQL,
} from "./admin-property-expiry-sql.ts";
import {
  BULK_SET_PROPERTY_FEATURED_SQL,
  BULK_UPDATE_PROPERTY_STATUS_SQL,
  resolveFeaturedStateForPropertyStatus,
} from "./admin-property-status-featured.ts";

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

test("property extension refuses archived or trashed rows and does not write a false audit event", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      insert into properties (id,status,deleted_at,unpublish_at) values
        ('archived','archived',null,'2026-11-01T00:00:00Z'),
        ('trashed','published',current_timestamp,'2026-11-01T00:00:00Z');
    `);
    const archived = await db.query<{ property_id: string }>(EXTEND_PROPERTY_EXPIRY_SQL, ["archived", 30, "event-archived", "مدیر"]);
    const trashed = await db.query<{ property_id: string }>(EXTEND_PROPERTY_EXPIRY_SQL, ["trashed", 30, "event-trashed", "مدیر"]);
    assert.equal(archived.rows.length, 0, "an archived listing is no longer in the expiry center and must not report a successful extension");
    assert.equal(trashed.rows.length, 0, "a trashed listing must not be extended through a stale or direct request");
    const properties = await db.query<{ id: string; status: string; expiry_unchanged: boolean }>(
      "select id,status,unpublish_at='2026-11-01T00:00:00Z'::timestamptz as expiry_unchanged from properties order by id",
    );
    assert.deepEqual(properties.rows, [
      { id: "archived", status: "archived", expiry_unchanged: true },
      { id: "trashed", status: "published", expiry_unchanged: true },
    ]);
    const events = await db.query("select id from admin_property_expiry_actions where action='extend'");
    assert.equal(events.rows.length, 0, "rejected extensions must not create audit records");
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

test("archiving through the save path always clears featured state", () => {
  assert.deepEqual(
    resolveFeaturedStateForPropertyStatus("archived", true, "2026-12-01T00:00:00.000Z"),
    { featured: false, featuredUntil: null },
  );
  assert.deepEqual(resolveFeaturedStateForPropertyStatus("archived", false, null), {
    featured: false,
    featuredUntil: null,
  });
});

test("draft and published saves preserve an explicitly requested featured state", () => {
  const until = "2026-12-01T00:00:00.000Z";
  assert.deepEqual(resolveFeaturedStateForPropertyStatus("draft", true, until), {
    featured: true,
    featuredUntil: until,
  });
  assert.deepEqual(resolveFeaturedStateForPropertyStatus("published", true, until), {
    featured: true,
    featuredUntil: until,
  });
  assert.deepEqual(resolveFeaturedStateForPropertyStatus("published", false, until), {
    featured: false,
    featuredUntil: null,
  });
});

test("bulk archiving clears featured flags without changing other statuses", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key, title text not null, status text not null,
        publish_at timestamptz, unpublish_at timestamptz, published_at timestamptz,
        featured boolean not null default false, featured_until timestamptz,
        deleted_at timestamptz, updated_at timestamptz not null default current_timestamp,
        price numeric, deposit numeric, rent numeric, contact_name text, contact_phone text,
        owner_name text, owner_phone text, owner_info text
      );
      insert into properties (id,title,status,featured,featured_until,published_at) values
        ('archive-me','Archive me','published',true,'2026-12-01T00:00:00Z',current_timestamp),
        ('draft-me','Draft me','published',true,'2026-12-01T00:00:00Z',current_timestamp),
        ('trashed','Already trashed','archived',true,'2026-12-01T00:00:00Z',current_timestamp);
      update properties set deleted_at=current_timestamp where id='trashed';
    `);
    const archived = await db.query<{ id: string }>(BULK_UPDATE_PROPERTY_STATUS_SQL, ["archived", ["archive-me", "trashed"]]);
    assert.deepEqual(archived.rows.map((row) => row.id), ["archive-me"]);
    const rows = await db.query<{ id: string; status: string; featured: boolean; has_featured_until: boolean }>(
      "select id,status,featured,featured_until is not null as has_featured_until from properties order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "archive-me", status: "archived", featured: false, has_featured_until: false },
      { id: "draft-me", status: "published", featured: true, has_featured_until: true },
      { id: "trashed", status: "archived", featured: true, has_featured_until: true },
    ]);
  } finally {
    await db.close();
  }
});

test("bulk feature action cannot re-feature archived, draft, or trashed properties", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key, title text not null, status text not null,
        featured boolean not null default false, featured_until timestamptz,
        deleted_at timestamptz, updated_at timestamptz not null default current_timestamp,
        price numeric, deposit numeric, rent numeric, contact_name text, contact_phone text
      );
      insert into properties (id,title,status,featured,featured_until,deleted_at) values
        ('published','Published','published',false,null,null),
        ('draft','Draft','draft',false,null,null),
        ('archived','Archived','archived',false,null,null),
        ('trashed','Trashed','archived',false,null,current_timestamp);
    `);
    const featured = await db.query<{ id: string }>(BULK_SET_PROPERTY_FEATURED_SQL, [true, ["published", "draft", "archived", "trashed"]]);
    assert.deepEqual(featured.rows.map((row) => row.id), ["published"]);
    const rows = await db.query<{ id: string; featured: boolean }>("select id,featured from properties order by id");
    assert.deepEqual(rows.rows, [
      { id: "archived", featured: false },
      { id: "draft", featured: false },
      { id: "published", featured: true },
      { id: "trashed", featured: false },
    ]);

    const cleared = await db.query<{ id: string }>(BULK_SET_PROPERTY_FEATURED_SQL, [false, ["archived", "trashed"]]);
    assert.deepEqual(cleared.rows.map((row) => row.id).sort(), ["archived", "trashed"]);
  } finally {
    await db.close();
  }
});

test("the migration clears legacy featured flags from archived and trashed properties only", async () => {
  const db = new PGlite();
  try {
    const featuredMigration = readFileSync(
      new URL("../../migrations/0112_clear_archived_property_featured_flags.sql", import.meta.url),
      "utf8",
    );
    await db.exec(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        featured boolean not null default false, featured_until timestamptz
      );
      insert into properties (id,status,deleted_at,featured,featured_until) values
        ('archived','archived',null,true,'2026-12-01T00:00:00Z'),
        ('trashed','archived','2026-10-01T00:00:00Z',true,'2026-12-01T00:00:00Z'),
        ('published','published',null,true,'2026-12-01T00:00:00Z'),
        ('draft','draft',null,true,'2026-12-01T00:00:00Z');
    `);
    await db.exec(featuredMigration);
    const rows = await db.query<{ id: string; featured: boolean; has_featured_until: boolean }>(
      "select id,featured,featured_until is not null as has_featured_until from properties order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "archived", featured: false, has_featured_until: false },
      { id: "draft", featured: true, has_featured_until: true },
      { id: "published", featured: true, has_featured_until: true },
      { id: "trashed", featured: false, has_featured_until: false },
    ]);
  } finally {
    await db.close();
  }
});

test("property save, bulk status, and featured dashboard readers share the archive invariant", () => {
  const properties = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const actionCenter = readFileSync(new URL("../../server/routes/api/admin-action-center.post.ts", import.meta.url), "utf8");
  const productivity = readFileSync(new URL("../../server/routes/api/admin-productivity.post.ts", import.meta.url), "utf8");
  assert.match(properties, /resolveFeaturedStateForPropertyStatus\(\s*saveStatus,\s*data\.featured,\s*data\.featuredUntil,?\s*\)/);
  assert.match(properties, /featuredState\.featured,/);
  assert.match(properties, /BULK_UPDATE_PROPERTY_STATUS_SQL/);
  assert.match(properties, /BULK_SET_PROPERTY_FEATURED_SQL/);
  assert.match(properties, /changedBeforeRows = beforeRows\.filter/);
  assert.match(actionCenter, /where status='published' and deleted_at is null and featured=true and featured_until is not null/);
  assert.match(productivity, /status='published' and deleted_at is null and featured=true and featured_until is not null/);
});
