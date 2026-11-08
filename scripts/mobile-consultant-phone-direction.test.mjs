import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(new URL("../src/components/hirmand/header.tsx", import.meta.url), "utf8");

test("mobile consultant phone numbers are isolated in left-to-right direction", () => {
  assert.match(header, /<bdi dir="ltr">\{person\.phoneDisplay\}<\/bdi>/);
  assert.match(header, /href=\{`tel:\$\{person\.phone\}`\}/);
});
