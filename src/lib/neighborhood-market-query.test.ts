import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadNeighborhoodMarketSnapshot } from "./neighborhood-market-query.ts";
import type { Sql } from "./db.ts";

test("neighborhood market counts, averages and event metrics exclude hidden properties but include due scheduled drafts", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        slug text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz, neighborhood text not null,
        transaction_type text not null, price numeric, rent numeric, area_m2 numeric,
        published_at timestamptz, price_drop_percent numeric
      );
      create table site_events (event_name text not null, property_slug text not null, created_at timestamptz not null);
      insert into properties(slug,status,neighborhood,transaction_type,price,area_m2,published_at,price_drop_percent)
        values ('visible-sale','published','Center','sell',100000,100,current_timestamp - interval '5 days',5);
      insert into properties(slug,status,neighborhood,transaction_type,price,area_m2,published_at,price_drop_percent,deleted_at)
        values ('deleted-sale','published','Center','sell',900000,100,current_timestamp - interval '5 days',5,current_timestamp);
      insert into properties(slug,status,neighborhood,transaction_type,rent,published_at,unpublish_at)
        values ('unpublished-rent','published','Center','rent',50000,current_timestamp - interval '5 days',current_timestamp - interval '1 day');
      insert into properties(slug,status,neighborhood,transaction_type,price,area_m2,published_at,publish_at,price_drop_percent)
        values ('future-draft','draft','Center','sell',800000,100,current_timestamp - interval '5 days',current_timestamp + interval '1 day',5);
      insert into properties(slug,status,neighborhood,transaction_type,price,area_m2,published_at,publish_at,price_drop_percent)
        values ('elapsed-draft','draft','Center','sell',200000,100,current_timestamp - interval '5 days',current_timestamp - interval '1 day',2);
      insert into properties(slug,status,neighborhood,transaction_type,price,area_m2,published_at,price_drop_percent)
        values ('other-neighborhood','published','North','sell',1000000,100,current_timestamp - interval '5 days',5);
      insert into site_events(event_name,property_slug,created_at) values
        ('property_view','visible-sale',current_timestamp - interval '1 day'),
        ('property_view','deleted-sale',current_timestamp - interval '1 day'),
        ('property_favorite','unpublished-rent',current_timestamp - interval '1 day'),
        ('call_click','future-draft',current_timestamp - interval '1 day'),
        ('visit_request','elapsed-draft',current_timestamp - interval '1 day'),
        ('call_click','other-neighborhood',current_timestamp - interval '1 day');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await pg.query(query, params)).rows as T[],
    } as Sql;

    const snapshot = await loadNeighborhoodMarketSnapshot(sql, "Center");
    assert.equal(snapshot.activeFiles, 2);
    assert.equal(snapshot.saleFiles, 2);
    assert.equal(snapshot.rentFiles, 0);
    assert.equal(snapshot.saleAvgPerM2, 1500);
    assert.equal(snapshot.rentAvg, null);
    assert.equal(snapshot.newFiles30d, 2);
    assert.equal(snapshot.priceDropFiles, 2);
    assert.equal(snapshot.views30d, 1);
    assert.equal(snapshot.favorites30d, 0);
    assert.equal(snapshot.calls30d, 0);
    assert.equal(snapshot.viewingRequests30d, 1);
  } finally {
    await pg.close();
  }
});
