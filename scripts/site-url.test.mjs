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
