import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getPublicSharedShortlistSlugs } from "./shared-shortlist-visibility.ts";
import type { Sql } from "./db.ts";

test("shared shortlist slug resolution excludes hidden properties and includes due scheduled publication", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        slug text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      insert into properties(slug,status) values ('visible','published');
      insert into properties(slug,status,deleted_at) values ('deleted','published',current_timestamp);
      insert into properties(slug,status,unpublish_at) values ('unpublished','published',current_timestamp - interval '1 day');
      insert into properties(slug,status,publish_at) values ('future-draft','draft',current_timestamp + interval '1 day');
      insert into properties(slug,status,publish_at) values ('due-draft','draft',current_timestamp - interval '1 day');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await pg.query(query, params)).rows as T[],
    } as Sql;

    const resolved = await getPublicSharedShortlistSlugs(sql, [
      "visible", "deleted", "unpublished", "future-draft", "due-draft", "missing",
    ]);
    assert.deepEqual(resolved.sort(), ["due-draft", "visible"]);
    assert.deepEqual(await getPublicSharedShortlistSlugs(sql, []), []);
  } finally {
    await pg.close();
  }
});
