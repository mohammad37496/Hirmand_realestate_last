import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const marketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");
const propertyCardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const propertyShowcase = fs.readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");

test("desktop property list uses a three-column RTL card with a dedicated action rail", () => {
  const desktopListStart = marketplaceCss.indexOf("Professional desktop list cards");
  const tabletListStart = marketplaceCss.indexOf("@media (min-width: 721px) and (max-width: 980px)", desktopListStart);
  const desktopList = desktopListStart >= 0 && tabletListStart > desktopListStart
    ? marketplaceCss.slice(desktopListStart, tabletListStart)
    : "";
  assert.ok(desktopList, "the marketplace must define a desktop list layout");
  assert.match(desktopList, /grid-template-columns:\s*minmax\(230px,\s*28%\)\s+minmax\(0,\s*1fr\)\s+108px/);
  assert.match(desktopList, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-link\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*3/);
  assert.match(desktopList, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-actions\s*\{[\s\S]*?grid-column:\s*3;[\s\S]*?grid-row:\s*1/);
  assert.match(desktopList, /grid-template-columns:\s*repeat\(2,\s*44px\)/);
  assert.match(desktopList, /border-inline-start:\s*1px solid #edf0f2/);
});

test("tablet list cards retain readable image, details and compact action columns", () => {
  assert.match(marketplaceCss, /@media \(min-width: 721px\) and \(max-width: 980px\)[\s\S]*?grid-template-columns:\s*minmax\(180px,\s*27%\)\s+minmax\(0,\s*1fr\)\s+104px/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-body\s*\{[\s\S]*?padding:\s*14px 15px/);
  assert.match(marketplaceCss, /@media \(min-width: 641px\) and \(max-width: 720px\)[\s\S]*?grid-template-columns:\s*clamp\(96px,\s*28vw,\s*116px\)\s+minmax\(0,\s*1fr\)/);
});

test("mobile shared RTL list cards and explicit photo grid mode remain intact", () => {
  assert.match(propertyShowcase, /<article className="pcard pcard-mobile-list">/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link\s*\{[^}]*direction:rtl;[^}]*grid-template-columns:clamp\(96px,28vw,116px\) minmax\(0,1fr\)/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-actions\s*\{[^}]*grid-row:2/);
  assert.match(propertyCardCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list\s*\{[^}]*display:block/);
});

test("phone list cards keep a readable image, key facts and a single swipeable action row", () => {
  const mobileList = marketplaceCss.slice(marketplaceCss.lastIndexOf("Mobile list cards:"));
  assert.match(mobileList, /grid-template-columns:\s*clamp\(116px,\s*34vw,\s*140px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(mobileList, /pcard-specs span:nth-child\(n \+ 4\)\s*\{\s*display:\s*none/);
  assert.match(mobileList, /display:\s*flex\s*!important/);
  assert.match(mobileList, /flex-wrap:\s*nowrap\s*!important/);
  assert.match(mobileList, /overflow-x:\s*auto\s*!important/);
  assert.match(mobileList, /grid-template-columns:\s*none\s*!important/);
  assert.match(mobileList, /inset:\s*auto\s*!important/);
  assert.match(mobileList, /flex:\s*0 0 44px\s*!important/);
});

test("list card focus and reduced-motion behavior remain accessible", () => {
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard:hover,[\s\S]*?\.pcard:focus-within/);
  assert.match(marketplaceCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.pf-page \.pf-grid\.is-list-view > \.pcard,[\s\S]*?transition:\s*none/);
});
