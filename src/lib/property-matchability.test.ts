import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { isMatchableProperty, MATCHABLE_PROPERTY_SQL } from "./property-matchability.ts";

test("only active published and available properties enter CRM matching", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key, status text not null, availability_status text,
        deleted_at timestamptz, unpublish_at timestamptz
      );
      insert into properties values
        ('available','published','available',null,null),
        ('reserved','published','reserved',null,null),
        ('sold','published','sold',null,null),
        ('rented','published','rented',null,null),
        ('unavailable','published','unavailable',null,null),
        ('draft','draft','available',null,null),
        ('deleted','published','available',current_timestamp,null),
        ('expired','published','available',null,current_timestamp - interval '1 minute');
    `);
    const result = await db.query<{ id: string }>(`select id from properties where ${MATCHABLE_PROPERTY_SQL} order by id`);
    assert.deepEqual(result.rows.map((row) => row.id), ["available"]);
  } finally { await db.close(); }
});

test("in-process matchability treats absent legacy availability as available but rejects stale states", () => {
  assert.equal(isMatchableProperty({ status: "published" }), true);
  assert.equal(isMatchableProperty({ status: "published", availability_status: "reserved" }), false);
  assert.equal(isMatchableProperty({ status: "draft", availability_status: "available" }), false);
  assert.equal(isMatchableProperty({ status: "published", deleted_at: "2026-01-01" }), false);
  assert.equal(isMatchableProperty({ status: "published", unpublish_at: "2026-01-01" }), false);
});
