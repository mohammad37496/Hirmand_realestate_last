import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { hasMediaUrlReferences, mediaReferenceNeedles } from "./media-reference-guard.server.ts";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table properties (images jsonb, floor_plan_url text, virtual_tour_url text);
    create table music_tracks (url text);
    create table customer_property_submissions (property_data jsonb);
    create table admin_deal_documents (file_url text);
    create table property_video_renditions (source_url text, renditions jsonb);
    create table property_media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, state text not null default 'completed');
    create table media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, completion_state text not null default 'completed');
    create table area_contents (hero_image text, gallery jsonb);
  `);
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
      () => db.query("insert into property_video_renditions(renditions) values(jsonb_build_object('mp4',$1::text))", [url]),
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

test("rejected property uploads clear their failed receipt before deleting the staged object", () => {
  const source = readFileSync(new URL("./property-media-upload.server.ts", import.meta.url), "utf8");
  assert.match(source, /state = 'failed', stored_url = null, stored_storage = null, stored_media_id = null/);
  assert.match(source, /returning stored_url/);
  assert.match(source, /expiredSessions\.map\(\(row\) => deleteStoredMedia\(row\.stored_url\)\)/);

  const mediaStore = readFileSync(new URL("./media-store.server.ts", import.meta.url), "utf8");
  assert.match(mediaStore, /returning stored_url/);
  assert.match(mediaStore, /expired\.map\(\(row\) => deleteStoredMedia\(row\.stored_url\)\)/);

  const chunkedUpload = readFileSync(new URL("./chunked-upload.server.ts", import.meta.url), "utf8");
  const rejectionStart = chunkedUpload.indexOf("if (isSignatureRejection(error))");
  const sessionDelete = chunkedUpload.indexOf("delete from media_upload_sessions", rejectionStart);
  const objectDelete = chunkedUpload.indexOf("deleteStoredMedia(stored?.url)", rejectionStart);
  assert.ok(rejectionStart >= 0 && sessionDelete >= 0 && objectDelete > sessionDelete);
});
