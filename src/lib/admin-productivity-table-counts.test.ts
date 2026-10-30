import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadAdminProductivityTableCounts } from "./admin-productivity-table-counts.ts";

test("productivity system counts read the actual table totals", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (id text primary key);
      create table leads (id text primary key);
      create table consultants (id text primary key);
      create table media_objects (id text primary key);
      create table admin_tasks (id text primary key);
      insert into properties values ('p1'), ('p2');
      insert into leads values ('l1');
      insert into consultants values ('c1'), ('c2'), ('c3');
      insert into media_objects values ('m1'), ('m2');
    `);

    const counts = await loadAdminProductivityTableCounts(async (statement) => {
      const result = await db.query< { count: number } >(statement);
      return result.rows;
    });

    assert.deepEqual(counts, { properties: 2, leads: 1, consultants: 3, media: 2, tasks: 0 });
  } finally {
    await db.close();
  }
});

test("a failed productivity table probe rejects the complete system summary", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (id text primary key);
      create table leads (id text primary key);
      create table consultants (id text primary key);
      create table admin_tasks (id text primary key);
    `);

    await assert.rejects(loadAdminProductivityTableCounts(async (statement) => {
      const result = await db.query<{ count: number }>(statement);
      return result.rows;
    }), /media_objects/);
  } finally {
    await db.close();
  }
});
