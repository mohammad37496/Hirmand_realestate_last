import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  adminMediaCleanupOrphanCountSql,
  adminMediaCleanupOrphanDeleteSql,
  adminMediaReferencedCountSql,
} from "./admin-media-cleanup-sql.ts";

test("media cleanup preserves soft-deleted property images and all floor plans", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table media_objects (
        id text primary key,
        pathname text not null,
        created_at timestamptz not null default current_timestamp
      );
      create table properties (
        id text primary key,
        images jsonb not null default '[]'::jsonb,
        floor_plan_url text not null default '',
        deleted_at timestamptz
      );
      create table media_upload_sessions (
        id text primary key,
        pathname text not null,
        kind text not null,
        stored_url text,
        stored_media_id text,
        created_at timestamptz not null default current_timestamp
      );

      insert into media_objects (id, pathname, created_at) values
        ('soft-image', 'properties/uploads/soft-image.jpg', current_timestamp - interval '3 hours'),
        ('soft-floor', 'properties/uploads/soft-floor.jpg', current_timestamp - interval '3 hours'),
        ('active-floor', 'properties/uploads/active-floor.jpg', current_timestamp - interval '3 hours'),
        ('active-session-path', 'properties/uploads/active-session-path.jpg', current_timestamp - interval '3 hours'),
        ('active-session-id', 'properties/uploads/active-session-id.jpg', current_timestamp - interval '3 hours'),
        ('active-session-url', 'properties/uploads/active-session-url.jpg', current_timestamp - interval '3 hours'),
        ('recent-orphan', 'properties/uploads/recent-orphan.jpg', current_timestamp),
        ('stale-orphan', 'properties/uploads/stale-orphan.jpg', current_timestamp - interval '3 hours'),
        ('music-object', 'music/track.mp3', current_timestamp - interval '3 hours');

      insert into properties (id, images, floor_plan_url, deleted_at) values
        ('soft-deleted-property', '["/api/media/soft-image?type=video"]', '/api/media/soft-floor#preview', current_timestamp),
        ('active-property', '[]', 'https://hirmandrealestate.ir/api/media/active-floor?download=1', null);

      insert into media_upload_sessions (id, pathname, kind, created_at) values
        ('session-path', 'properties/uploads/active-session-path.jpg', 'media', current_timestamp),
        ('session-id', 'properties/uploads/original-name.jpg', 'media', current_timestamp);
      update media_upload_sessions set stored_media_id = 'active-session-id' where id = 'session-id';
      insert into media_upload_sessions (id, pathname, kind, stored_url, created_at)
        values ('session-url', 'properties/uploads/another-name.jpg', 'media', '/api/media/active-session-url?type=video', current_timestamp);
    `);

    const referenced = await db.query<{ count: number }>(adminMediaReferencedCountSql);
    assert.equal(referenced.rows[0]?.count, 3);

    const candidates = await db.query<{ count: number }>(adminMediaCleanupOrphanCountSql, ["120"]);
    assert.equal(candidates.rows[0]?.count, 1);

    const deleted = await db.query<{ id: string }>(adminMediaCleanupOrphanDeleteSql, ["120"]);
    assert.deepEqual(deleted.rows.map((row) => row.id), ["stale-orphan"]);

    const remaining = await db.query<{ id: string }>(
      "select id from media_objects order by id",
    );
    assert.deepEqual(
      remaining.rows.map((row) => row.id),
      [
        "active-floor",
        "active-session-id",
        "active-session-path",
        "active-session-url",
        "music-object",
        "recent-orphan",
        "soft-floor",
        "soft-image",
      ],
    );
  } finally {
    await db.close();
  }
});

test("admin media health scan and cleanup use the same safe candidate SQL", async () => {
  const source = await readFile(new URL("./admin-media-health.ts", import.meta.url), "utf8");
  assert.match(source, /adminMediaCleanupOrphanCountSql/);
  assert.match(source, /adminMediaCleanupOrphanDeleteSql/);
  assert.match(source, /adminMediaReferencedCountSql/);
});
