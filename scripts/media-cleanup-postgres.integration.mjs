import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { hasMediaUrlReferences } from "../src/lib/media-reference-guard.server.ts";
import { assertMediaObjectWritable, deletePreparedMediaCleanupJobInTransaction, lockMediaObjectIdentity, lockMediaReferenceWrites, prepareMediaCleanupJobInTransaction, upsertMediaCleanupJob } from "../src/lib/media-cleanup-transaction.server.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("skip media cleanup PostgreSQL integration: DATABASE_URL is not configured (CI runs this suite against PostgreSQL 16).");
  process.exit(0);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 5_000 });
const schema = `qa_media_${randomUUID().replaceAll("-", "")}`;
const clients = [];
let schemaCreated = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectInSchema() {
  const client = await pool.connect();
  clients.push(client);
  await client.query(`set search_path to ${schema}`);
  await client.query("set statement_timeout = '15s'");
  return client;
}

function sqlFor(client) {
  return { query: async (statement, params = []) => (await client.query(statement, params)).rows };
}

async function createFixture(admin) {
  await admin.query(`create schema ${schema}`);
  schemaCreated = true;
  await admin.query(`set search_path to ${schema}`);
  await admin.query("set statement_timeout = '15s'");
  await admin.query(`
    create table properties (
      id text primary key, images jsonb not null default '[]'::jsonb,
      floor_plan_url text not null default '', virtual_tour_url text not null default ''
    );
    create table music_tracks (id text primary key, url text not null);
    create table customer_property_submissions (id text primary key, property_data jsonb not null default '{}'::jsonb);
    create table admin_deal_documents (id text primary key, file_url text not null default '');
    create table property_video_renditions (
      source_url text primary key, renditions jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    );
    create table property_media_upload_sessions (
      id text primary key, stored_url text, stored_media_id text,
      completion_result jsonb, state text not null default 'completed'
    );
    create table media_upload_sessions (
      id text primary key, stored_url text, stored_media_id text,
      completion_result jsonb, completion_state text not null default 'completed'
    );
    create table area_contents (slug text primary key, hero_image text not null default '', gallery jsonb not null default '[]'::jsonb);
    create table media_objects (id text primary key, data bytea not null);
  `);
  const migration = await readFile(new URL("../migrations/0110_media_cleanup_outbox_and_reference_lock.sql", import.meta.url), "utf8");
  await admin.query(migration);
  await admin.query(migration);
}

try {
  const admin = await pool.connect();
  clients.push(admin);
  await createFixture(admin);

  // Writer wins the lock first: cleanup must wait and then observe the newly
  // committed manifest rather than deleting its source object.
  const writer = await connectInSchema();
  const deleter = await connectInSchema();
  await writer.query("begin");
  const firstUrl = "https://media.example/video/writer-first.mp4";
  await writer.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [firstUrl]);
  let deletionLockAcquired = false;
  const deletion = (async () => {
    await deleter.query("begin");
    await lockMediaReferenceWrites(sqlFor(deleter));
    deletionLockAcquired = true;
    const referenced = await hasMediaUrlReferences(sqlFor(deleter), firstUrl);
    await deleter.query("rollback");
    return referenced;
  })();
  await pause(100);
  assert.equal(deletionLockAcquired, false, "cleanup must wait while the writer owns the shared advisory lock");
  await writer.query("commit");
  assert.equal(await deletion, true, "cleanup must see the writer's committed manifest");
  console.log("ok   PostgreSQL advisory lock makes cleanup observe a concurrent video manifest writer");

  // Cleanup commits a deleting tombstone before object-store I/O. A later
  // writer must wait for the lock, then reject the URL even during the gap
  // between external DELETE and marking the job completed.
  const secondUrl = "https://media.example/video/deleter-first.mp4";
  await deleter.query("begin");
  const [externalJob] = (await deleter.query(
    "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,array[$1]::text[]) returning id",
    [secondUrl, "video/deleter-first.mp4"],
  )).rows;
  const preparedExternal = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), externalJob.id);
  assert.equal(preparedExternal.status, "deleting");
  let writerSettled = false;
  const lateWriter = writer.query(
    "insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [secondUrl],
  ).finally(() => { writerSettled = true; });
  await pause(100);
  assert.equal(writerSettled, false, "writer must wait while the deleter holds the shared transaction lock");
  await deleter.query("commit");
  await assert.rejects(lateWriter, (error) => error.code === "23503");
  assert.equal((await admin.query("select source_url from property_video_renditions where source_url=$1", [secondUrl])).rows.length, 0);
  console.log("ok   PostgreSQL deleting tombstone blocks video URL resurrection before external deletion");

  // A storage writer that acquired the per-object lock first may finish its
  // external PUT, but cleanup must wait; once cleanup commits deleting, later
  // owner writes are rejected by the durable tombstone.
  const serialUrl = "liara://objects/serial-upload.mp4";
  await writer.query("begin");
  await lockMediaObjectIdentity(sqlFor(writer), serialUrl);
  await assertMediaObjectWritable(sqlFor(writer), serialUrl, "objects/serial-upload.mp4");
  const [serialJob] = (await admin.query(
    "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,array[$2]::text[]) returning id",
    [serialUrl, "objects/serial-upload.mp4"],
  )).rows;
  let serialCleanupFinished = false;
  const serialCleanup = (async () => {
    await deleter.query("begin");
    const result = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), serialJob.id);
    await deleter.query("commit");
    serialCleanupFinished = true;
    return result;
  })();
  await pause(100);
  assert.equal(serialCleanupFinished, false, "cleanup must wait for an in-flight storage PUT on the same object identity");
  await writer.query("commit");
  assert.equal((await serialCleanup).status, "deleting");
  await assert.rejects(
    writer.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [serialUrl]),
    (error) => error.code === "23503",
  );
  console.log("ok   PostgreSQL per-object upload lock serializes storage writers against cleanup");

  // Database-backed object deletion and its outbox status commit atomically.
  await admin.query("insert into media_objects(id,data) values('media-db-1',decode('0102','hex'))");
  const [dbJob] = (await admin.query(
    "insert into media_cleanup_jobs(media_url,reference_tokens) values('/api/media/media-db-1',array['/api/media/media-db-1']::text[]) returning id",
  )).rows;
  await deleter.query("begin");
  const dbResult = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), dbJob.id);
  assert.equal(dbResult.status, "completed");
  await deleter.query("commit");
  assert.equal((await admin.query("select id from media_objects where id='media-db-1'")).rows.length, 0);
  assert.equal((await admin.query("select status from media_cleanup_jobs where id=$1", [dbJob.id])).rows[0]?.status, "completed");
  console.log("ok   PostgreSQL database media deletion commits with its durable cleanup job");

  const sourceUrl = "https://storage.example.test/media/objects/manifest-source.mp4";
  const renditionUrl = "https://storage.example.test/media/objects/manifest-low.mp4";
  await admin.query(
    "insert into property_video_renditions(source_url,renditions) values($1,$2::jsonb)",
    [sourceUrl, JSON.stringify({ processing: false, variants: { low: renditionUrl } })],
  );
  const [manifestJob] = (await admin.query(
    "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,$3) returning id",
    ["liara://media/objects/manifest-source.mp4", "media/objects/manifest-source.mp4", ["media/objects/manifest-source.mp4", sourceUrl]],
  )).rows;
  await deleter.query("begin");
  const manifestResult = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), manifestJob.id, async (url) => {
    await upsertMediaCleanupJob(sqlFor(deleter), { mediaUrl: url, liaraKey: null, referenceTokens: [url] });
  });
  await deleter.query("commit");
  assert.equal(manifestResult.status, "deleting");
  assert.equal((await admin.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 0);
  assert.equal((await admin.query("select id from media_cleanup_jobs where media_url=$1", [renditionUrl])).rows.length, 1);
  console.log("ok   PostgreSQL source cleanup removes orphan manifest and queues every rendition in one transaction");

  // External deletion is retried from a durable deleting tombstone after a crash.
  const externalUrl = "liara://properties/uploads/retry.mp4";
  const [retryJob] = (await admin.query(
    "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,array[$2]::text[]) returning id",
    [externalUrl, "properties/uploads/retry.mp4"],
  )).rows;
  await deleter.query("begin");
  const firstAttempt = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), retryJob.id);
  assert.equal(firstAttempt.status, "deleting");
  await deleter.query("commit");
  let objectExists = true;
  let externalDeleteCount = 0;
  await deleter.query("begin");
  await assert.rejects(
    deletePreparedMediaCleanupJobInTransaction(sqlFor(deleter), retryJob.id, async () => {
      externalDeleteCount += 1;
      objectExists = false;
      throw new Error("simulated worker crash after Liara DELETE");
    }),
    /simulated worker crash after Liara DELETE/,
  );
  await deleter.query("rollback");
  assert.equal(objectExists, false);
  await admin.query("update media_cleanup_jobs set attempts=attempts+1,last_error='simulated worker crash after Liara DELETE' where id=$1", [retryJob.id]);
  assert.equal((await admin.query("select status from media_cleanup_jobs where id=$1", [retryJob.id])).rows[0]?.status, "deleting");
  await deleter.query("begin");
  const retryResult = await deletePreparedMediaCleanupJobInTransaction(sqlFor(deleter), retryJob.id, async () => {
    externalDeleteCount += 1;
    objectExists = false;
  });
  await deleter.query("commit");
  assert.equal(retryResult, "completed");
  assert.equal(externalDeleteCount, 2);
  assert.equal((await admin.query("select status from media_cleanup_jobs where id=$1", [retryJob.id])).rows[0]?.status, "completed");
  console.log("ok   PostgreSQL external deletion remains retryable without reopening reference writes");

  const [concurrentJob] = (await admin.query(
    "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,array[$2]::text[]) returning id",
    ["liara://properties/uploads/concurrent.mp4", "properties/uploads/concurrent.mp4"],
  )).rows;
  await deleter.query("begin");
  const concurrentPrepared = await prepareMediaCleanupJobInTransaction(sqlFor(deleter), concurrentJob.id);
  assert.equal(concurrentPrepared.status, "deleting");
  await deleter.query("commit");
  let concurrentDeleteCount = 0;
  const workerOne = (async () => {
    await deleter.query("begin");
    const result = await deletePreparedMediaCleanupJobInTransaction(sqlFor(deleter), concurrentJob.id, async () => {
      concurrentDeleteCount += 1;
      await pause(150);
    });
    await deleter.query("commit");
    return result;
  })();
  await pause(20);
  const workerTwo = (async () => {
    await writer.query("begin");
    const result = await deletePreparedMediaCleanupJobInTransaction(sqlFor(writer), concurrentJob.id, async () => {
      concurrentDeleteCount += 1;
    });
    await writer.query("commit");
    return result;
  })();
  assert.deepEqual(await Promise.all([workerOne, workerTwo]), ["completed", "completed"]);
  assert.equal(concurrentDeleteCount, 1, "the job row lock must allow only one external DELETE attempt at a time");
  console.log("ok   PostgreSQL job-row lock serializes concurrent external cleanup workers");

  writer.release();
  deleter.release();
  clients.splice(clients.indexOf(writer), 1);
  clients.splice(clients.indexOf(deleter), 1);
} finally {
  for (const client of clients) client.release();
  if (schemaCreated) await pool.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await pool.end();
}
