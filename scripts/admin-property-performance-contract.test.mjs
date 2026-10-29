import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = fs.readFileSync("server/routes/api/admin-property-performance.post.ts", "utf8");

test("market comparables exclude soft-deleted published properties", async () => {
  const comparableType = source.indexOf("comparable_count: number;");
  const start = source.lastIndexOf("sql.query<{", comparableType);
  const end = source.indexOf("[property.id, property.neighborhood, property.property_type, property.transaction_type]", start);
  assert.notEqual(start, -1, "find the production market-comparison query");
  assert.notEqual(end, -1, "find the actual parameter list for the production query");

  const querySource = source.slice(start, end);
  const sql = [...querySource.matchAll(/"((?:\\.|[^"\\])*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`))
    .join("");
  assert.match(sql, /status\s*=\s*'published'\s+and\s+deleted_at\s+is\s+null/i);

  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        neighborhood text not null, property_type text not null,
        transaction_type text not null, area_m2 numeric, price numeric,
        rent numeric, deposit numeric
      );
      insert into properties (id,status,deleted_at,neighborhood,property_type,transaction_type,area_m2,price) values
        ('target','published',null,'مرکز شهر','apartment','buy',100,250000),
        ('active-comparable','published',null,'مرکز شهر','apartment','buy',100,200000),
        ('trashed-comparable','published',current_timestamp,'مرکز شهر','apartment','buy',100,900000);
    `);

    const result = await db.query(sql, ["target", "مرکز شهر", "apartment", "buy"]);
    assert.deepEqual(result.rows, [{
      comparable_count: 1,
      average_metric: "2000",
      minimum_metric: "2000",
      maximum_metric: "2000",
    }]);
  } finally {
    await db.close();
  }
});
