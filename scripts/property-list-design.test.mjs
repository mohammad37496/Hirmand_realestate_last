import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const marketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");
const responsiveHardeningCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const propertyCardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const homePropertyCss = fs.readFileSync(new URL("../src/home-property-layout.css", import.meta.url), "utf8");
const propertyShowcase = fs.readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");
const propertiesRoute = fs.readFileSync(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");

test("desktop property list anchors actions to the lower edge of the property image", () => {
  const desktopListStart = marketplaceCss.indexOf("Professional desktop list cards");
  const tabletListStart = marketplaceCss.indexOf("@media (min-width: 721px) and (max-width: 980px)", desktopListStart);
  const desktopList = desktopListStart >= 0 && tabletListStart > desktopListStart
    ? marketplaceCss.slice(desktopListStart, tabletListStart)
    : "";
  assert.ok(desktopList, "the marketplace must define a desktop list layout");
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-block-end:\s*0/);
  assert.match(marketplaceCss, /\.pcard > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?background:\s*transparent;[\s\S]*?pointer-events:\s*none/);
  assert.match(marketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-link\s*\{[\s\S]*?grid-column:\s*2/);
  assert.match(desktopList, /grid-template-columns:\s*minmax\(230px,\s*28%\)\s+minmax\(0,\s*1fr\)/);
});

test("desktop list cards and their images share one height across optional property details", () => {
  const desktopListStart = marketplaceCss.indexOf("Professional desktop list cards");
  const tabletListStart = marketplaceCss.indexOf("@media (min-width: 721px) and (max-width: 980px)", desktopListStart);
  const desktopList = marketplaceCss.slice(desktopListStart, tabletListStart);
  assert.match(desktopList, /\.pf-page \.pf-grid\.is-list-view\s*\{[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch/);
  assert.match(desktopList, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-media\s*\{[^}]*height:\s*100%;/);
});

test("tablet list cards retain a readable image and details beside the image action overlay", () => {
  const finalTabletLayout = marketplaceCss.slice(marketplaceCss.lastIndexOf("@media (min-width: 721px) and (max-width: 980px)"));
  assert.match(finalTabletLayout, /grid-template-columns:\s*minmax\(180px,\s*27%\)\s+minmax\(0,\s*1fr\)/);
  assert.match(finalTabletLayout, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-body\s*\{\s*padding:\s*14px 15px/);
  assert.match(marketplaceCss, /@media \(min-width: 721px\)[\s\S]*?\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-media > \.pcard-actions/);
});

test("mobile shared RTL list cards and explicit photo grid mode remain intact", () => {
  assert.match(propertyShowcase, /<article className="pcard pcard-mobile-list">/);
  assert.match(propertyShowcase, /showActions = true/);
  assert.match(propertyShowcase, /\{showActions \? \([\s\S]*?<div className="pcard-actions"[\s\S]*?<PropertyActions property=\{property\} compact \/>[\s\S]*?\) : null\}/);
  assert.match(propertiesRoute, /<PropertyCard key=\{property\.id\} property=\{property\} showActions=\{viewMode !== "list"\} \/>/);
  assert.match(propertyShowcase, /<PropertyCard key=\{property\.id\} property=\{property\} showActions=\{false\} \/>/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link\s*\{[^}]*direction:rtl/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?inset-block-end:\s*0/);
  assert.match(propertyCardCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list\s*\{[^}]*display:block/);
  assert.match(marketplaceCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?inset-block-end:\s*0/);
  const mobileActionDecision = marketplaceCss.slice(marketplaceCss.lastIndexOf("/* Keep mobile property cards focused"));
  assert.match(mobileActionDecision, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{\s*display:\s*none !important;/);
  assert.doesNotMatch(mobileActionDecision, /^\s*\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{\s*display:\s*none !important;/m);
});

test("shared mobile cards keep their actions in one horizontally scrollable row", () => {
  assert.match(marketplaceCss, /\.pcard > \.pcard-media > \.pcard-actions \.property-actions,[\s\S]*?\.pcard > \.pcard-media > \.pcard-actions \.property-actions-compact\s*\{[\s\S]*?display:\s*flex !important;[\s\S]*?flex-wrap:\s*nowrap !important;[\s\S]*?overflow-x:\s*auto !important/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions \.property-action\s*\{[\s\S]*?flex-basis:\s*44px/);
});

test("property photo actions use a floating glass dock with clear button states", () => {
  const dock = marketplaceCss.slice(marketplaceCss.indexOf("/* Final cascade guard: a compact floating action dock"));
  assert.match(dock, /\.pcard > \.pcard-media > \.pcard-actions \.property-actions,[\s\S]*?width:\s*fit-content;[\s\S]*?border-radius:\s*15px;[\s\S]*?background:\s*rgb\(255 255 255 \/ 91%\);[\s\S]*?backdrop-filter:\s*blur\(12px\)/);
  assert.match(dock, /\.pcard > \.pcard-media > \.pcard-actions \.property-action:hover\s*\{[\s\S]*?transform:\s*translateY\(-2px\)/);
  assert.match(dock, /\.pcard > \.pcard-media > \.pcard-actions \.property-action\.is-active\s*\{/);
  assert.match(dock, /\.pcard > \.pcard-media > \.pcard-actions \.property-action:focus-visible\s*\{/);
  assert.match(dock, /@media \(max-width:\s*1024px\)[\s\S]*?\.pcard > \.pcard-media > \.pcard-actions \.property-action\s*\{\s*flex-basis:\s*44px;\s*width:\s*44px;\s*height:\s*44px;\s*min-height:\s*44px/);
  assert.match(dock, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("phone list cards keep a readable image, key facts and a single swipeable action row", () => {
  const finalPhoneLayout = responsiveHardeningCss.slice(
    responsiveHardeningCss.lastIndexOf("/* One fixed, compact geometry for every marketplace mobile list card."),
  );
  assert.match(finalPhoneLayout, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-link\s*\{[^}]*display:\s*flex;[^}]*width:\s*calc\(100% - clamp\(92px,\s*28vw,\s*112px\)\);[^}]*height:\s*132px;[^}]*margin-inline-start:\s*clamp\(92px,\s*28vw,\s*112px\)/);
  assert.match(finalPhoneLayout, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list \.pcard-body\s*\{[^}]*height:\s*132px/);
  const gridModeStart = marketplaceCss.indexOf("/* Premium photo-first cards");
  const phoneCardStackingStart = marketplaceCss.lastIndexOf("  .pcard-mobile-list > .pcard-media {", gridModeStart);
  const phoneCardStacking = marketplaceCss.slice(phoneCardStackingStart, gridModeStart);
  assert.match(phoneCardStacking, /\.pcard-mobile-list > \.pcard-media\s*\{[^}]*z-index:\s*0/);
  assert.match(phoneCardStacking, /\.pcard-mobile-list > \.pcard-link\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/);
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
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media\s*\{[^}]*height:\s*clamp\(180px,\s*20vw,\s*250px\);[^}]*min-height:\s*clamp\(180px,\s*20vw,\s*250px\);/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-image-link img\s*\{\s*object-fit:\s*cover/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-actions\s*\{[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard \.pcard-price-row\s*\{[^}]*background:\s*#f6f8f5/);
  assert.match(gridPolish, /\.pf-page \.pf-grid\.is-grid-view > \.pcard \.pcard-specs\s*\{[^}]*background:\s*#faf8f4/);
  assert.match(gridPolish, /@media \(max-width:\s*720px\)[\s\S]*?\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media\s*\{[^}]*height:\s*clamp\(170px,\s*48vw,\s*210px\);[^}]*min-height:\s*clamp\(170px,\s*48vw,\s*210px\);/);
  assert.match(gridPolish, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("property marketplace opens in a desktop grid and keeps the compact mobile default", () => {
  assert.match(propertiesRoute, /useState<"grid" \| "list" \| "split">\("grid"\)/);
  assert.match(propertiesRoute, /const media = window\.matchMedia\("\(max-width: 720px\)"\)[\s\S]*?setViewMode\(media\.matches \? "list" : "grid"\)/);
  assert.match(propertiesRoute, /function showAllPropertiesWithoutMapBounds\(\)[\s\S]*?setViewMode\("grid"\)/);
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

test("mobile list cards keep every property photo in the same compact frame", () => {
  const compactMobileList = responsiveHardeningCss.slice(
    responsiveHardeningCss.lastIndexOf("/* One fixed, compact geometry for every marketplace mobile list card."),
  );
  assert.match(compactMobileList, /@media \(max-width:\s*720px\)/);
  assert.match(compactMobileList, /\.pf-page:has\(\.pf-grid\.is-list-view\)\s*\{[^}]*padding-bottom:\s*calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list\s*\{[^}]*grid-template-rows:\s*132px;[^}]*height:\s*132px;[^}]*max-height:\s*132px/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-link\s*\{[^}]*width:\s*calc\(100% - clamp\(92px,\s*28vw,\s*112px\)\);[^}]*height:\s*132px;[^}]*margin-inline-start:\s*clamp\(92px,\s*28vw,\s*112px\)/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-media\s*\{[^}]*height:\s*132px;[^}]*max-height:\s*132px/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-media > \.pcard-image-link picture,[\s\S]*?height:\s*132px;[^}]*object-fit:\s*cover/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list \.pcard-body\s*\{[^}]*grid-template-rows:\s*16px 2\.45em 22px 18px 16px;[^}]*height:\s*132px/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list \.pcard-title\s*\{[^}]*-webkit-line-clamp:\s*2/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list \.pcard-specs span:nth-child\(n \+ 4\)/);
});

test("mobile list cards can scroll fully clear of the fixed bottom action dock", () => {
  const compactMobileList = marketplaceCss.slice(
    marketplaceCss.lastIndexOf("/* Mobile list cards use one compact, fixed photo frame"),
  );
  assert.match(compactMobileList, /\.pf-page\s*\{\s*padding-bottom:\s*calc\(96px \+ env\(safe-area-inset-bottom\)\) !important;/);
  assert.match(compactMobileList, /\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list\s*\{[^}]*scroll-margin-block-end:\s*calc\(80px \+ env\(safe-area-inset-bottom\)\)/);
});

test("homepage shared cards retain the compact RTL list and 44px image action overlay on phones", () => {
  const homeMobile = homePropertyCss.slice(homePropertyCss.indexOf("/* The homepage showcase uses the same compact RTL list-card rhythm"));
  assert.match(homeMobile, /\.site-home \.property-showcase \.pcard-mobile-list\s*\{\s*grid-template-rows:\s*minmax\(168px, auto\)/);
  assert.match(homeMobile, /\.site-home \.property-showcase \.pcard-mobile-list \.pcard-unit-price\s*\{\s*display:\s*none/);
  assert.match(marketplaceCss, /\.site-home \.property-showcase \.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*100%/);
  assert.match(marketplaceCss, /\.pcard-mobile-list > \.pcard-media > \.pcard-actions \.property-action\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-height:\s*44px/);
});

test("mobile property cards hide the crowded action dock", () => {
  const mobileActionDecision = marketplaceCss.slice(marketplaceCss.lastIndexOf("/* Keep mobile property cards focused"));
  assert.match(mobileActionDecision, /@media \(max-width:\s*720px\)[\s\S]*?\.pf-page \.pf-grid\.is-list-view > \.pcard\.pcard-mobile-list > \.pcard-media > \.pcard-actions\s*\{\s*display:\s*none !important;/);
});

test("mobile photo-grid action docks stay inside the card and keep scrollable 44px controls", () => {
  const mobileGridActions = marketplaceCss.slice(marketplaceCss.lastIndexOf("/* Mobile photo-grid actions stay inside the image frame"));
  assert.match(mobileGridActions, /@media \(max-width:\s*720px\)/);
  assert.match(mobileGridActions, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-actions\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*hidden/);
  assert.match(mobileGridActions, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-actions \.property-actions(?:-compact)?\s*\{[^}]*flex:\s*1 1 100%;[^}]*width:\s*100%;[^}]*overflow-x:\s*auto/);
  assert.match(mobileGridActions, /\.pf-page \.pf-grid\.is-grid-view > \.pcard > \.pcard-media > \.pcard-actions \.property-action\s*\{[^}]*flex:\s*0 0 44px;[^}]*width:\s*44px;[^}]*min-width:\s*44px/);
});

test("map-side property cards use the canonical Hirmand navy, brass and paper palette", () => {
  const mapBrandRules = responsiveHardeningCss.slice(
    responsiveHardeningCss.lastIndexOf("/* Map-side property cards use the canonical Hirmand Navy / Brass / Paper palette. */"),
  );
  assert.ok(mapBrandRules, "the final responsive stylesheet must define the map-card brand treatment");
  assert.match(mapBrandRules, /\.pf-page \.pf-map-card-row\.is-active\s*\{[^}]*background:\s*var\(--brass-100\) !important;[^}]*box-shadow:\s*inset -3px 0 0 var\(--brass-500\) !important;/);
  assert.match(mapBrandRules, /\.pf-page \.pf-map-divar-layout \.pf-map-item\.is-active\s*\{[^}]*background:\s*var\(--navy-900\) !important;[^}]*color:\s*#fff !important;/);
  assert.match(mapBrandRules, /\.pf-page \.pf-map-item-price\s*\{\s*color:\s*var\(--brass-700\) !important;/);
  assert.match(mapBrandRules, /\.pf-page \.pf-map-item-open\s*\{[^}]*background:\s*var\(--brass-100\) !important;[^}]*color:\s*var\(--brass-800\) !important;/);
});
