import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  assertMediaCleanupDatabaseConfigured,
  assertMediaObjectWritable,
  deletePreparedMediaCleanupJobInTransaction,
  lockMediaObjectIdentity,
  prepareMediaCleanupJobInTransaction,
  upsertMediaCleanupJob,
} from "./media-cleanup-transaction.server.ts";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table properties (images jsonb, floor_plan_url text, virtual_tour_url text);
    create table music_tracks (url text);
    create table customer_property_submissions (property_data jsonb);
    create table admin_deal_documents (file_url text);
    create table property_video_renditions (source_url text primary key, renditions jsonb);
    create table property_media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, state text not null default 'completed');
    create table media_upload_sessions (stored_url text, stored_media_id text, completion_result jsonb, completion_state text not null default 'completed');
    create table area_contents (hero_image text, gallery jsonb);
    create table media_objects (id text primary key, data bytea not null);
  `);
  const migration = readFileSync(new URL("../../migrations/0110_media_cleanup_outbox_and_reference_lock.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration);
  return db;
}

type TransactionClient = {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

function transactionSql(tx: TransactionClient) {
  return { query: async <T = Record<string, unknown>>(statement: string, params: unknown[] = []) => (await tx.query<T>(statement, params)).rows };
}

test("unconfigured database explicitly refuses media cleanup", () => {
  assert.throws(() => assertMediaCleanupDatabaseConfigured("unconfigured"), /database is unavailable/);
  assert.doesNotThrow(() => assertMediaCleanupDatabaseConfigured("postgres"));
  assert.doesNotThrow(() => assertMediaCleanupDatabaseConfigured("pglite"));
});

test("media storage writers cannot recreate objects with any durable cleanup identity", async () => {
  const db = await fixture();
  try {
    for (const status of ["pending", "retained", "deleting", "completed"] as const) {
      const url = `liara://properties/uploads/${status}.mp4`;
      await db.query(
        "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens,status) values($1,$2,$3,$4)",
        [url, `properties/uploads/${status}.mp4`, [`properties/uploads/${status}.mp4`], status],
      );
      await assert.rejects(
        db.transaction((tx: TransactionClient) => (async () => {
          await lockMediaObjectIdentity(transactionSql(tx), url);
          await assertMediaObjectWritable(transactionSql(tx), url, `properties/uploads/${status}.mp4`);
        })()),
        /protected by cleanup job/,
      );
    }
  } finally {
    await db.close();
  }
});

test("cleanup job aliases share one durable identity and completed tombstones stay completed", async () => {
  const db = await fixture();
  try {
    const mediaUrl = "liara://properties/uploads/shared.mp4";
    const first = await upsertMediaCleanupJob(transactionSql(db), {
      mediaUrl,
      liaraKey: "properties/uploads/shared.mp4",
      referenceTokens: ["https://storage.example/bucket/properties/uploads/shared.mp4"],
    });
    const second = await upsertMediaCleanupJob(transactionSql(db), {
      mediaUrl,
      liaraKey: "properties/uploads/shared.mp4",
      referenceTokens: ["/api/liara-media?url=https%3A%2F%2Fstorage.example%2Fbucket%2Fproperties%2Fuploads%2Fshared.mp4"],
    });
    assert.equal(first[0]?.id, second[0]?.id);
    assert.equal((await db.query("select id from media_cleanup_jobs where media_url=$1", [mediaUrl])).rows.length, 1);
    const [job] = (await db.query<{ id: number }>("select id from media_cleanup_jobs where media_url=$1", [mediaUrl])).rows;
    await db.query("update media_cleanup_jobs set status='completed' where id=$1", [job.id]);
    const repeated = await upsertMediaCleanupJob(transactionSql(db), {
      mediaUrl,
      liaraKey: "properties/uploads/shared.mp4",
      referenceTokens: ["another-alias"],
    });
    assert.equal(repeated[0]?.id, job.id);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [job.id])).rows[0]?.status, "completed");
    const tokens = (await db.query<{ reference_tokens: string[] }>("select reference_tokens from media_cleanup_jobs where id=$1", [job.id])).rows[0]?.reference_tokens ?? [];
    assert.ok(tokens.includes("another-alias"));
    await db.query("insert into media_cleanup_jobs(media_url,liara_key,reference_tokens,status) values('liara://deleting-object','deleting-object',array['deleting-object']::text[],'deleting')");
    const [deletingJob] = (await db.query<{ id: number }>("select id from media_cleanup_jobs where media_url='liara://deleting-object'")).rows;
    await upsertMediaCleanupJob(transactionSql(db), {
      mediaUrl: "liara://deleting-object",
      liaraKey: "deleting-object",
      referenceTokens: ["new-alias"],
    });
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [deletingJob.id])).rows[0]?.status, "deleting");
  } finally {
    await db.close();
  }
});

test("all media-owning tables reject references to a completed cleanup tombstone", async () => {
  const db = await fixture();
  try {
    const url = "/api/media/deleted-everywhere";
    await db.query("insert into media_cleanup_jobs(media_url,reference_tokens,status) values($1,array[$1]::text[],'completed')", [url]);
    const writers = [
      () => db.query("insert into properties(images) values(jsonb_build_array($1::text))", [url]),
      () => db.query("insert into properties(floor_plan_url) values($1)", [url]),
      () => db.query("insert into properties(virtual_tour_url) values($1)", [url]),
      () => db.query("insert into music_tracks(url) values($1)", [url]),
      () => db.query("insert into customer_property_submissions(property_data) values(jsonb_build_object('media',$1::text))", [url]),
      () => db.query("insert into admin_deal_documents(file_url) values($1)", [url]),
      () => db.query("insert into property_video_renditions(source_url,renditions) values($1,'{}'::jsonb)", [url]),
      () => db.query("insert into property_video_renditions(source_url,renditions) values('https://media.example/source.mp4',jsonb_build_object('720p',$1::text))", [url]),
      () => db.query("insert into property_media_upload_sessions(stored_url) values($1)", [url]),
      () => db.query("insert into media_upload_sessions(stored_url) values($1)", [url]),
      () => db.query("insert into area_contents(hero_image) values($1)", [url]),
      () => db.query("insert into area_contents(gallery) values(jsonb_build_array($1::text))", [url]),
    ];
    for (const write of writers) {
      await assert.rejects(write(), (error: unknown) => (error as { code?: string }).code === "23503");
    }
    await db.query("insert into media_cleanup_jobs(media_url,reference_tokens,status) values('https://media.example/deleting.mp4',array['https://media.example/deleting.mp4']::text[],'deleting')");
    await assert.rejects(
      db.query("insert into properties(images) values(jsonb_build_array('https://media.example/deleting.mp4'))"),
      (error: unknown) => (error as { code?: string }).code === "23503",
    );
  } finally {
    await db.close();
  }
});

test("a shared object is retained and its durable cleanup job is marked retained", async () => {
  const db = await fixture();
  try {
    const url = "/api/media/shared-1";
    await db.query("insert into media_objects(id,data) values('shared-1',decode('0102','hex'))");
    await db.query("insert into properties(images) values(jsonb_build_array($1::text))", [url]);
    await db.query("insert into media_cleanup_jobs(media_url,reference_tokens) values($1,array[$1]::text[])", [url]);
    const [job] = (await db.query("select id from media_cleanup_jobs where media_url=$1", [url])).rows as Array<{ id: number }>;
    const result = await db.transaction((tx) => prepareMediaCleanupJobInTransaction(transactionSql(tx), job.id));
    assert.equal(result.status, "retained");
    assert.equal((await db.query("select id from media_objects where id='shared-1'")).rows.length, 1);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [job.id])).rows[0]?.status, "retained");
    await db.query("delete from properties");
    await db.query("update media_cleanup_jobs set next_attempt_at=current_timestamp - interval '1 second' where id=$1", [job.id]);
    const retried = await db.transaction((tx) => prepareMediaCleanupJobInTransaction(transactionSql(tx), job.id));
    assert.equal(retried.status, "completed");
    assert.equal((await db.query("select id from media_objects where id='shared-1'")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("an orphaned database object is physically deleted in the same transaction as job completion", async () => {
  const db = await fixture();
  try {
    const url = "/api/media/orphan-1";
    await db.query("insert into media_objects(id,data) values('orphan-1',decode('0102','hex'))");
    await db.query("insert into media_cleanup_jobs(media_url,reference_tokens) values($1,array[$1]::text[])", [url]);
    const [job] = (await db.query("select id from media_cleanup_jobs where media_url=$1", [url])).rows as Array<{ id: number }>;
    const result = await db.transaction((tx) => prepareMediaCleanupJobInTransaction(transactionSql(tx), job.id));
    assert.equal(result.status, "completed");
    assert.equal((await db.query("select id from media_objects where id='orphan-1'")).rows.length, 0);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [job.id])).rows[0]?.status, "completed");
  } finally {
    await db.close();
  }
});

test("source cleanup removes an orphaned video manifest and durably queues every rendition", async () => {
  const db = await fixture();
  try {
    const sourceUrl = "https://storage.example.test/media/objects/video.mp4";
    const renditionUrl = "https://storage.example.test/media/objects/video-low.mp4";
    const [sourceJob] = (await db.query<{ id: number }>(
      "insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,$3) returning id",
      ["liara://media/objects/video.mp4", "media/objects/video.mp4", ["media/objects/video.mp4", sourceUrl]],
    )).rows;
    await db.query(
      "insert into property_video_renditions(source_url,renditions) values($1,$2::jsonb)",
      [sourceUrl, JSON.stringify({ processing: false, variants: { low: renditionUrl } })],
    );

    const result = await db.transaction((tx: TransactionClient) => prepareMediaCleanupJobInTransaction(
      transactionSql(tx),
      sourceJob.id,
      async (url) => {
        await upsertMediaCleanupJob(transactionSql(tx), {
          mediaUrl: url,
          liaraKey: null,
          referenceTokens: [url],
        });
      },
    ));
    assert.equal(result.status, "deleting");
    assert.equal((await db.query("select source_url from property_video_renditions where source_url=$1", [sourceUrl])).rows.length, 0);
    assert.equal((await db.query("select id from media_cleanup_jobs where media_url=$1", [renditionUrl])).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("external cleanup commits a tombstone before deletion and survives crash/retry", async () => {
  const db = await fixture();
  try {
    const firstUrl = "https://liara.example/bucket/properties/video/480.mp4";
    const secondUrl = "https://liara.example/bucket/properties/video/720.mp4";
    await db.query("insert into media_cleanup_jobs(media_url,liara_key,reference_tokens) values($1,$2,array[$1]::text[]),($3,$4,array[$3]::text[])", [firstUrl, "properties/video/480.mp4", secondUrl, "properties/video/720.mp4"]);
    const [secondJob] = (await db.query<{ id: number }>("select id from media_cleanup_jobs where media_url=$1", [secondUrl])).rows;
    const prepared = await db.transaction((tx) => prepareMediaCleanupJobInTransaction(transactionSql(tx), secondJob.id));
    assert.equal(prepared.status, "deleting");
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [secondJob.id])).rows[0]?.status, "deleting");
    await assert.rejects(
      db.query("insert into properties(images) values(jsonb_build_array($1::text))", [secondUrl]),
      (error: unknown) => (error as { code?: string }).code === "23503",
    );
    // The external DELETE succeeds, then the worker crashes before the DB
    // transaction commits. The job-row transaction rolls back to deleting;
    // the retry repeats DELETE idempotently and then commits completion.
    let objectExists = true;
    let externalDeleteCount = 0;
    await assert.rejects(
      db.transaction((tx) => deletePreparedMediaCleanupJobInTransaction(transactionSql(tx), secondJob.id, async () => {
        externalDeleteCount += 1;
        objectExists = false;
        throw new Error("simulated crash after remote DELETE");
      })),
      /simulated crash after remote DELETE/,
    );
    assert.equal(objectExists, false);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [secondJob.id])).rows[0]?.status, "deleting");
    const retried = await db.transaction((tx) => deletePreparedMediaCleanupJobInTransaction(transactionSql(tx), secondJob.id, async () => {
      externalDeleteCount += 1;
      objectExists = false; // already-missing object is a successful idempotent delete
    }));
    assert.equal(retried, "completed");
    assert.equal(externalDeleteCount, 2);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [secondJob.id])).rows[0]?.status, "completed");
  } finally {
    await db.close();
  }
});

test("a reference-query database error fails closed and rolls back the cleanup job", async () => {
  const db = await fixture();
  try {
    const url = "/api/media/db-error-1";
    await db.query("insert into media_objects(id,data) values('db-error-1',decode('0102','hex'))");
    await db.query("insert into media_cleanup_jobs(media_url,reference_tokens) values($1,array[$1]::text[])", [url]);
    const [job] = (await db.query("select id from media_cleanup_jobs where media_url=$1", [url])).rows as Array<{ id: number }>;
    await assert.rejects(db.transaction(async (tx) => {
      const brokenSql = {
        query: async <T = Record<string, unknown>>(statement: string, params: unknown[] = []) => {
          if (statement.includes("with needles as")) throw new Error("simulated database read failure");
          return (await tx.query<T>(statement, params)).rows;
        },
      };
      return prepareMediaCleanupJobInTransaction(brokenSql, job.id);
    }), /simulated database read failure/);
    assert.equal((await db.query("select id from media_objects where id='db-error-1'")).rows.length, 1);
    assert.equal((await db.query<{ status: string }>("select status from media_cleanup_jobs where id=$1", [job.id])).rows[0]?.status, "pending");
  } finally {
    await db.close();
  }
});
