import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const route = readFileSync(
  new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url),
  "utf8",
);

test("customer-submission duplicate checks ignore soft-deleted properties", async () => {
  // The list and CSV-export paths must use the same visible-property scope.
  assert.equal((route.match(/p\.deleted_at is null and p\.status <> 'archived'/g) ?? []).length, 2);

  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        status text not null,
        deleted_at timestamptz,
        owner_phone text,
        neighborhood text,
        area_m2 integer,
        title text
      );
      insert into properties (id,status,deleted_at,owner_phone,neighborhood,area_m2,title) values
        ('visible','published',null,'09131056029','مرکز شهر',90,'آپارتمان نمونه'),
        ('trashed','published',current_timestamp,'09131056029','مرکز شهر',90,'آپارتمان نمونه'),
        ('archived','archived',null,'09131056029','مرکز شهر',90,'آپارتمان نمونه');
    `);

    const matches = await db.query<{ id: string }>(
      `select id from properties p
       where p.deleted_at is null and p.status <> 'archived' and (
         p.owner_phone=$1 or (
           p.neighborhood=$2 and p.area_m2::text=$3 and lower(coalesce(p.title,''))=$4
         )
       ) order by id`,
      ["09131056029", "مرکز شهر", "90", "آپارتمان نمونه"],
    );
    assert.deepEqual(matches.rows.map((row) => row.id), ["visible"]);
  } finally {
    await db.close();
  }
});
