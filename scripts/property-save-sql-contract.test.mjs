import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");

test("property save VALUES binds all 49 parameters in order without gaps or duplicates", () => {
  const saveStart = source.indexOf("export const saveProperty");
  assert.notEqual(saveStart, -1, "saveProperty declaration must exist");

  const insertStart = source.indexOf("insert into properties (", saveStart);
  assert.notEqual(insertStart, -1, "property insert statement must exist");

  const valuesStart = source.indexOf(") values (", insertStart);
  assert.notEqual(valuesStart, -1, "property insert VALUES clause must exist");

  const conflictStart = source.indexOf(")\n      on conflict (id)", valuesStart);
  assert.notEqual(conflictStart, -1, "property insert conflict clause must exist");

  const valuesSql = source.slice(valuesStart, conflictStart);
  const placeholders = [...valuesSql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(placeholders, Array.from({ length: 49 }, (_, index) => index + 1));
});
