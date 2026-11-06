import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const marketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");
const responsiveHardeningCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const propertyCardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const homePropertyCss = fs.readFileSync(new URL("../src/home-property-layout.css", import.meta.url), "utf8");
const propertyShowcase = fs.readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");

test("desktop property list anchors actions to the lower edge of the property image", () => {
  const desktopListStart = marketplaceCss.indexOf("Professional desktop list cards");
  const tabletListStart = marketplaceCss.indexOf("@media (min-width: 721px) and (max-width: 980px)", desktopListStart);
  const desktopList = desktopListStart >= 0 && tabletListStart > desktopListStart
    ? marketplaceCss.slice(desktopListStart, tabletListStart)
    : "";
  assert.ok(desktopList, "the marketplace must define a desktop list layout");
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-block-end:\s*0/);
  assert.match(marketplaceCss, /\.pcard > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?background:\s*rgb\(8 19 32 \/ 78%\)/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-link\s*\{[\s\S]*?grid-column:\s*2/);
  assert.match(desktopList, /grid-template-columns:\s*minmax\(230px,\s*28%\)\s+minmax\(0,\s*1fr\)/);
});

test("tablet list cards retain a readable image and details beside the image action overlay", () => {
  const finalTabletLayout = marketplaceCss.slice(marketplaceCss.lastIndexOf("@media (min-width: 721px) and (max-width: 980px)"));
  assert.match(finalTabletLayout, /grid-template-columns:\s*minmax\(180px,\s*27%\)\s+minmax\(0,\s*1fr\)/);
  assert.match(finalTabletLayout, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-body\s*\{\s*padding:\s*14px 15px/);
  assert.match(marketplaceCss, /@media \(min-width: 721px\)[\s\S]*?\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-media > \.pcard-actions/);
});

test("mobile shared RTL list cards and explicit photo grid mode remain intact", () => {
  assert.match(propertyShowcase, /<article className="pcard pcard-mobile-list">/);
  assert.match(propertyShowcase, /<div className="pcard-media">[\s\S]*?<Link[\s\S]*?className="pcard-image-link"[\s\S]*?<div className="pcard-actions"[\s\S]*?<\/div>\s*<\/div>\s*<Link[\s\S]*?className="pcard-link"/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link\s*\{[^}]*direction:rtl/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?inset-block-end:\s*0/);
  assert.match(propertyCardCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list\s*\{[^}]*display:block/);
  assert.match(marketplaceCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?inset-block-end:\s*0/);
});

test("shared mobile cards keep their actions in one horizontally scrollable row", () => {
  assert.match(marketplaceCss, /\.pcard > \.pcard-media > \.pcard-actions \.property-actions,[\s\S]*?\.pcard > \.pcard-media > \.pcard-actions \.property-actions-compact\s*\{[\s\S]*?display:\s*flex !important;[\s\S]*?flex-wrap:\s*nowrap !important;[\s\S]*?overflow-x:\s*auto !important/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions \.property-action\s*\{[\s\S]*?flex-basis:\s*44px/);
});

test("phone list cards keep a readable image, key facts and a single swipeable action row", () => {
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-link\s*\{[\s\S]*?margin-inline-start:\s*clamp\(120px,\s*40vw,\s*170px\)/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?width:\s*clamp\(120px,\s*40vw,\s*170px\)/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list \.pcard-actions \.property-action\s*\{[\s\S]*?flex:\s*0 0 44px !important/);
});

test("list card focus and reduced-motion behavior remain accessible", () => {
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard:hover,[\s\S]*?\.pcard:focus-within/);
  assert.match(marketplaceCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.pf-page \.pf-grid\.is-list-view > \.pcard,[\s\S]*?transition:\s*none/);
});

test("explicit grid cards use a premium photo, action and information hierarchy", () => {
  const gridPolish = marketplaceCss.slice(marketplaceCss.lastIndexOf("/* Premium photo-first cards for the explicit marketplace grid view. */"));
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard\s*\{[^}]*border-radius:\s*20px/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media\s*\{[^}]*aspect-ratio:\s*1\.55 \/ 1/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-actions\s*\{[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard \.pcard-price-row\s*\{[^}]*background:\s*#f6f8f5/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard \.pcard-specs\s*\{[^}]*background:\s*#faf8f4/);
  assert.match(gridPolish, /@media \(max-width:\s*720px\)[\s\S]*?\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media\s*\{[^}]*aspect-ratio:\s*1\.48 \/ 1/);
  assert.match(gridPolish, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("mobile marketplace filters, view toggles and map controls keep 44px touch targets", () => {
  const tabletControls = marketplaceCss.slice(marketplaceCss.indexOf("/* Tablet and phone controls"));
  assert.match(tabletControls, /@media \(max-width: 1024px\)[\s\S]*?\.pf-page \.pf-sort \.pf-select,[\s\S]*?\.pf-page \.pf-sidebar \.pf-close\s*\{[\s\S]*?min-height:\s*44px !important/);
  assert.match(tabletControls, /\.pf-page \.pf-sidebar \.pf-close\s*\{\s*min-width:\s*44px;\s*width:\s*44px/);
  assert.match(tabletControls, /\.pcard-actions \.property-action\s*\{\s*width:\s*44px;\s*height:\s*44px;\s*min-height:\s*44px/);
  const mobileControls = marketplaceCss.slice(marketplaceCss.indexOf("/* Mobile marketplace controls:"));
  assert.match(mobileControls, /\.pf-page \.pf-chip,[\s\S]*?\.pf-page \.pf-sidebar \.pf-close\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(mobileControls, /\.pf-page \.pf-filter-primary \.pf-chip,[\s\S]*?\.pf-page \.pf-active \.pf-chip\s*\{\s*min-height:\s*44px !important/);
  assert.match(mobileControls, /\.pf-page \.pf-quick\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto/);
  assert.match(mobileControls, /\.pf-page \.pf-map-controls button\s*\{\s*width:\s*44px;\s*height:\s*44px/);
  assert.match(mobileControls, /\.pf-page \.pf-map-floating-head a\s*\{\s*min-height:\s*44px/);
});

test("coarse-pointer marketplace controls keep 44px touch targets at desktop widths", () => {
  const coarsePointerControls = responsiveHardeningCss.slice(
    responsiveHardeningCss.lastIndexOf("/* Coarse-pointer property marketplace controls stay at least 44px at every width. */"),
  );
  assert.match(coarsePointerControls, /@media\s*\(pointer:\s*coarse\)\s*\{/);
  for (const selector of [
    ".pf-page .pf-chip",
    ".pf-page .pf-views button",
    ".pf-page .pf-tools > a",
    ".pf-page .pf-sort .pf-select",
    ".pf-page .pf-switch",
    ".pf-page .pf-spec-option",
    ".pf-page .pcard-actions .property-action",
  ]) {
    assert.ok(coarsePointerControls.includes(selector), `${selector} must retain a 44px coarse-pointer target`);
  }
  assert.match(coarsePointerControls, /min-height:\s*44px\s*!important/);
  assert.match(coarsePointerControls, /min-width:\s*44px\s*!important/);
  assert.match(coarsePointerControls, /width:\s*44px\s*!important/);
  assert.match(coarsePointerControls, /height:\s*44px\s*!important/);
});

test("mobile list cards avoid repeating the photo transaction badge and wrap unit price", () => {
  const mobileCardPolish = propertyCardCss.slice(propertyCardCss.indexOf("/* The transaction is already visible"));
  assert.match(mobileCardPolish, /\.pcard-mobile-list \.pcard-meta > span:first-child\s*\{\s*display:\s*none/);
  assert.match(mobileCardPolish, /\.pcard-mobile-list \.pcard-unit-price\s*\{\s*display:\s*none/);
  assert.match(mobileCardPolish, /\.pcard-mobile-list \.pcard-specs\s*\{\s*flex-wrap:\s*nowrap/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?height:\s*48px;[\s\S]*?min-height:\s*48px/);
  assert.match(propertyCardCss, /@media \(max-width:360px\)[\s\S]*?\.pcard-mobile-list \.pcard-details-link\s*\{\s*display:none/);
  assert.match(mobileCardPolish, /\.pf-grid\.is-grid-view \.pcard-mobile-list \.pcard-unit-price\s*\{\s*display:\s*block/);
});

test("homepage shared cards retain the compact RTL list and 44px image action overlay on phones", () => {
  const homeMobile = homePropertyCss.slice(homePropertyCss.indexOf("/* The homepage showcase uses the same compact RTL list-card rhythm"));
  assert.match(homeMobile, /\.site-home \.property-showcase \.pcard-mobile-list\s*\{\s*grid-template-rows:\s*minmax\(168px, auto\)/);
  assert.match(homeMobile, /\.site-home \.property-showcase \.pcard-mobile-list \.pcard-unit-price\s*\{\s*display:\s*none/);
  assert.match(marketplaceCss, /\.site-home \.property-showcase \.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*100%/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions \.property-action\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-height:\s*44px/);
});
