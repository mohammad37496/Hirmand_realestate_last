import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const protocol = fs.readFileSync(new URL("../src/lib/chunked-upload.server.ts", import.meta.url), "utf8");
const requirePattern = (pattern, message) => assert.ok(pattern.test(protocol), message);

test("chunk writes lock and revalidate the session kind, storage prefix, and pending state atomically", () => {
  requirePattern(/matchesUploadSessionScope\(session, config\.kind, config\.pathPrefix\)/, "chunk requests must validate the loaded session scope");
  requirePattern(/with scoped_session as \([\s\S]*?for update[\s\S]*?completion_state = 'pending'/, "chunk insertion must lock a pending, correctly scoped session row");
  requirePattern(/left\(pathname, length\(\$5\)\) = \$5/, "chunk insert must enforce the storage path prefix in SQL");
  requirePattern(/if \(!insertedChunks\[0\]\)/, "a chunk rejected by the atomic scope check must not report success");
});

test("begin, completion receipts, failure recovery, and abort remain scoped to the owning route", () => {
  requirePattern(/if \(existing && !matchesUploadSessionScope\(existing, config\.kind, config\.pathPrefix\)\)/, "stable upload IDs cannot be reused across routes");
  requirePattern(/left\(pathname, length\(\$3\)\) = \$3[\s\S]*?completion_result is not null/, "completion receipts must be route-scoped");
  requirePattern(/delete from media_upload_sessions where id = \$1 and kind = \$2 and left\(pathname, length\(\$3\)\) = \$3 and completion_state = 'pending'/, "abort must only delete pending sessions owned by this route");
  requirePattern(/readRawBody\(event, false\)/, "binary chunks must stay as bytes");
  requirePattern(/completion_result = \$2::jsonb/, "idempotent completion receipts must remain available for retry");
});

test("the actual chunk-insert SQL rejects cross-route and non-pending sessions", async () => {
  const match = protocol.match(/const insertedChunks = await sql\.query<\{ session_id: string \}>\(\s*`([\s\S]*?)`,\s*\[uploadIdHeader, index, bytes, config\.kind, uploadSessionScopePrefix\(config\.pathPrefix\)\]/);
  assert.ok(match, "extract the production chunk insert query instead of testing a copy");
  const insertChunkSql = match[1];
  const db = new PGlite();
  try {
    await db.exec(`
      create table media_upload_sessions (
        id text primary key, kind text not null, pathname text not null,
        completion_state text not null default 'pending'
      );
      create table media_upload_chunks (
        session_id text not null references media_upload_sessions(id),
        chunk_index integer not null, data bytea not null,
        primary key (session_id, chunk_index)
      );
      insert into media_upload_sessions (id, kind, pathname, completion_state) values
        ('music-ok', 'music', 'music/track.mp3', 'pending'),
        ('music-prefix-collision', 'music', 'music-archive/track.mp3', 'pending'),
        ('music-completing', 'music', 'music/other.mp3', 'completing'),
        ('property-ok', 'property', 'properties/uploads/image.webp', 'pending');
    `);

    const insert = (id, kind, prefix, index, data) => db.query(insertChunkSql, [id, index, data, kind, `${prefix.replace(/\/+$/, "")}/`]);
    const accepted = await insert("music-ok", "music", "music", 0, Buffer.from([1, 2, 3]));
    assert.deepEqual(accepted.rows, [{ session_id: "music-ok" }]);
    assert.deepEqual((await insert("music-prefix-collision", "music", "music", 0, Buffer.from([4]))).rows, []);
    assert.deepEqual((await insert("music-completing", "music", "music", 0, Buffer.from([5]))).rows, []);
    assert.deepEqual((await insert("property-ok", "music", "music", 0, Buffer.from([6]))).rows, []);
    assert.deepEqual((await db.query("select session_id from media_upload_chunks order by session_id")).rows, [{ session_id: "music-ok" }]);
  } finally {
    await db.close();
  }
});
