import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { buildSmartPropertyMatchScoreSql } from "./smart-property-match-sql.ts";

test("smart match SQL ranks exact preferences above near and poor candidates", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table properties (
      price numeric, neighborhood text, area_m2 integer, bedrooms integer,
      parking boolean, elevator boolean, storage boolean
    );
    insert into properties values
      (150, 'مرداویج', 150, 3, true, true, true),
      (220, 'جلفا', 130, 2, true, false, true),
      (350, 'ناژوان', 80, 1, false, false, false);`);
    const rows = await db.query<{ score: number }>(
      `select ${buildSmartPropertyMatchScoreSql()} as score from properties where $1::text is not null and $2::text is not null order by score desc`,
      ["sell", "apartment", 100, 200, ["مرداویج"], 100, 200, 2, null, ["parking", "elevator", "storage"]],
    );
    assert.deepEqual(rows.rows.map((row) => row.score), [100, 72, 31]);
  } finally {
    await db.close();
  }
});

test("omitted preferences do not dilute the remaining score", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table properties (price numeric, neighborhood text, area_m2 integer, bedrooms integer, parking boolean, elevator boolean, storage boolean);");
    await db.exec("insert into properties values (500, null, null, null, false, false, false), (1500, null, null, null, false, false, false), (2500, null, null, null, false, false, false);");
    const rows = await db.query<{ score: number }>(
      `select ${buildSmartPropertyMatchScoreSql()} as score from properties where $1::text is not null and $2::text is not null order by score desc`,
      ["sell", "apartment", null, 1000, [], null, null, null, null, []],
    );
    assert.deepEqual(rows.rows.map((row) => row.score), [100, 50, 0]);
  } finally {
    await db.close();
  }
});

test("exact bedroom selection matches zero and numbered rooms without treating them as minimums", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table properties (price numeric, neighborhood text, area_m2 integer, bedrooms integer, parking boolean, elevator boolean, storage boolean);");
    await db.exec("insert into properties values (null, null, null, 0, false, false, false), (null, null, null, 1, false, false, false), (null, null, null, 2, false, false, false), (null, null, null, 3, false, false, false), (null, null, null, 4, false, false, false);");
    const zeroRows = await db.query<{ score: number }>(
      `select ${buildSmartPropertyMatchScoreSql()} as score from properties where $1::text is not null and $2::text is not null order by bedrooms`,
      ["sell", "apartment", null, null, [], null, null, null, 0, []],
    );
    assert.deepEqual(zeroRows.rows.map((row) => row.score), [100, 0, 0, 0, 0]);

    const twoRows = await db.query<{ score: number }>(
      `select ${buildSmartPropertyMatchScoreSql()} as score from properties where $1::text is not null and $2::text is not null order by bedrooms`,
      ["sell", "apartment", null, null, [], null, null, null, 2, []],
    );
    assert.deepEqual(twoRows.rows.map((row) => row.score), [0, 0, 100, 0, 0]);
  } finally {
    await db.close();
  }
});
