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
const sharedShortlistVisibility = await readFile(
  new URL("../src/lib/shared-shortlist-visibility.ts", import.meta.url),
  "utf8",
);

test("shared shortlist creation and retrieval use the same canonical public property visibility predicate", () => {
  assert.match(sharedShortlistPost, /import \{ getPublicSharedShortlistSlugs \} from "@\/lib\/shared-shortlist-visibility"/);
  assert.match(sharedShortlistGet, /import \{ getPublicSharedShortlistSlugs \} from "@\/lib\/shared-shortlist-visibility"/);
  assert.match(sharedShortlistPost, /getPublicSharedShortlistSlugs\(sql, uniqueSlugs\)/);
  assert.match(sharedShortlistGet, /getPublicSharedShortlistSlugs\(sql, slugs\)/);
  assert.match(sharedShortlistVisibility, /import \{ publicPropertyVisibilitySql \} from "\.\/public-property-visibility\.ts"/);
  assert.match(sharedShortlistVisibility, /from properties where \$\{publicPropertyVisibilitySql\(\)\} and slug=any/);
  assert.match(sharedShortlistPost, /if \(!published\.length\) throw createError\(\{ statusCode: 404/);
});
