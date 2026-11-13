import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const homeCss = fs.readFileSync(new URL("../src/home-property-layout.css", import.meta.url), "utf8");
const cardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const marketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");

test("homepage property cards use equal-height grid rows and stretch to fill them", () => {
  const homepageGrid = homeCss.match(/\.site-home \.property-showcase \.property-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const homepageCard = homeCss.match(/\.site-home \.property-showcase \.pcard\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(homepageGrid, /grid-auto-rows:\s*1fr;/);
  assert.match(homepageGrid, /align-items:\s*stretch;/);
  assert.match(homepageCard, /height:\s*100%;/);
});

test("desktop list-view property cards share equal-height rows", () => {
  assert.match(cardCss, /\.property-grid\.is-list-view\s*\{[^}]*grid-auto-rows:\s*1fr;/);
  assert.match(cardCss, /\.property-grid\.is-list-view \.pcard\s*\{[^}]*height:\s*100%;/);
});

test("mobile marketplace list-view cards share equal-height rows", () => {
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view\s*\{[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch;/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard\s*\{[^}]*height:\s*100%;/);
});
