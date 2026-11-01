import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  hasMediaUrlReferences,
  mediaReferenceNeedles,
  removeOrphanedVideoRenditionManifest,
} from "./media-reference-guard.server.ts";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table properties (images jsonb, floor_plan_url text, virtual_tour_url text);
    create table music_tracks (url text);
    create table customer_property_submissions (property_data jsonb);
    create table admin_deal_documents (file_url text);
    create table property_video_renditions (source_url text primary key, renditions jsonb, created_at timestamptz not null default current_timestamp);
    create table property_media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, state text not null default 'completed');
    create table media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, completion_state text not null default 'completed');
    create table area_contents (hero_image text, gallery jsonb);
  `);
  await db.exec(readFileSync(new URL("../../migrations/0110_media_cleanup_outbox_and_reference_lock.sql", import.meta.url), "utf8"));
  return db;
}

function sqlFor(db: PGlite) {
  return {
    query: async <T = Record<string, unknown>>(statement: string, params: unknown[] = []) =>
      (await db.query(statement, params)).rows as T[],
  };
}

test("media reference guard protects every persisted owner and upload receipt", async () => {
  const db = await fixture();
  const sql = sqlFor(db);
  const url = "https://media.example/shared/photo.webp";
  try {
    const scenarios: Array<() => Promise<unknown>> = [
      () => db.query("insert into properties(images) values(jsonb_build_array($1::text))", [url]),
      () => db.query("insert into properties(floor_plan_url) values($1)", [url]),
      () => db.query("insert into properties(virtual_tour_url) values($1)", [url]),
      () => db.query("insert into music_tracks(url) values($1)", [url]),
      () => db.query("insert into customer_property_submissions(property_data) values(jsonb_build_object('property',jsonb_build_object('images',jsonb_build_array($1::text))))", [url]),
      () => db.query("insert into admin_deal_documents(file_url) values($1)", [url]),
      () => db.query("insert into property_video_renditions(source_url) values($1)", [url]),
      () => db.query("insert into property_video_renditions(source_url,renditions) values('https://media.example/manifest.mp4',jsonb_build_object('mp4',$1::text))", [url]),
      () => db.query("insert into property_media_upload_sessions(stored_url) values($1)", [url]),
      () => db.query("insert into property_media_upload_sessions(completion_result) values(jsonb_build_object('url',$1::text))", [url]),
      () => db.query("insert into media_upload_sessions(stored_url) values($1)", [url]),
      () => db.query("insert into media_upload_sessions(completion_result) values(jsonb_build_object('track',jsonb_build_object('url',$1::text)))", [url]),
      () => db.query("insert into area_contents(hero_image) values($1)", [url]),
      () => db.query("insert into area_contents(gallery) values(jsonb_build_array($1::text))", [url]),
    ];
    for (const insert of scenarios) {
      await db.exec(`
        truncate properties, music_tracks, customer_property_submissions, admin_deal_documents,
          property_video_renditions, property_media_upload_sessions, media_upload_sessions, area_contents;
      `);
      await insert();
      assert.equal(await hasMediaUrlReferences(sql, url), true);
    }
  } finally {
    await db.close();
  }
});

test("database media query variants resolve to the same stored media id", async () => {
  const db = await fixture();
  try {
    await db.query("insert into properties(images) values(jsonb_build_array('/api/media/media-123'))");
    assert.equal(
      await hasMediaUrlReferences(sqlFor(db), "https://hirmandrealestate.ir/api/media/media-123?type=video"),
      true,
    );
  } finally {
    await db.close();
  }
});

test("Liara raw URLs and browser proxy URLs resolve through the same object key", async () => {
  const db = await fixture();
  try {
    const rawUrl = "https://liara.example/private-bucket/properties/uploads/hero.webp";
    const proxyUrl = "/api/liara-media?url=" + encodeURIComponent(rawUrl);
    await db.query("insert into properties(images) values(jsonb_build_array($1::text))", [proxyUrl]);
    assert.ok(mediaReferenceNeedles(rawUrl, "properties/uploads/hero.webp").includes("properties%2Fuploads%2Fhero.webp"));
    assert.equal(await hasMediaUrlReferences(sqlFor(db), rawUrl, "properties/uploads/hero.webp"), true);
  } finally {
    await db.close();
  }
});

test("unreferenced media can be deleted and Blob URLs tolerate changing query tokens", async () => {
  const db = await fixture();
  try {
    const sql = sqlFor(db);
    const blobUrl = "https://abc.blob.vercel-storage.com/property/photo.webp?token=old";
    await db.query("insert into properties(images) values(jsonb_build_array($1::text))", ["https://abc.blob.vercel-storage.com/property/photo.webp?token=new"]);
    assert.equal(await hasMediaUrlReferences(sql, blobUrl), true);
    await db.exec("truncate properties, music_tracks, customer_property_submissions, admin_deal_documents, property_video_renditions, property_media_upload_sessions, media_upload_sessions, area_contents");
    assert.equal(await hasMediaUrlReferences(sql, blobUrl), false);
  } finally {
    await db.close();
  }
});

test("failed upload sessions do not keep rejected objects alive", async () => {
  const db = await fixture();
  try {
    const url = "https://media.example/rejected.webp";
    await db.query("insert into property_media_upload_sessions(stored_url,state) values($1,'failed')", [url]);
    await db.query("insert into media_upload_sessions(stored_url,completion_state) values($1,'failed')", [url]);
    assert.equal(await hasMediaUrlReferences(sqlFor(db), url), false);
  } finally {
    await db.close();
  }
});

test("stored database media ids in active upload receipts are protected", async () => {
  const db = await fixture();
  try {
    await db.query("insert into property_media_upload_sessions(stored_media_id,state) values('media-123','completing')");
    assert.equal(await hasMediaUrlReferences(sqlFor(db), "/api/media/media-123"), true);
    await db.exec("truncate property_media_upload_sessions");
    await db.query("insert into media_upload_sessions(stored_media_id,completion_state) values('media-123','assembled')");
    assert.equal(await hasMediaUrlReferences(sqlFor(db), "/api/media/media-123"), true);
  } finally {
    await db.close();
  }
});

test("orphaned video manifests are removed and return rendition URLs for guarded cleanup", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/source.mp4";
    const renditionUrl = "https://media.example/video/720.mp4";
    await db.query(
      "insert into property_video_renditions(source_url,renditions) values($1,jsonb_build_object('720p',$2::text))",
      [sourceUrl, renditionUrl],
    );
    const removed = await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl);
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.renditionUrls, [renditionUrl]);
    assert.equal((await db.query("select source_url from property_video_renditions")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("synchronous video manifest cleanup ignores its own highest-quality source entry", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/highest.mp4";
    const lowerUrl = "https://media.example/video/720.mp4";
    await db.query(
      "insert into property_video_renditions(source_url,renditions) values($1,jsonb_build_object('1080p',$1::text,'720p',$2::text))",
      [sourceUrl, lowerUrl],
    );
    const result = await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl);
    assert.equal(result.removed, true);
    assert.deepEqual(new Set(result.renditionUrls), new Set([sourceUrl, lowerUrl]));
  } finally {
    await db.close();
  }
});

test("video manifests stay when the source or rendition is still referenced elsewhere", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/source.mp4";
    await db.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [sourceUrl]);
    await db.query("insert into properties(images) values(jsonb_build_array($1::text))", [sourceUrl]);
    assert.equal((await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl)).removed, false);
    await db.exec("truncate properties, property_video_renditions");
    await db.query(
      "insert into property_video_renditions(source_url,renditions) values('https://media.example/video/other.mp4',jsonb_build_object('source',$1::text))",
      [sourceUrl],
    );
    await db.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [sourceUrl]);
    assert.equal((await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl)).removed, false);
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("video manifests remain while the background rendition encoder is processing", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/processing.mp4";
    await db.query(
      "insert into property_video_renditions(source_url,renditions) values($1,jsonb_build_object('processing',true))",
      [sourceUrl],
    );
    const result = await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl);
    assert.equal(result.removed, false);
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("an old processing manifest is retained because age does not prove its encoder stopped", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/stale-processing.mp4";
    const renditionUrl = "https://media.example/video/stale-720.mp4";
    await db.query(
      "insert into property_video_renditions(source_url,renditions,created_at) values($1,jsonb_build_object('720p',$2::text,'processing',true),current_timestamp - interval '2 hours')",
      [sourceUrl, renditionUrl],
    );
    const result = await removeOrphanedVideoRenditionManifest(sqlFor(db), sourceUrl);
    assert.equal(result.removed, false);
    assert.deepEqual(result.renditionUrls, []);
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("a completed cleanup tombstone rejects a racing video rendition writer", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/deleted.mp4";
    await db.query(
      "insert into media_cleanup_jobs(media_url,reference_tokens,status) values($1,array[$1]::text[],'completed')",
      [sourceUrl],
    );
    await assert.rejects(
      db.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [sourceUrl]),
      (error: unknown) => (error as { code?: string }).code === "23503",
    );
  } finally {
    await db.close();
  }
});

test("the media-reference advisory lock serializes a concurrent video writer behind deletion", async () => {
  const db = await fixture();
  let releaseDelete!: () => void;
  let signalLocked!: () => void;
  const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
  const hold = new Promise<void>((resolve) => { releaseDelete = resolve; });
  try {
    const sourceUrl = "https://media.example/video/race.mp4";
    const deleting = db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(74120261101::bigint)");
      signalLocked();
      await hold;
      await tx.query(
        "insert into media_cleanup_jobs(media_url,reference_tokens,status) values($1,array[$1]::text[],'completed')",
        [sourceUrl],
      );
    });
    await locked;
    const writing = db.transaction(async (tx) => tx.query(
      "insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [sourceUrl],
    ));
    releaseDelete();
    await deleting;
    await assert.rejects(writing, (error: unknown) => (error as { code?: string }).code === "23503");
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 0);
  } finally {
    releaseDelete();
    await db.close();
  }
});

test("cleanup job insertion and manifest removal roll back together", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://media.example/video/rollback.mp4";
    await db.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [sourceUrl]);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(74120261101::bigint)");
      await tx.query("insert into media_cleanup_jobs(media_url,reference_tokens) values($1,array[$1]::text[])", [sourceUrl]);
      await tx.query("delete from property_video_renditions where source_url=$1", [sourceUrl]);
      throw new Error("simulate transaction abort");
    }), /simulate transaction abort/);
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 1);
    assert.equal((await db.query("select id from media_cleanup_jobs where media_url=$1", [sourceUrl])).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("rejected property uploads clear their failed receipt before deleting the staged object", () => {
  const source = readFileSync(new URL("./property-media-upload.server.ts", import.meta.url), "utf8");
  assert.match(source, /state = 'failed', stored_url = null, stored_storage = null, stored_media_id = null/);
  assert.match(source, /for \(const row of expiredSessions\) \{\s*const url = row\.stored_url \|\| \(row\.stored_media_id \? `\/api\/media\/\$\{encodeURIComponent\(row\.stored_media_id\)\}` : null\);\s*if \(url\) await enqueueMediaCleanupJob\(tx, url\);/);
  assert.match(source, /await retryPendingMediaCleanupJobs\(\)/);

  const mediaStore = readFileSync(new URL("./media-store.server.ts", import.meta.url), "utf8");
  assert.match(mediaStore, /prepareMediaCleanupJobInTransaction\(tx, jobId, async \(renditionUrl\)/);
  assert.match(mediaStore, /status in \('pending','deleting'\) and next_attempt_at <= current_timestamp/);

  const chunkedUpload = readFileSync(new URL("./chunked-upload.server.ts", import.meta.url), "utf8");
  const rejectionStart = chunkedUpload.indexOf("if (isSignatureRejection(error))");
  const sessionDelete = chunkedUpload.indexOf("delete from media_upload_sessions", rejectionStart);
  const cleanupEnqueue = chunkedUpload.indexOf("enqueueMediaCleanupJob(tx, stored.url)", rejectionStart);
  assert.ok(rejectionStart >= 0 && sessionDelete >= 0 && cleanupEnqueue > sessionDelete);
  const properties = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  assert.match(properties, /enqueueMediaCleanupJob\(tx, url\)/);
});

test("property media replacement queues removed images and floor assets under the shared writer lock", () => {
  const properties = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const save = properties.slice(properties.indexOf("export const saveProperty"), properties.indexOf("export const listPropertyChangeHistory"));
  assert.match(save, /lockMediaReferenceWrites\(tx\)/);
  assert.match(save, /select images,floor_plan_url,virtual_tour_url from properties where id=\$1 and deleted_at is null for update/);
  assert.match(save, /enqueueMediaCleanupJob\(tx, url\)/);
  assert.match(save, /processMediaCleanupJobs\(mediaCleanupJobIds, sql\)/);
});
