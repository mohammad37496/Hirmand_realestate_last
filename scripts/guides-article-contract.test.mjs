import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("published guides have dedicated indexable article pages with canonical metadata", () => {
  const route = read("../src/routes/guides.$slug.tsx");
  assert.match(route, /createFileRoute\("\/guides\/\$slug"\)/);
  assert.match(route, /getPublicGuides\(\)/);
  assert.match(route, /robots.*index, follow/s);
  assert.match(route, /canonical/);
  assert.match(route, /application\/ld\+json/);
  assert.match(route, /"@type": "Article"/);
  assert.match(route, /noindex, follow/);
  assert.match(route, /if \(!guide\) throw notFound\(\)/);
});

test("guide library links and shares the stable article URL", () => {
  const page = read("../src/routes/guides.index.tsx");
  assert.match(page, /to="\/guides\/\$slug"/);
  assert.match(page, /encodeURIComponent\(guide\.id\)/);
  assert.ok(page.indexOf("className=\"guide-card-discover\"") < page.indexOf("className=\"guide-card-body\""));
});

test("sitemap includes published guide detail URLs from the content table", () => {
  const sitemap = read("../server/routes/sitemap.xml.ts");
  assert.match(sitemap, /function loadGuideUrls/);
  assert.match(sitemap, /kind = 'guide' and active = true and id ~\* '\^\[a-z0-9-\]/);
  assert.match(sitemap, /select exists\(select 1 from site_content_items\) as has_content/);
  assert.match(sitemap, /if \(!existing\.rows\[0\]\?\.has_content\)/);
  assert.match(sitemap, /`\$\{SITE\}\/guides\/\$\{encodeURIComponent\(String\(row\.id\)\)\}`/);
  assert.match(sitemap, /for \(const item of guides\)/);
});
