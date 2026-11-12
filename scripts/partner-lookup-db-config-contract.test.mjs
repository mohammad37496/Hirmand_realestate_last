import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/partner/lookup.post.ts", import.meta.url), "utf8");

test("partner contract lookup returns 503 for an unconfigured database before calling the query helper", () => {
  assert.match(route, /import\s*\{\s*dbSource\s*\}\s*from\s*["']@\/lib\/db["']/);
  assert.match(route, /if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*\{\s*throw createError\(\{\s*statusCode:\s*503/s);
  assert.ok(route.indexOf('statusCode: 503') < route.indexOf('lookupPartnerContract(code)'));
});
