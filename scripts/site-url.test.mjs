import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalSiteUrl } from "../src/lib/site-url.mjs";

test("the default canonical origin is HTTPS and non-www", () => {
  assert.equal(canonicalSiteUrl(), "https://hirmandrealestate.ir");
  assert.equal(canonicalSiteUrl(""), "https://hirmandrealestate.ir");
});

test("legacy www configuration is normalized without retaining paths or queries", () => {
  assert.equal(
    canonicalSiteUrl("http://www.hirmandrealestate.ir/old/path?campaign=one"),
    "https://hirmandrealestate.ir",
  );
});

test("the canonical host is upgraded to HTTPS", () => {
  assert.equal(canonicalSiteUrl("http://hirmandrealestate.ir"), "https://hirmandrealestate.ir");
});

test("unrelated preview origins are preserved", () => {
  assert.equal(canonicalSiteUrl("https://preview.example.test/app"), "https://preview.example.test");
});

test("Vercel permanently redirects www to the HTTPS non-www host", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.redirects, [{
    source: "/:path*",
    has: [{ type: "host", value: "www.hirmandrealestate.ir" }],
    destination: "https://hirmandrealestate.ir/:path*",
    permanent: true,
  }]);
});

test("the application, sitemap, robots, and CI use the non-www canonical origin", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../src/lib/site.ts"), /canonicalSiteUrl\(.*VITE_SITE_URL/s);
  assert.match(read("../server/routes/sitemap.xml.ts"), /canonicalSiteUrl\(process\.env\.VITE_SITE_URL\)/);
  assert.match(read("../public/robots.txt"), /Sitemap: https:\/\/hirmandrealestate\.ir\/sitemap\.xml/);
  assert.match(read("../.github/workflows/ci.yml"), /VITE_SITE_URL: https:\/\/hirmandrealestate\.ir/);
});

test("the property sitemap shares public visibility and includes due scheduled drafts", () => {
  const sitemap = readFileSync(new URL("../server/routes/sitemap.xml.ts", import.meta.url), "utf8");
  assert.match(sitemap, /import \{ publicPropertyVisibilitySql \} from "\.\.\/\.\.\/src\/lib\/public-property-visibility"/);
  assert.ok(sitemap.includes("where ${publicPropertyVisibilitySql()}"));
  assert.doesNotMatch(sitemap, /status = 'published'/);
});

test("the sitemap fails closed and is not cacheable when its database is unavailable", () => {
  const sitemap = readFileSync(new URL("../server/routes/sitemap.xml.ts", import.meta.url), "utf8");
  assert.match(sitemap, /if \(!databaseUrl\) throw new Error\("Sitemap database is not configured"\)/);
  assert.match(sitemap, /catch \(err\) \{[\s\S]*?createError\(\{[\s\S]*?statusCode: 503,[\s\S]*?headers: \{ "cache-control": "no-store" \}/);
  assert.doesNotMatch(sitemap, /property query failed[\s\S]*?return \[\]/);
  assert.doesNotMatch(sitemap, /guide query failed[\s\S]*?return DEFAULT_GUIDES/);
});
