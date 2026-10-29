import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN_DASHBOARD_PROPERTY_STATS_SQL, ADMIN_DASHBOARD_PROPERTY_TYPES_SQL } from "./admin-dashboard-property-stats.ts";

test("admin dashboard property metrics exclude trashed listings and expired featured flags", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        status text not null,
        featured boolean not null default false,
        featured_until timestamptz,
        images jsonb,
        created_at timestamptz not null,
        description text,
        neighborhood text,
        property_type text,
        deleted_at timestamptz
      );
      insert into properties (id,status,featured,featured_until,images,created_at,description,neighborhood,property_type,deleted_at) values
        ('active-published','published',true,current_timestamp + interval '2 days','["/a.webp"]',current_timestamp,'A complete property description with more than one hundred and twenty characters. This is a realistic complete test description for the property.', 'مرکز شهر','apartment',null),
        ('active-draft','draft',true,current_timestamp - interval '1 day','[]',current_timestamp,'','', 'villa',null),
        ('trashed-published','published',true,null,'[]',current_timestamp,'','', 'land',current_timestamp);
    `);

    const stats = await db.query<Record<string, number>>(ADMIN_DASHBOARD_PROPERTY_STATS_SQL);
    assert.deepEqual(stats.rows[0], {
      total: 2,
      published: 1,
      draft: 1,
      archived: 0,
      featured: 1,
      without_images: 1,
      new_last7: 2,
      incomplete: 1,
    });

    const types = await db.query<{ property_type: string; count: number }>(ADMIN_DASHBOARD_PROPERTY_TYPES_SQL);
    assert.deepEqual(Object.fromEntries(types.rows.map((row) => [row.property_type, row.count])), {
      apartment: 1,
      villa: 1,
    });
  } finally {
    await db.close();
  }
});
