import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ADMIN_MEDIA_ORPHAN_UPLOADS_SQL,
  ADMIN_MEDIA_REFERENCED_IDS_SQL,
  staleLegacySessionPredicate,
  stalePropertySessionPredicate,
} from "./admin-media-reference-sql.ts";

test("media cleanup candidate detection covers every persisted owner and trashed properties", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        images jsonb not null default '[]'::jsonb,
        floor_plan_url text not null default '',
        virtual_tour_url text not null default '',
        deleted_at timestamptz
      );
      create table media_objects (id text primary key, pathname text not null);
      create table music_tracks (url text);
      create table customer_property_submissions (property_data jsonb);
      create table admin_deal_documents (file_url text);
      create table property_video_renditions (source_url text, renditions jsonb);
      create table property_media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, state text not null default 'completed');
      create table media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, completion_state text not null default 'completed');
      create table area_contents (hero_image text, gallery jsonb);
      insert into media_objects (id, pathname) values
        ('gallery', 'properties/uploads/gallery/gallery.webp'),
        ('floorplan', 'properties/uploads/floor-plans/plan.webp'),
        ('virtual-tour', 'properties/uploads/tours/tour.mp4'),
        ('music', 'properties/uploads/music/music.mp3'),
        ('submission', 'properties/uploads/submissions/submission.webp'),
        ('deal-doc', 'properties/uploads/deals/contract.pdf'),
        ('video-source', 'properties/uploads/video/source.mp4'),
        ('video-rendition', 'properties/uploads/video/720.mp4'),
        ('property-receipt', 'properties/uploads/staging/property.webp'),
        ('legacy-receipt', 'properties/uploads/staging/legacy.webp'),
        ('area-hero', 'properties/uploads/areas/hero.webp'),
        ('area-gallery', 'properties/uploads/areas/gallery.webp'),
        ('trashed', 'properties/uploads/gallery/trashed.webp'),
        ('orphan', 'properties/uploads/gallery/orphan.webp'),
        ('divar', 'properties/divar/imported.webp');
      insert into properties (id, images, floor_plan_url) values
        ('active-gallery', '["/api/media/gallery"]'::jsonb, ''),
        ('active-floorplan', '[]'::jsonb, 'https://media.example.test/api/media/floorplan');
      update properties set virtual_tour_url='/api/media/virtual-tour' where id='active-gallery';
      insert into properties (id, images, floor_plan_url, deleted_at) values
        ('trashed-property', '["/api/media/trashed"]'::jsonb, '', current_timestamp);
      insert into music_tracks values('/api/media/music');
      insert into customer_property_submissions values(jsonb_build_object('images',jsonb_build_array('/api/media/submission')));
      insert into admin_deal_documents values('/api/media/deal-doc');
      insert into property_video_renditions values('/api/media/video-source',jsonb_build_object('720p','/api/media/video-rendition'));
      insert into property_media_upload_sessions(stored_url,state) values('/api/media/property-receipt','completing');
      insert into media_upload_sessions(stored_url,completion_state) values('/api/media/legacy-receipt','assembled');
      insert into area_contents values('/api/media/area-hero',jsonb_build_array('/api/media/area-gallery'));
    `);

    const refs = await db.query<{ id: string }>(ADMIN_MEDIA_REFERENCED_IDS_SQL);
    assert.deepEqual(new Set(refs.rows.map((row) => row.id)), new Set([
      "gallery", "floorplan", "virtual-tour", "music", "submission", "deal-doc",
      "video-source", "video-rendition", "property-receipt", "legacy-receipt",
      "area-hero", "area-gallery", "trashed",
    ]));

    const candidates = await db.query<{ id: string }>(
      `select m.id from media_objects m where m.id in (${ADMIN_MEDIA_ORPHAN_UPLOADS_SQL}) order by m.id`,
    );
    assert.deepEqual(candidates.rows.map((row) => row.id), ["orphan"]);
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

test("admin media health distinguishes unavailable storage and refuses no-op cleanup", () => {
  const server = readFileSync(new URL("./admin-media-health.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-media-health.tsx", import.meta.url), "utf8");
  const healthPermission = server.indexOf('await requireAdminPermission("property.manage")');
  const healthUnavailable = server.indexOf('if (dbSource === "unconfigured")');
  const cleanupPermission = server.indexOf('await requireAdminPermission("backup.manage")');
  const cleanupUnavailable = server.lastIndexOf('if (dbSource === "unconfigured")');

  assert.ok(healthPermission >= 0 && healthUnavailable > healthPermission);
  assert.ok(cleanupPermission >= 0 && cleanupUnavailable > cleanupPermission);
  assert.match(server, /available:\s*false/);
  assert.match(server, /available:\s*true/);
  assert.match(server, /if \(dbSource === "unconfigured"\)\s*\{\s*throw new Error/);
  assert.match(server, /enqueueMediaCleanupJob\(tx, `\/api\/media\/\$\{encodeURIComponent\(row\.id\)\}`\)/);
  assert.match(server, /processMediaCleanupJobs\(queued\.orphanJobIds, sql\)/);
  assert.ok(server.indexOf("lockMediaReferenceWrites(tx)") < server.indexOf("delete from media_upload_chunks"));

  const areaContent = readFileSync(new URL("./area-content.ts", import.meta.url), "utf8");
  assert.match(areaContent, /select hero_image,gallery from area_contents where slug=\$1 for update/);
  assert.match(areaContent, /enqueueMediaCleanupJob\(tx, url\)/);
  assert.match(areaContent, /processMediaCleanupJobs\(jobIds, sql\)/);
  assert.doesNotMatch(server, /delete from media_objects m where m\.id in/);
  assert.doesNotMatch(server, /orphanDeleted:\s*0,\s*staleSessionsDeleted:\s*0/);
  assert.match(ui, /result\.available !== true/);
  assert.match(ui, /<AdminErrorBanner/);
  assert.match(ui, /!data/);
  assert.match(ui, /result\.orphanRetained \+ result\.staleMediaRetained/);
});
