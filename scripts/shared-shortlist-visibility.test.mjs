import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedShortlistPost = await readFile(
  new URL("../server/routes/api/shared-shortlist.post.ts", import.meta.url),
  "utf8",
);
const sharedShortlistGet = await readFile(
  new URL("../server/routes/api/shared-shortlist.get.ts", import.meta.url),
  "utf8",
);

test("shared shortlist creation and retrieval use the same canonical public property visibility predicate", () => {
  assert.match(sharedShortlistPost, /import \{ publicPropertyVisibilitySql \} from "@\/lib\/public-property-visibility"/);
  assert.match(sharedShortlistGet, /import \{ publicPropertyVisibilitySql \} from "@\/lib\/public-property-visibility"/);
  assert.match(sharedShortlistPost, /from properties where \$\{publicPropertyVisibilitySql\(\)\} and slug=any/);
  assert.match(sharedShortlistGet, /from properties where \$\{publicPropertyVisibilitySql\(\)\} and slug=any/);
  assert.doesNotMatch(sharedShortlistPost, /from properties where status='published'/);
  assert.doesNotMatch(sharedShortlistGet, /from properties where deleted_at is null and status='published'/);
  assert.match(sharedShortlistPost, /if \(!published\.length\) throw createError\(\{ statusCode: 404/);
});
