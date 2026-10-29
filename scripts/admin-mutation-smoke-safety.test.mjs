import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const source = readFileSync(new URL("./admin-mutation-smoke.mjs", import.meta.url), "utf8");
test("admin mutation smoke uses a per-run unique property title before cleanup", () => {
  assert.ok(source.includes("from \"node:crypto\""));
  assert.ok(source.includes("randomUUID()"));
  assert.ok(source.includes("[smoke-${randomUUID()}]"));
  assert.ok(source.includes("delete from properties where title = $1"));
});
