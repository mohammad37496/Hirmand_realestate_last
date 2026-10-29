import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { REORDER_MUSIC_TRACKS_SQL } from "./admin-music-reorder.ts";

async function createFixture(withFailure = false) {
  const db = new PGlite();
  await db.exec(`
    create table music_tracks (
      id text primary key,
      position integer not null${withFailure ? ", check (id <> 'track-b' or position <> 0)" : ""},
      updated_at timestamptz
    );
    insert into music_tracks (id,position) values ('track-a',0),('track-b',1),('track-c',2);
  `);
  return db;
}

async function positions(db: PGlite) {
  const result = await db.query<{ id: string; position: number }>("select id,position from music_tracks order by id");
  return Object.fromEntries(result.rows.map((row) => [row.id, row.position]));
}

test("music reorder atomically applies a complete valid playlist order", async () => {
  const db = await createFixture();
  try {
    const result = await db.query<{ requested_count: number; updated_count: number; total_count: number; has_duplicates: boolean; matches_track_count: boolean; has_unknown_ids: boolean }>(
      REORDER_MUSIC_TRACKS_SQL,
      [["track-c", "track-a", "track-b"]],
    );
    assert.deepEqual(result.rows[0], {
      requested_count: 3,
      updated_count: 3,
      total_count: 3,
      has_duplicates: false,
      matches_track_count: true,
      has_unknown_ids: false,
    });
    assert.deepEqual(await positions(db), { "track-a": 1, "track-b": 2, "track-c": 0 });
  } finally {
    await db.close();
  }
});

test("duplicate, incomplete or unknown track lists are rejected without changing positions", async () => {
  for (const ids of [["track-a", "track-a", "track-c"], ["track-a", "track-b"], ["track-a", "track-b", "unknown"]]) {
    const db = await createFixture();
    try {
      const before = await positions(db);
      const result = await db.query<{ updated_count: number; has_duplicates: boolean; matches_track_count: boolean; has_unknown_ids: boolean }>(
        REORDER_MUSIC_TRACKS_SQL,
        [ids],
      );
      assert.equal(result.rows[0]?.updated_count, 0);
      assert.ok(result.rows[0]?.has_duplicates || !result.rows[0]?.matches_track_count || result.rows[0]?.has_unknown_ids);
      assert.deepEqual(await positions(db), before);
    } finally {
      await db.close();
    }
  }
});

test("a database failure rolls back the entire music reorder", async () => {
  const db = await createFixture(true);
  try {
    const before = await positions(db);
    await assert.rejects(db.query(REORDER_MUSIC_TRACKS_SQL, [["track-b", "track-a", "track-c"]]));
    assert.deepEqual(await positions(db), before);
  } finally {
    await db.close();
  }
});
