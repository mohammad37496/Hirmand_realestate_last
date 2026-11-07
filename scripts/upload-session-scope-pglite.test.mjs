import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";

test("route-scoped chunk and completion SQL reject another route's same-kind session", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table media_upload_sessions (
        id text primary key,
        pathname text not null,
        kind text not null,
        completion_state text not null default 'pending',
        completion_result jsonb
      );
      create table media_upload_chunks (
        session_id text not null,
        chunk_index integer not null,
        data bytea not null,
        primary key (session_id, chunk_index)
      );
      insert into media_upload_sessions (id, pathname, kind)
      values
        ('property-id', 'properties/uploads/a.jpg', 'media'),
        ('area-id', 'areas/uploads/b.jpg', 'media');
    `);

    // This is the old lookup contract: both routes use kind="media", so kind
    // alone accepts the other route's session ID.
    const oldUnscopedLookup = await db.query(
      "select id from media_upload_sessions where id = $1 and kind = $2",
      ["property-id", "media"],
    );
    assert.equal(oldUnscopedLookup.rows.length, 1);

    const saveChunk = `
      with upload_session as (
        select id from media_upload_sessions
        where id = $1
          and kind = $4
          and left(pathname, length($5)) = $5
          and completion_state = 'pending'
        for update
      ), saved_chunk as (
        insert into media_upload_chunks (session_id, chunk_index, data)
        select id, $2, $3 from upload_session
        on conflict (session_id, chunk_index) do update set data = excluded.data
        returning session_id
      )
      select session_id from saved_chunk limit 1
    `;
    const wrongRouteChunk = await db.query(saveChunk, [
      "property-id", 0, new Uint8Array([1, 2, 3]), "media", "areas/uploads/",
    ]);
    assert.equal(wrongRouteChunk.rows.length, 0);

    const validChunk = await db.query(saveChunk, [
      "property-id", 0, new Uint8Array([1, 2, 3]), "media", "properties/uploads/",
    ]);
    assert.equal(validChunk.rows[0]?.session_id, "property-id");

    const claimCompletion = `
      update media_upload_sessions
      set completion_state = 'completing'
      where id = $1 and kind = $2
        and left(pathname, length($3)) = $3
      returning id
    `;
    const wrongRouteClaim = await db.query(claimCompletion, [
      "property-id", "media", "areas/uploads/",
    ]);
    assert.equal(wrongRouteClaim.rows.length, 0);

    const validClaim = await db.query(claimCompletion, [
      "property-id", "media", "properties/uploads/",
    ]);
    assert.equal(validClaim.rows[0]?.id, "property-id");

    await db.exec("update media_upload_sessions set completion_state = 'pending'");
    const wrongRouteAbort = await db.query(
      `delete from media_upload_sessions
       where id = $1 and kind = $2
         and left(pathname, length($3)) = $3
         and completion_state = 'pending'
       returning id`,
      ["property-id", "media", "areas/uploads/"],
    );
    assert.equal(wrongRouteAbort.rows.length, 0);
    const validRouteAbort = await db.query(
      `delete from media_upload_sessions
       where id = $1 and kind = $2
         and left(pathname, length($3)) = $3
         and completion_state = 'pending'
       returning id`,
      ["property-id", "media", "properties/uploads/"],
    );
    assert.equal(validRouteAbort.rows[0]?.id, "property-id");
  } finally {
    await db.close();
  }
});
