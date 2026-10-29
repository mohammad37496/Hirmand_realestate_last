import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN_UPCOMING_VISITS_SQL } from "./admin-agenda-queries.ts";

test("admin agenda upcoming visits exclude past visits and visits beyond seven days", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key,
        name text,
        phone text,
        deal text,
        neighborhood text,
        consultant text,
        visit_status text,
        visit_preferred_at timestamptz
      );
      insert into leads (id,visit_status,visit_preferred_at) values
        ('past','confirmed',current_timestamp - interval '2 days'),
        ('upcoming','requested',current_timestamp + interval '2 days'),
        ('too-far','confirmed',current_timestamp + interval '9 days'),
        ('cancelled','cancelled',current_timestamp + interval '1 day');
    `);

    const result = await db.query<{ id: string }>(ADMIN_UPCOMING_VISITS_SQL);
    assert.deepEqual(result.rows.map((row) => row.id), ["upcoming"]);
  } finally {
    await db.close();
  }
});
