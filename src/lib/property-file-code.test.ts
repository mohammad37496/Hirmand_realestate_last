import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { resolveFileCodeLookup } from "./property-file-code.ts";

test("file-code lookup returns ambiguity instead of choosing the newest colliding UUID suffix", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table properties (id text primary key, status text not null, deleted_at timestamptz, publish_at timestamptz, unpublish_at timestamptz, published_at timestamptz, created_at timestamptz not null)",
    );
    await db.query(
      "insert into properties (id, status, published_at, created_at) values ($1, 'published', '2026-01-01', '2026-01-01'), ($2, 'published', '2026-02-01', '2026-02-01')",
      ["00000000-0000-4000-8000-000000ABCDEF", "00000000-0000-4000-8000-111111ABCDEF"],
    );
    const findByCode = async (code: string) => resolveFileCodeLookup(async () => {
      const result = await db.query<{ id: string }>(
        "select id from properties where deleted_at is null and (status = 'published' or (status = 'draft' and publish_at is not null and publish_at <= current_timestamp)) and (unpublish_at is null or unpublish_at > current_timestamp) and lower(right(replace(id::text, '-', ''), 6)) = $1 order by published_at desc nulls last, created_at desc limit 2",
        [code.toLowerCase()],
      );
      return result.rows;
    });
    assert.deepEqual(await findByCode("abcdef"), { ambiguousFileCode: true });
    assert.deepEqual(await findByCode("123456"), null);
    const unique = await db.query("delete from properties where id = $1", ["00000000-0000-4000-8000-111111ABCDEF"]);
    assert.equal(unique.affectedRows, 1);
    assert.deepEqual(await findByCode("abcdef"), { id: "00000000-0000-4000-8000-000000ABCDEF" });

    const source = await readFile(new URL("./properties.ts", import.meta.url), "utf8");
    assert.match(source, /resolveFileCodeLookup\(async \(\) =>/);
    assert.match(source, /lower\(right\(replace\(id::text, '-', ''\), 6\)\) = \$1[\s\S]*?limit 2/);
  } finally {
    await db.close();
  }
});
