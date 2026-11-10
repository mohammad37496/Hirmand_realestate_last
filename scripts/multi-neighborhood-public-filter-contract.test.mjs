import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const browserSmoke = read("./browser-smoke.mjs");
const route = read("../src/routes/properties.index.tsx");
const responsiveSmoke = read("./responsive-layout-smoke.mjs");
const responsiveCss = read("../src/mobile-responsive-hardening.css");

test("responsive browser smoke selects multiple neighborhoods and clears the canonical URL state", () => {
  assert.match(browserSmoke, /const neighborhoodFilterCheck = .*widths: \[390, 768, 1280\]/);
  assert.match(browserSmoke, /\.pf-neighborhood-dialog/);
  assert.match(browserSmoke, /getAll\("neighborhoods"\)/);
  assert.match(browserSmoke, /neighborhoodFilterCheck\.selected = state\.neighborhoods/);
  assert.match(browserSmoke, /multi-neighborhood filter browser smoke failed/);
  assert.match(browserSmoke, /style\.position === "fixed" && style\.bottom !== "auto"/);
  assert.match(browserSmoke, /bottomStyle: getComputedStyle\(element\)\.bottom/);
  assert.match(responsiveCss, /@media \(min-width: 981px\)\s*\{\s*\.pf-page \.pf-sidebar\s*\{\s*position: sticky;\s*top: 82px;/);
  assert.match(route, /writeNeighborhoodSelection\(params, selectedNeighborhoods\)/);
  assert.match(route, /setSelectedNeighborhoods\(\[\]\)/);
});

test("responsive smoke applies the draft neighborhood before asserting URL state", () => {
  assert.match(responsiveSmoke, /neighborhoodDialog\.getByRole\("button", \{ name: "اعمال انتخاب‌ها" \}\)\.click\(\)/);
  assert.match(responsiveSmoke, /new URLSearchParams\(location\.search\)\.get\("neighborhood"\) === name/);
});
