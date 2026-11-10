import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const properties = read("../src/lib/properties.ts");
const scoreSql = read("../src/lib/smart-property-match-sql.ts");
const component = read("../src/components/hirmand/guided-smart-search.tsx");
const route = read("../src/routes/smart-search.tsx");
const styles = read("../src/smart-tools.css");
const browserSmoke = read("./browser-smoke.mjs");

test("guided search validates criteria and only queries publicly visible sale properties", () => {
  assert.match(properties, /const smartPropertyMatchSchema = z\.object/);
  assert.match(properties, /transactionType: z\.literal\("sell"\)/);
  assert.match(properties, /exactBedrooms: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(properties, /new Set\(items\)\.size === items\.length/);
  assert.match(properties, /حداقل یک معیار برای رتبه‌بندی انتخاب کنید/);
  assert.match(properties, /matchPublishedPropertiesBySmartSearch = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(properties, /where \$\{MATCHABLE_PUBLIC_PROPERTY_WHERE\}[\s\S]*?transaction_type = \$1[\s\S]*?property_type = \$2/);
  assert.match(properties, /const MATCHABLE_PUBLIC_PROPERTY_WHERE = matchablePropertyVisibilitySql\(\)/);
  assert.match(properties, /limit \$11/);
});

test("ranking uses normalized active weights rather than penalizing skipped steps", () => {
  assert.match(scoreSql, /SMART_MATCH_WEIGHTS\.budget/);
  assert.match(scoreSql, /SMART_MATCH_WEIGHTS\.neighborhoods/);
  assert.match(scoreSql, /SMART_MATCH_WEIGHTS\.area/);
  assert.match(scoreSql, /SMART_MATCH_WEIGHTS\.amenities/);
  assert.match(scoreSql, /nullif\(\$\{activeWeight\}, 0\)/);
});

test("the six-step guided flow exposes multi-select areas, optional preferences and ranked scores", () => {
  assert.match(component, /const STEPS = \[[\s\S]*?امکانات/);
  assert.match(component, /setNeighborhoods/);
  assert.match(component, /setAmenities/);
  assert.match(component, /exactBedrooms: Number\(bedrooms\)/);
  assert.match(component, /matchPublishedPropertiesBySmartSearch/);
  assert.match(component, /match\.score\.toLocaleString\("fa-IR"\)/);
  assert.match(component, /ویرایش معیارها/);
});

test("natural-language search remains available beside guided search with responsive styles", () => {
  assert.match(route, /جستجوی مرحله‌ای و رتبه‌بندی/);
  assert.match(route, /جستجوی متنی فارسی/);
  assert.match(route, /parseSmartPropertySearch/);
  assert.match(styles, /\.guided-search-result-grid/);
  assert.match(styles, /@media\(max-width:680px\)/);
  assert.match(browserSmoke, /"\/smart-search"/);
  assert.match(browserSmoke, /guidedSearchCheck/);
  assert.match(browserSmoke, /guided-search-neighborhood-grid button/);
  assert.match(browserSmoke, /\.guided-search-results/);
  assert.match(browserSmoke, /for \(const width of \[768, 1280\]\)/);
  assert.match(browserSmoke, /smart-tool-hero/);
});
