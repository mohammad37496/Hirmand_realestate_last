import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ADMIN_MEDIA_ORPHAN_UPLOADS_SQL,
  ADMIN_MEDIA_REFERENCED_IDS_SQL,
  staleLegacySessionPredicate,
  stalePropertySessionPredicate,
} from "./admin-media-reference-sql.ts";

test("media cleanup retains gallery, floor-plan, and trashed-property media", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        images jsonb not null default '[]'::jsonb,
        floor_plan_url text not null default '',
        deleted_at timestamptz
      );
      create table media_objects (id text primary key, pathname text not null);
      insert into media_objects (id, pathname) values
        ('gallery', 'properties/uploads/gallery/gallery.webp'),
        ('floorplan', 'properties/uploads/floor-plans/plan.webp'),
        ('trashed', 'properties/uploads/gallery/trashed.webp'),
        ('orphan', 'properties/uploads/gallery/orphan.webp'),
        ('divar', 'properties/divar/imported.webp');
      insert into properties (id, images, floor_plan_url) values
        ('active-gallery', '["/api/media/gallery"]'::jsonb, ''),
        ('active-floorplan', '[]'::jsonb, 'https://media.example.test/api/media/floorplan');
      insert into properties (id, images, floor_plan_url, deleted_at) values
        ('trashed-property', '["/api/media/trashed"]'::jsonb, '', current_timestamp);
    `);

    const refs = await db.query<{ id: string }>(ADMIN_MEDIA_REFERENCED_IDS_SQL);
    assert.deepEqual(new Set(refs.rows.map((row) => row.id)), new Set(["gallery", "floorplan", "trashed"]));

    const deleted = await db.query<{ id: string }>(
      `delete from media_objects m where m.id in (${ADMIN_MEDIA_ORPHAN_UPLOADS_SQL}) returning m.id`,
    );
    assert.deepEqual(deleted.rows.map((row) => row.id), ["orphan"]);
    const retained = await db.query<{ id: string }>("select id from media_objects order by id");
    assert.deepEqual(retained.rows.map((row) => row.id), ["divar", "floorplan", "gallery", "trashed"]);
  } finally {
    await db.close();
  }
});

test("stale upload cleanup covers both pipelines and protects active finalization", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table media_upload_sessions (id text primary key, created_at timestamptz not null);
      create table media_upload_chunks (session_id text not null, chunk_index int not null);
      create table property_media_upload_sessions (
        id text primary key,
        created_at timestamptz not null,
        state text not null,
        completion_started_at timestamptz
      );
      create table property_media_upload_chunks (upload_id text not null, chunk_index int not null);
      insert into media_upload_sessions values
        ('legacy-stale', current_timestamp - interval '3 hours'),
        ('legacy-fresh', current_timestamp - interval '10 minutes');
      insert into media_upload_chunks values ('legacy-stale', 0), ('legacy-fresh', 0);
      insert into property_media_upload_sessions values
        ('property-stale', current_timestamp - interval '3 hours', 'pending', null),
        ('property-finished-late', current_timestamp - interval '3 hours', 'completing', current_timestamp - interval '30 minutes'),
        ('property-completing', current_timestamp - interval '3 hours', 'completing', current_timestamp - interval '5 minutes'),
        ('property-fresh', current_timestamp - interval '10 minutes', 'pending', null);
      insert into property_media_upload_chunks values
        ('property-stale', 0), ('property-finished-late', 0), ('property-completing', 0), ('property-fresh', 0);
    `);

    const legacy = await db.query<{ id: string }>(
      `select id from media_upload_sessions where ${staleLegacySessionPredicate()} order by id`,
      ["120"],
    );
    assert.deepEqual(legacy.rows.map((row) => row.id), ["legacy-stale"]);

    const property = await db.query<{ id: string }>(
      `select id from property_media_upload_sessions where ${stalePropertySessionPredicate()} order by id`,
      ["120"],
    );
    assert.deepEqual(property.rows.map((row) => row.id), ["property-finished-late", "property-stale"]);

    const protectedCompletion = await db.query<{ count: number }>(
      "select count(*)::int as count from property_media_upload_sessions where id='property-completing'",
    );
    assert.equal(Number(protectedCompletion.rows[0]?.count), 1);
  } finally {
    await db.close();
  }
});
