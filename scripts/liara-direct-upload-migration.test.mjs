import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";

test("Liara direct-upload session migration is idempotent and preserves chunked defaults", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create table media_upload_sessions (
        id text primary key,
        pathname text not null,
        content_type text not null,
        title text not null default '',
        artist text not null default '',
        total_chunks integer not null,
        created_at timestamptz not null default current_timestamp,
        completion_state text not null default 'pending',
        completion_result jsonb
      );
      insert into media_upload_sessions (id, pathname, content_type, total_chunks)
      values ('legacy-session', 'properties/legacy.jpg', 'image/jpeg', 1);
    `);
    const migration = await readFile(new URL("../migrations/0107_liara_direct_upload_sessions.sql", import.meta.url), "utf8");
    await database.exec(migration);
    await database.exec(migration);

    const columns = await database.query(`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_name = 'media_upload_sessions'
        and column_name in ('upload_mode', 'direct_upload_expires_at', 'object_key')
      order by column_name
    `);
    assert.deepEqual(columns.rows, [
      { column_name: "direct_upload_expires_at", column_default: null, is_nullable: "YES" },
      { column_name: "object_key", column_default: null, is_nullable: "YES" },
      { column_name: "upload_mode", column_default: "'chunked'::text", is_nullable: "NO" },
    ]);
    const legacy = await database.query("select upload_mode, object_key, direct_upload_expires_at from media_upload_sessions where id = 'legacy-session'");
    assert.deepEqual(legacy.rows[0], {
      upload_mode: "chunked",
      object_key: null,
      direct_upload_expires_at: null,
    });
    const index = await database.query("select indexname from pg_indexes where tablename = 'media_upload_sessions' and indexname = 'media_upload_sessions_direct_stale_idx'");
    assert.equal(index.rows.length, 1);

    await database.exec(`
      insert into media_upload_sessions
        (id, pathname, content_type, total_chunks, upload_mode, object_key, created_at, direct_upload_expires_at)
      values
        ('expired-session', 'properties/expired.jpg', 'image/jpeg', 1, 'direct', 'staging/properties/expired.jpg', current_timestamp - interval '3 hours', current_timestamp - interval '2 hours'),
        ('renewed-session', 'properties/renewed.jpg', 'image/jpeg', 1, 'direct', 'staging/properties/renewed.jpg', current_timestamp - interval '3 hours', current_timestamp + interval '15 minutes');
    `);
    const expired = await database.query(`
      update media_upload_sessions set completion_state = 'expired'
      where upload_mode = 'direct'
        and greatest(created_at, coalesce(direct_upload_expires_at, created_at))
          < current_timestamp - interval '120 minutes'
        and completion_state <> 'expired'
      returning id
    `);
    assert.deepEqual(expired.rows, [{ id: "expired-session" }]);
    const rejectedRefresh = await database.query(`
      update media_upload_sessions set created_at = current_timestamp,
        direct_upload_expires_at = current_timestamp + interval '15 minutes'
      where id = 'expired-session' and completion_state <> 'expired'
      returning id
    `);
    assert.equal(rejectedRefresh.rows.length, 0);
    const renewed = await database.query(`
      update media_upload_sessions set created_at = current_timestamp,
        direct_upload_expires_at = current_timestamp + interval '15 minutes'
      where id = 'renewed-session' and completion_state <> 'expired'
      returning id
    `);
    assert.deepEqual(renewed.rows, [{ id: "renewed-session" }]);
    const removed = await database.query(
      "delete from media_upload_sessions where id = any($1::text[]) and upload_mode = 'direct' and completion_state = 'expired' returning id",
      [["expired-session"]],
    );
    assert.deepEqual(removed.rows, [{ id: "expired-session" }]);
  } finally {
    await database.close();
  }
});
