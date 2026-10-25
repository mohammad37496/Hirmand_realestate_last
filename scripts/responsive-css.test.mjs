import assert from "node:assert/strict";
import fs from "node:fs";
import testRunner from "node:test";

const mobileFixes = fs.readFileSync(new URL("../src/mobile-device-fixes.css", import.meta.url), "utf8");
const uiClarityCss = fs.readFileSync(new URL("../src/ui-clarity.css", import.meta.url), "utf8");
const themeProCss = fs.readFileSync(new URL("../src/theme-pro.css", import.meta.url), "utf8");
const propertyDetailCss = fs.readFileSync(new URL("../src/property-detail-pro.css", import.meta.url), "utf8");
const propertyDetailRedesignCss = fs.readFileSync(new URL("../src/property-detail-redesign.css", import.meta.url), "utf8");
const propertyDetailLightCss = fs.readFileSync(new URL("../src/property-detail-light-theme.css", import.meta.url), "utf8");
const propertyFiltersCss = fs.readFileSync(new URL("../src/properties-pro.css", import.meta.url), "utf8");
const propertyFiltersRedesignCss = fs.readFileSync(new URL("../src/properties-filters-redesign.css", import.meta.url), "utf8");
const adminMatchingCss = fs.readFileSync(new URL("../src/admin-matching.css", import.meta.url), "utf8");
const adminMobileManagementCss = fs.readFileSync(new URL("../src/admin-mobile-management.css", import.meta.url), "utf8");
const adminPropertyQualityCss = fs.readFileSync(new URL("../src/admin-property-quality.css", import.meta.url), "utf8");
const areasDirectoryCss = fs.readFileSync(new URL("../src/areas-directory.css", import.meta.url), "utf8");
const propertiesDivarCss = fs.readFileSync(new URL("../src/properties-divar-redesign.css", import.meta.url), "utf8");
const propertyExpertRequestsCss = fs.readFileSync(new URL("../src/property-expert-requests.css", import.meta.url), "utf8");
const propertyPriceHistoryCss = fs.readFileSync(new URL("../src/property-price-history.css", import.meta.url), "utf8");
const propertyVerificationStampCss = fs.readFileSync(new URL("../src/property-verification-stamp.css", import.meta.url), "utf8");
const propertyDecisionToolsCss = fs.readFileSync(new URL("../src/property-decision-tools.css", import.meta.url), "utf8");
const propertyScenarioToolsCss = fs.readFileSync(new URL("../src/property-scenario-tools.css", import.meta.url), "utf8");
const globalCss = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const rootRoute = fs.readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const responsiveSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
const propertiesRoute = fs.readFileSync(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");
const dealRoomCss = fs.readFileSync(new URL("../src/property-deal-room.css", import.meta.url), "utf8");
const documentPackCss = fs.readFileSync(new URL("../src/property-document-pack.css", import.meta.url), "utf8");
const questionLogCss = fs.readFileSync(new URL("../src/property-question-log.css", import.meta.url), "utf8");
const renovationTrackerCss = fs.readFileSync(new URL("../src/property-renovation-tracker.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const propertiesMarketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");
const propertyDetailMobileCss = fs.readFileSync(new URL("../src/property-detail-mobile-redesign.css", import.meta.url), "utf8");
const propertyDetailV2Css = fs.readFileSync(new URL("../src/property-detail-page.css", import.meta.url), "utf8");
const propertyGalleryMobileCss = fs.readFileSync(new URL("../src/property-gallery-mobile.css", import.meta.url), "utf8");
const propertyDetailLuxuryCss = fs.readFileSync(new URL("../src/property-detail-page-luxury.css", import.meta.url), "utf8");
const propertyExperienceRedesignCss = fs.readFileSync(new URL("../src/property-experience-redesign.css", import.meta.url), "utf8");
const browserSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
const propertyDetailViewSource = fs.readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");

testRunner.test("property marketplace mobile refinement stays scoped and below tablet widths", () => {
  const marker = "/* Final mobile pass for the /properties marketplace only. Keep desktop rules intact. */";
  const mobilePass = responsiveCss.slice(responsiveCss.indexOf(marker));
  const mobilePassWithoutRouteScopedRoot = mobilePass.replace(/html:has\(\.pf-page\)\s*\{[^}]*\}/g, "");
  assert.ok(mobilePass.length > 0, "the final marketplace mobile pass must be present");
  assert.match(mobilePass, /@media\s*\(max-width:\s*620px\)/);
  assert.match(mobilePass, /@media\s*\(max-width:\s*380px\)/);
  assert.match(mobilePass, /@media\s*\(min-width:\s*621px\)/);
  assert.doesNotMatch(mobilePassWithoutRouteScopedRoot, /(^|[},]\s*)(?:html|body|#root|\.site-nav|\.property-detail-page)\s*[,{]/m,
    "the final refinement must not style the global shell or other page routes");
  assert.match(rootRoute, /propertiesMarketplacePolishCss[\s\S]*propertyExperienceRedesignCss[\s\S]*responsiveHardeningCss/,
    "mobile marketplace refinements must load after the page's base marketplace CSS");
  assert.match(mobilePass, /html:has\(\.pf-page\)\s*\{\s*scrollbar-gutter:\s*auto;\s*\}/,
    "the mobile marketplace must reclaim the global stable scrollbar gutter without changing other routes");
  assert.match(propertiesRoute, /if\s*\(window\.matchMedia\("\(max-width:\s*620px\)"\)\.matches\)\s*setViewMode\("list"\)/,
    "mobile visitors should land on property listings while retaining the map as an explicit view");
  assert.match(propertiesRoute, /className="pf-filter-clear-all"/,
    "the active-filter reset control should have a stable selector for accessible mobile sizing");
  assert.match(mobilePass, /\.pf-filter-overview \.pf-filter-clear-all \{[^}]*min-height: 44px !important;/s,
    "the active-filter reset control should remain a 44px target on narrow phones");
});

testRunner.test("property marketplace mobile cards keep full-width image ratios and touch actions", () => {
  const marker = "/* Final mobile pass for the /properties marketplace only. Keep desktop rules intact. */";
  const mobilePass = responsiveCss.slice(responsiveCss.indexOf(marker));
  assert.match(mobilePass, /\.pf-page\s+\.pf-grid\s*>\s*\.pcard\s+\.pcard-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10;[^}]*min-height:\s*0;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-grid\s*>\s*\.pcard\s+\.pcard-media\s+img\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*object-fit:\s*cover;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-grid\.is-list-view\s*>\s*\.pcard\s+\.pcard-media\s+img\s*\{[^}]*height:\s*100%;/s,
    "mobile list cards must fill the 16:10 media frame instead of retaining the legacy fixed 205px image height");
  assert.match(mobilePass, /\.pf-page\s+\.pf-grid\s*>\s*\.pcard\s*>\s*\.pcard-actions\s*\{[^}]*position:\s*static;[^}]*border-top:/s,
    "mobile property actions should not cover the listing photo");
  assert.match(mobilePass, /\.pf-page\s+\.pf-grid\s*>\s*\.pcard\s+\.pcard-actions\s+\.property-action\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*min-height:\s*44px;/s,
    "each mobile listing action should have a 44px touch target");
  assert.match(mobilePass, /\.pf-page\s+\.pf-more\s+\.btn-ghost\s*\{[^}]*min-height:\s*44px;/s);
});

testRunner.test("property marketplace mobile controls retain working search, filter, sort and view handlers", () => {
  assert.match(propertiesRoute, /value=\{q\}\s+onChange=\{\(e\) => setQ\(e\.target\.value\)\}/s,
    "search must remain bound to the existing query state");
  assert.match(propertiesRoute, /onClick=\{\(\) => setMobileFiltersOpen\(true\)\}/,
    "the filter drawer must remain reachable from the mobile toolbar");
  assert.match(propertiesRoute, /value=\{sort\}\s+onChange=\{\(e\) => setSort\(e\.target\.value as PropertySort\)\}/s,
    "sorting must remain connected to the existing state");
  assert.match(propertiesRoute, /onClick=\{\(\) => setViewMode\("list"\)\}[\s\S]*?onClick=\{\(\) => setViewMode\("grid"\)\}[\s\S]*?onClick=\{\(\) => setViewMode\("split"\)\}/s,
    "list, grid and map mode controls must remain interactive");
  assert.match(propertiesMarketplaceCss, /\.pf-page\s+\.pf-grid\.is-list-view\s*>\s*\.pcard/,
    "the existing list-mode card styling must remain available on larger screens");
  assert.match(responsiveSmoke, /mobileMarketplace\.rootWidth\s*<\s*mobileMarketplace\.viewportWidth\s*-\s*1/,
    "the browser smoke must detect a root width that leaves a blank strip beside the mobile viewport");
  assert.match(responsiveSmoke, /mobileMarketplace\.activeViewIndex\s*!==\s*0\s*\|\|\s*mobileMarketplace\.hasMap/,
    "the browser smoke must verify that the initial mobile state shows listings rather than the map");
  assert.match(responsiveSmoke, /viewButtons\.nth\(2\)\.click\(\)[\s\S]*?viewButtons\.nth\(0\)\.click\(\)/,
    "the browser smoke must exercise map-to-list mode switching");
});

testRunner.test("property marketplace mobile map and horizontal tool strips have bounded scrolling", () => {
  const marker = "/* Final mobile pass for the /properties marketplace only. Keep desktop rules intact. */";
  const mobilePass = responsiveCss.slice(responsiveCss.indexOf(marker));
  assert.match(mobilePass, /\.pf-page\s+\.pf-quick\s*\{[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-tools\s*\{[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-map-divar-layout\s+\.pf-map-panel\s*\{[^}]*height:\s*min\(48vh,\s*390px\);/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-map-divar-layout\s+\.pf-map-canvas\s*\{[^}]*min-height:\s*280px;[^}]*height:\s*100%;/s);
});
testRunner.test("mobile property gallery suppresses duplicate and legacy zoom controls", () => {
  assert.match(
    propertyGalleryMobileCss,
    /\.property-gallery-open:not\(\.hd-gallery-expand\)[^{]*,\s*html[\s\S]*?\.hd-gallery-stage\s*>\s*\.hd-gallery-expand\s*~\s*\.hd-gallery-expand\s*\{[^}]*display:\s*none\s*!important;/is,
    "mobile gallery must hide legacy-only zoom controls and any repeated expand button",
  );
  assert.doesNotMatch(
    propertyGalleryMobileCss,
    /\.hd-gallery-expand\s*\{[^}]*inset:\s*auto auto 8px 8px\s*!important/is,
    "the obsolete conflicting bottom-left zoom-button placement must be removed",
  );
});

testRunner.test("mobile property specifications use a compact two-column layout", () => {
  const mobileSpecStyles = propertyGalleryMobileCss.slice(
    propertyGalleryMobileCss.indexOf("Compact property specifications: two legible columns on phone screens"),
  );
  assert.match(
    mobileSpecStyles,
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.property-specs-accordion-body\.hd-spec-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important;/is,
    "property specifications must render in two columns on mobile",
  );
  assert.match(
    mobileSpecStyles,
    /\.property-specs-accordion-body\.hd-spec-grid\s*>\s*\.hd-spec-item\s*\{[^}]*min-height:\s*70px\s*!important;[\s\S]*?border-radius:\s*12px\s*!important;/is,
    "each mobile spec should use a compact, distinct card",
  );
  assert.match(
    mobileSpecStyles,
    /\.property-specs-accordion-body\.hd-spec-grid\s*>\s*\.hd-spec-item\s*>\s*strong\s*\{[^}]*font-size:\s*12px\s*!important;/is,
    "mobile spec values must remain readable without inflating row height",
  );
});

testRunner.test("mobile property gallery hides the expand icon and keeps the zoom label", () => {
  assert.doesNotMatch(
    propertyGalleryMobileCss,
    /\.hd-gallery-stage\s*>\s*\.hd-gallery-expand\.property-gallery-open\s*\{[^}]*display:\s*none\s*!important;/is,
    "the zoom button itself must stay visible on mobile",
  );
  assert.match(
    propertyGalleryMobileCss,
    /\.property-gallery-main\.hd-gallery-main\s+\.hd-gallery-expand\s*\.hd-gallery-expand-icon\s*\{[^}]*display:\s*none\s*!important;/is,
    "the expand icon must be hidden on mobile",
  );
  assert.match(
    propertyGalleryMobileCss,
    /\.property-gallery-main\.hd-gallery-main\s+\.hd-gallery-expand\s*\.hd-gallery-expand-label\s*\{[^}]*display:\s*inline\s*!important;/is,
    "the zoom label must remain visible on mobile",
  );
  assert.match(
    propertyGalleryMobileCss,
    /\.property-gallery-main\.hd-gallery-main\s+\.hd-gallery-expand\s*\{[^}]*height:\s*44px\s*!important;[\s\S]*?padding:\s*0 12px\s*!important;/is,
    "the mobile zoom button must remain a readable, touch-sized text control",
  );
  assert.equal(
    (propertyDetailViewSource.match(/className="hd-gallery-expand property-gallery-open"/g) ?? []).length,
    1,
    "there must be exactly one zoom button in the property-gallery markup",
  );
});

testRunner.test("property gallery has one zoom control without a duplicate hover tooltip", () => {
  const zoomButtonMarker = 'className="hd-gallery-expand property-gallery-open"';
  assert.equal(
    (propertyDetailViewSource.match(/className="hd-gallery-expand property-gallery-open"/g) ?? []).length,
    1,
    "the property gallery must expose exactly one zoom/fullscreen control",
  );
  const zoomButtonStart = propertyDetailViewSource.indexOf(zoomButtonMarker);
  const zoomButtonStartTag = propertyDetailViewSource.lastIndexOf("<button", zoomButtonStart);
  const zoomButtonEnd = propertyDetailViewSource.indexOf("</button>", zoomButtonStart);
  assert.ok(zoomButtonStartTag >= 0 && zoomButtonEnd > zoomButtonStart, "the zoom control must be a valid button element");
  const zoomButtonSource = propertyDetailViewSource.slice(zoomButtonStartTag, zoomButtonEnd);
  assert.match(zoomButtonSource, /aria-label="نمایش تصویر در اندازهٔ بزرگ"/, "the zoom control must remain accessible");
  assert.doesNotMatch(zoomButtonSource, /\btitle=/, "the visible zoom label must not be duplicated by a native hover tooltip");
});

const verifyWorkflow = fs.readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");

testRunner.test("shared mobile styles do not hide root-level horizontal overflow", () => {
  assert.doesNotMatch(globalCss, /html\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is);
  assert.doesNotMatch(globalCss, /body\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is);
  assert.doesNotMatch(mobileFixes, /html\s*\{[^}]*overflow-x\s*:\s*hidden/is);
  assert.doesNotMatch(mobileFixes, /body\s*\{[^}]*overflow-x\s*:\s*hidden/is);
  assert.doesNotMatch(uiClarityCss, /body\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is,
    "the page body must not mask horizontal overflow on mobile");
  assert.doesNotMatch(uiClarityCss, /\.site-home\s*\{\s*overflow\s*:\s*clip/is,
    "the home page wrapper must not clip descendants to conceal layout overflow");
  assert.doesNotMatch(themeProCss, /html\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is,
    "html must expose root-level horizontal overflow for diagnosis");
  assert.doesNotMatch(themeProCss, /body\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is,
    "body must expose root-level horizontal overflow for diagnosis");
});

testRunner.test("ordinary Persian text is not subject to global anywhere wrapping", () => {
  assert.match(mobileFixes, /word-break:\s*normal;/);
  assert.match(mobileFixes, /overflow-wrap:\s*break-word;/);
  assert.doesNotMatch(
    mobileFixes,
    /(?:p|span|a)\s*\{[^}]*overflow-wrap:\s*anywhere/is,
  );
  assert.match(responsiveCss, /word-break:\s*normal;/);
  assert.match(responsiveCss, /letter-spacing:\s*normal;/);
  assert.match(responsiveCss, /\.property-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    "the neighborhood detail grid must collapse to one column on mobile");
  assert.match(responsiveCss, /\.commission-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    "finance widgets must not keep a 240px desktop side column on phones");
  assert.match(responsiveCss, /\.budget-matcher\s+\.budget-matcher-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    "the budget hero must keep a readable Persian text column at tablet widths");
  assert.match(responsiveCss, /\.action-menu\.floating-call-menu\s*\{[^}]*position:\s*fixed\s*!important/is,
    "the desktop floating contact menu must not stretch as a relative action menu");

  assert.match(propertyDecisionToolsCss, /@media\s*\(max-width:1600px\)\s*\{[^}]*\.property-decision-grid\s*\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/is,
    "financial decision cards must not remain in six narrow columns at desktop widths");
  assert.match(propertyScenarioToolsCss, /\.property-score-stars button\s*\{[^}]*width:40px;[^}]*height:40px;[^}]*min-width:40px;[^}]*min-height:40px/is,
    "five-star scoring buttons need accessible mobile touch targets");
  assert.match(responsiveCss, /\.customer-property-draft-status\s*>\s*button\s*\{[^}]*min-height:\s*40px/is,
    "clearing a saved draft must be a usable touch target");

  assert.doesNotMatch(propertyDetailCss, /\.property-detail-summary-head h1\s*\{[^}]*overflow-wrap\s*:\s*anywhere/is,
    "property titles must not allow arbitrary character-level wrapping");
  assert.match(propertyDetailCss, /\.property-detail-summary-head h1\s*\{[^}]*overflow-wrap\s*:\s*break-word/is);
  assert.match(propertyDetailCss, /\.property-detail-summary-head h1\s*\{[^}]*word-break\s*:\s*normal/is);
  assert.match(propertyDetailCss, /\.property-detail-summary-head h1\s*\{[^}]*letter-spacing\s*:\s*normal/is);
  for (const [file, name] of [
    [propertyDetailRedesignCss, "property-detail-redesign.css"],
    [propertyDetailLightCss, "property-detail-light-theme.css"],
  ]) {
    const titleRule = file.match(/\.property-detail-page\s+\.property-detail-title-block h1\s*\{[^}]*\}/is)?.[0] ?? "";
    assert.ok(titleRule, `${name} should define the property title rule`);
    assert.doesNotMatch(titleRule, /overflow-wrap\s*:\s*anywhere/i,
      `${name} must not split Persian titles between arbitrary characters`);
    assert.match(titleRule, /overflow-wrap\s*:\s*break-word/i);
    assert.match(titleRule, /word-break\s*:\s*normal/i);
    assert.match(titleRule, /letter-spacing\s*:\s*normal/i);
  }
  const filterOptionRule = propertyFiltersCss.match(/\.pf-spec-option\s*>\s*span:last-child\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(filterOptionRule, "the property filter option label rule should exist");
  assert.doesNotMatch(filterOptionRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(filterOptionRule, /overflow-wrap\s*:\s*break-word/i);
  assert.match(filterOptionRule, /word-break\s*:\s*normal/i);
  const adminRequestTextRule = adminMatchingCss.match(/\.admin-matching-request-grid strong\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(adminRequestTextRule, "admin matching request text rule should exist");
  assert.doesNotMatch(adminRequestTextRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(adminRequestTextRule, /overflow-wrap\s*:\s*break-word/i);
  assert.match(adminRequestTextRule, /word-break\s*:\s*normal/i);
  const adminDetailTextRule = adminMatchingCss.match(/\.admin-matching-detail-grid strong\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(adminDetailTextRule, "admin matching detail text rule should exist");
  assert.doesNotMatch(adminDetailTextRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(adminDetailTextRule, /overflow-wrap\s*:\s*break-word/i);
  assert.match(adminDetailTextRule, /word-break\s*:\s*normal/i);
  assert.doesNotMatch(adminMobileManagementCss, /overflow-wrap\s*:\s*anywhere/i,
    "mobile admin text and metadata must prefer natural word wrapping");
  assert.match(adminMobileManagementCss, /overflow-wrap\s*:\s*break-word/i);
  assert.doesNotMatch(adminPropertyQualityCss, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(adminPropertyQualityCss, /overflow-wrap\s*:\s*break-word/i);
  const neighborhoodNameRule = areasDirectoryCss.match(/\.areas-neighborhood-name\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(neighborhoodNameRule, "neighborhood names should have a scoped text-wrap rule");
  assert.doesNotMatch(neighborhoodNameRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(neighborhoodNameRule, /overflow-wrap\s*:\s*break-word/i);
  const mapPopupTitleRule = propertiesDivarCss.match(/\.pf-map-popup\s*>\s*strong\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(mapPopupTitleRule, "map popup title rule should exist");
  assert.doesNotMatch(mapPopupTitleRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(mapPopupTitleRule, /overflow-wrap\s*:\s*break-word/i);
  const validationMessageRule = propertiesDivarCss.match(/\.pf-filter-validation-error span\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(validationMessageRule, "validation message rule should exist");
  assert.doesNotMatch(validationMessageRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(validationMessageRule, /overflow-wrap\s*:\s*break-word/i);
  const modalDescriptionRule = propertyExpertRequestsCss.match(/\.property-expert-request-dialog-head p\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(modalDescriptionRule, "expert request modal description rule should exist");
  assert.doesNotMatch(modalDescriptionRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(modalDescriptionRule, /overflow-wrap\s*:\s*break-word/i);
  const historyChangeRule = propertyPriceHistoryCss.match(/\.property-price-history-change strong\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(historyChangeRule, "property price history value rule should exist");
  assert.doesNotMatch(historyChangeRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(historyChangeRule, /overflow-wrap\s*:\s*break-word/i);
  const verificationCopyRule = propertyVerificationStampCss.match(/\.property-verification-stamp-copy p\s*\{[^}]*\}/is)?.[0] ?? "";
  assert.ok(verificationCopyRule, "property verification text rule should exist");
  assert.doesNotMatch(verificationCopyRule, /overflow-wrap\s*:\s*anywhere/i);
  assert.match(verificationCopyRule, /overflow-wrap\s*:\s*break-word/i);
});

testRunner.test("two-field spec ranges split evenly instead of collapsing a label", () => {
  assert.match(
    propertyFiltersRedesignCss,
    /\.pf-range:not\(:has\(> i\)\)\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    "ranges without a separator must not leave the second field in the auto-width separator column",
  );
});

testRunner.test("the mobile neighborhood dialog escapes the filter drawer stacking context", () => {
  assert.match(propertiesRoute, /import\s*\{\s*createPortal\s*\}\s*from ["']react-dom["']/);
  assert.match(propertiesRoute, /createPortal\([\s\S]*document\.body/);
  assert.match(responsiveCss, /\.pf-neighborhood-dialog-backdrop\s*\{[^}]*z-index:\s*13000/s);
  assert.match(responsiveCss, /\.pf-neighborhood-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)/s);
});

testRunner.test("compact property-detail actions keep touch-friendly hit areas on phones", () => {
  assert.match(dealRoomCss, /\.property-deal-room-check,\s*\.property-deal-room-remove\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px/s);
  assert.match(documentPackCss, /\.property-document-reset\s*\{[^}]*min-height:\s*40px/s);
  assert.match(questionLogCss, /\.property-question-top button\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px/s);
  assert.match(renovationTrackerCss, /\.property-renovation-row button\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px/s);
});

testRunner.test("property detail styles are route-scoped and legacy global detail layers are retired", () => {
  assert.match(rootRoute, /import responsiveHardeningCss from "\.\.\/mobile-responsive-hardening\.css\?url";/);
  assert.match(rootRoute, /<html lang="fa" dir="rtl"/);
  assert.match(propertyDetailViewSource, /import "@\/property-detail-page\.css";/);
  assert.ok(
    propertyDetailViewSource.indexOf('import "@/property-detail-page.css";') >
      propertyDetailViewSource.indexOf('import "@/property-deal-room.css";'),
    "detail styling must load after its preserved feature-widget styles",
  );
  for (const legacyName of [
    "propertyDetailMobileRedesignCss",
    "propertyDetailPremiumFinalCss",
    "propertyDetailIconsClarityCss",
    "propertyDetailSpecsRedesignCss",
  ]) {
    assert.doesNotMatch(rootRoute, new RegExp(legacyName), `${legacyName} must not be loaded globally`);
  }
  assert.match(propertyDetailV2Css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(propertyDetailV2Css, /\.hd-mobile-actions\s*\{[^}]*position:\s*fixed/s);
  assert.match(propertyDetailV2Css, /\.hd-gallery-stage\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/s);
});


testRunner.test("rebuilt property specifications keep Hirmand colors and responsive RTL layout", () => {
  assert.match(propertyDetailV2Css, /--hd-navy:\s*var\(--navy-800,\s*#12293f\)/);
  assert.match(propertyDetailV2Css, /\.hd-section\s*\{[^}]*background:\s*var\(--hd-card\)/s);
  assert.match(propertyDetailV2Css, /\.hd-spec-icon\s*\{[^}]*background:\s*#f5f0e7;[^}]*color:\s*var\(--hd-brass\)/s);
  assert.match(propertyDetailV2Css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(propertyDetailV2Css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(propertyDetailV2Css, /overflow-wrap:\s*anywhere/);
  assert.match(propertyDetailV2Css, /:focus-visible/);
  assert.match(propertyDetailViewSource, /className="property-specs-accordion hd-spec-accordion" open/);
  assert.match(propertyDetailViewSource, /className="property-spec-amenities hd-amenity-accordion"/);
  assert.match(propertyDetailViewSource, /import "@\/property-detail-page\.css";/);
});

testRunner.test("property detail uses one consistent icon treatment for specifications and amenities", () => {
  assert.match(propertyDetailV2Css, /\.hd-spec-icon\s*\{[^}]*background:\s*#f5f0e7;[^}]*color:\s*var\(--hd-brass\)/s);
  assert.match(propertyDetailV2Css, /\.hd-feature-icon\s*\{[^}]*background:\s*#f8efdc;[^}]*color:\s*var\(--hd-navy\)/s);
  assert.match(propertyDetailViewSource, /className="hd-spec-icon"><Icon size=\{18\} aria-hidden="true" \/>/);
  assert.match(propertyDetailViewSource, /className="hd-feature-list"/);
  assert.match(propertyDetailViewSource, /getPropertyFeatureIcon\(feature\)/);
  assert.match(propertyDetailViewSource, /className="hd-feature-icon"/);
});

testRunner.test("Playwright responsive matrix includes all requested widths and key routes", () => {
  assert.match(browserSmoke, /const viewportMatrix = \[/, "browser smoke must use explicit width and height scenarios");
  for (const scenario of ["width: 320, height: 568", "width: 360, height: 640", "width: 375, height: 667", "width: 390, height: 844", "width: 412, height: 652", "width: 412, height: 732", "width: 430, height: 932", "width: 768, height: 1024", "width: 1024, height: 768", "width: 1280, height: 900", "width: 1440, height: 900", "width: 1920, height: 1080"]) {
    assert.ok(browserSmoke.includes(scenario), `responsive matrix should include ${scenario}`);
  }
  assert.match(browserSmoke, /const brokenWords = \[\]/, "browser smoke must inspect narrow Persian text elements");
  assert.match(browserSmoke, /smallTargets = \[\]/, "browser smoke must inspect touch target dimensions");
  assert.match(browserSmoke, /page\.screenshot\(/, "browser smoke must capture responsive screenshots");
  assert.match(browserSmoke, /"\/budget-match"/, "responsive screenshots should include the tablet budget hero");
  assert.match(browserSmoke, /await page\.waitForTimeout\(500\)/, "React filter drawer checks must allow hydration before clicking");
  assert.match(browserSmoke, /aria-expanded.*true/, "mobile filter smoke should verify that the button opened the drawer");
  assert.match(browserSmoke, /\.sr-only, \.visually-hidden, \.screen-reader-only/,
    "screen-reader-only text must not be misreported as visible letter-by-letter wrapping");
  assert.match(browserSmoke, /element: element\.tagName\.toLowerCase\(\)/,
    "text wrapping diagnostics should identify the affected selector");
  const responsiveStepIndex = verifyWorkflow.indexOf("node scripts/responsive-layout-smoke.mjs");
  const legacySmokeIndex = verifyWorkflow.indexOf("node scripts/browser-smoke.mjs");
  assert.ok(responsiveStepIndex >= 0 && legacySmokeIndex >= 0 && responsiveStepIndex < legacySmokeIndex,
    "responsive diagnostics should run before legacy browser smoke can fail");
  for (const route of [
    '"/"',
    '"/properties"',
    '"/areas"',
    '"/areas/شهرک-ولیعصر"',
    '"/submit-property"',
    '"/tools/commission"',
    '"/tools/deposit"',
    '"/tools/loan"',
    '"/tools/rahn-rent"',
    '"/admin"',
    '"/properties?minArea=-1"',
    '"/properties?q=عبارت-آزمایشی-بدون-نتیجه-۷۸۹۱۲۳"',
  ]) {
    assert.ok(browserSmoke.includes(route), `responsive test should cover ${route}`);
  }
});

testRunner.test("rebuilt mobile property gallery keeps media uncropped and thumbnails vertically stacked", () => {
  assert.match(propertyDetailV2Css, /\.hd-gallery-stage\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/s);
  assert.match(propertyDetailV2Css, /\.property-detail-page\.hd-property-detail-v2 \.hd-gallery-stage img\.hd-gallery-image,\s*\.property-detail-page\.hd-property-detail-v2 \.hd-gallery-stage video\.hd-gallery-video,[\s\S]*?object-fit:\s*contain\s*!important/s,
    "listing photos and videos must remain fully visible above legacy site-wide responsive rules");
  assert.match(propertyGalleryMobileCss, /\.hd-gallery-thumbs\s*\{[^}]*flex-direction:\s*column\s*!important/is,
    "the mobile gallery thumbnails should form a vertical list");
  assert.match(propertyGalleryMobileCss, /\.property-gallery-wrap\.hd-gallery-wrap\s*>\s*\.property-gallery\.hd-gallery\s*>\s*\.property-gallery-thumbs\.hd-gallery-thumbs\s*\{[^}]*position:\s*absolute\s*!important/s,
    "mobile thumbnails should float over the full-size image instead of adding page height");
  assert.match(propertyGalleryMobileCss, /\.property-gallery-thumbs\.hd-gallery-thumbs\s*\{[^}]*overflow-y:\s*auto\s*!important/s,
    "the compact thumbnail rail should scroll vertically to reach all property media");
  assert.match(propertyGalleryMobileCss, /\.property-gallery-thumbs\.hd-gallery-thumbs\s*>\s*\.hd-gallery-thumb\s*\{[^}]*min-height:\s*48px\s*!important/s,
    "each compact thumbnail must keep an accessible touch target");
  assert.match(propertyGalleryMobileCss, /\.hd-gallery-thumbs-heading,[\s\S]*?\.hd-gallery-thumb-status\s*\{[^}]*display:\s*none\s*!important/s,
    "mobile thumbnail headings, repeated descriptions and status icons should not consume space");
  assert.match(browserSmoke, /rail\.position !== "absolute"/,
    "browser smoke must confirm the compact rail overlays the main image");
  assert.match(browserSmoke, /rail\.scrollHeight > rail\.clientHeight/,
    "browser smoke must confirm off-screen thumbnails remain vertically reachable");
  assert.match(browserSmoke, /gallery\.thumb\.width < 44 \|\| gallery\.thumb\.height < 44/,
    "browser smoke must preserve minimum 44px thumbnail touch targets");
  assert.match(propertyDetailV2Css, /\.hd-gallery-thumbs\s*\{[^}]*flex-direction:\s*column/is,
    "the detail page mobile stylesheet must not define a horizontal rail");
  const v2GalleryStyles = [propertyGalleryMobileCss, propertyDetailLuxuryCss, propertyExperienceRedesignCss, propertyDetailV2Css].join("\n");
  assert.doesNotMatch(v2GalleryStyles, /\.hd-gallery-thumbs\s*\{[^}]*flex-direction:\s*row\s*!important[^}]*\}/is,
    "no mobile v2 thumbnail rule may restore a horizontal flex carousel");
  assert.doesNotMatch(v2GalleryStyles, /\.hd-gallery-thumbs\s*\{[^}]*grid-auto-flow:\s*column\s*!important[^}]*\}/is,
    "mobile thumbnail grid placement must flow down rows, never columns");
  assert.doesNotMatch(v2GalleryStyles, /\.hd-gallery-thumbs\s*\{[^}]*overflow-x:\s*auto\s*!important[^}]*\}/is,
    "the thumbnail list must not require horizontal scrolling");
  assert.match(propertyGalleryMobileCss, /grid-template-areas:\s*"main"\s*"thumbs"/,
    "the mobile gallery main image must precede the thumbnail list");
  assert.match(propertyGalleryMobileCss, /grid-auto-flow:\s*row\s*!important/);
  assert.match(propertyGalleryMobileCss, /grid-template-columns:\s*44px minmax\(0, 1fr\) 44px\s*!important/,
    "gallery navigation hit areas must reserve room for 44px buttons");
  assert.match(propertyGalleryMobileCss, /min-width:\s*44px\s*!important/);
  assert.match(propertyGalleryMobileCss, /\.hd-gallery-expand\s*\{[^}]*min-width:\s*44px\s*!important/is,
    "the mobile fullscreen control must have a 44px minimum hit area");
  assert.match(propertyGalleryMobileCss, /\.hd-gallery-controls > button\s*\{[^}]*min-width:\s*44px\s*!important/is,
    "the mobile previous/next controls must have 44px minimum hit areas");
  const galleryLightboxStyles = [propertyDetailV2Css, propertyDetailLuxuryCss, propertyExperienceRedesignCss].join("\n");
  assert.doesNotMatch(galleryLightboxStyles, /\.hd-lightbox-(?:prev|next|close)[^{]*\{[^}]*\b(?:width|min-width):\s*(?:38|42)px\b[^}]*\}/is,
    "mobile lightbox controls must not fall below the 44px touch target");
  assert.match(propertyDetailLuxuryCss, /@media \(max-width:\s*760px\)[\s\S]*?div\.property-gallery-wrap\.hd-gallery-wrap > div\.property-gallery\.hd-gallery\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/s,
    "the phone layout must override the high-specificity desktop gallery grid");
  assert.match(propertyDecisionToolsCss, /\.property-decision-metrics \.is-highlight\s*\{[^}]*flex-wrap:\s*wrap/s,
    "the savings label must wrap above long prices on phones");
  assert.match(propertyDetailV2Css, /\.hd-lightbox-media img,\s*\.hd-lightbox-media video\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(propertyDetailViewSource, /className="hd-video-thumb"/, "video thumbnails must have a visible play marker");
  assert.match(propertyDetailViewSource, /<Play size=\{14\} fill="currentColor" aria-hidden="true" \/>/,
    "the thumbnail marker must use a visible, decorative play icon");
  assert.doesNotMatch(propertyDetailViewSource, /تصویر نمونهٔ دسته‌بندی؛ عکس واقعی این ملک نیست|hd-gallery-fallback-note/,
    "the category fallback disclaimer must not be shown on property images");
});


testRunner.test("responsive guardrails load before the scoped final music-player layer", () => {
  const stylesheetLinks = [...rootRoute.matchAll(/\{ rel: "stylesheet", href: (\w+) \}/g)]
    .map((match) => match[1]);
  assert.equal(
    stylesheetLinks.at(-2),
    "responsiveHardeningCss",
    "the responsive guardrail stylesheet must remain the last general-purpose layer",
  );
  assert.equal(
    stylesheetLinks.at(-1),
    "musicPlayerCss",
    "the player-only final layer must load last to correct the dock without undoing other responsive guardrails",
  );
  assert.match(rootRoute, /import musicPlayerCss from "\.\.\/music-player\.css\?url";/);
});

testRunner.test("responsive browser smoke covers the required viewport matrix", () => {
  const matrix = responsiveSmoke.match(/const viewportMatrix = \[([\s\S]*?)\];/);
  assert.ok(matrix, "responsive smoke must define an explicit width/height viewport matrix");
  const pairs = [...matrix[1].matchAll(/width: (\d+), height: (\d+)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const required = [
    [320, 568], [360, 640], [375, 667], [390, 844],
    [412, 652], [412, 732], [430, 932],
    [768, 1024], [1024, 768],
    [1280, 900], [1440, 900], [1920, 1080],
  ];
  for (const [width, height] of required) {
    assert.ok(
      pairs.some((pair) => pair[0] === width && pair[1] === height),
      `responsive smoke is missing the ${width}x${height} viewport`,
    );
  }
  assert.match(responsiveSmoke, /await page\.setViewportSize\(\{ width, height \}\)/);
  assert.match(responsiveSmoke, /viewportMatrix\.length/);
  assert.ok(responsiveSmoke.includes("`${routeFileName(route)}-${width}x${height}.png`"));
});


testRunner.test("final reference-inspired mobile controls retain 44px touch targets", () => {
  const finalMobilePass = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final reference-inspired mobile layout for the /properties marketplace. */"));
  assert.match(finalMobilePass, /\.pf-page \.pf-grid > \.pcard \.pcard-actions \.property-action \{[^}]*width: 44px; height: 44px; min-height: 44px;/s,
    "the final reference card override must not shrink property action buttons below the touch target");
  assert.match(finalMobilePass, /\.pf-mobile-reference-field input,[\s\S]*?min-height: 44px;/s,
    "mobile search and numeric inputs must remain touch-friendly");
  assert.match(finalMobilePass, /\.pf-mobile-reference-actions button \{[^}]*min-height: 44px;/s,
    "mobile filter and reset actions must remain touch-friendly");
  assert.match(finalMobilePass, /\.pf-page \.pf-main \.pf-quick \.pf-chip \{[^}]*min-height: 44px !important;/s,
    "horizontally scrollable quick filters must remain easy to tap");
});

testRunner.test("mobile property marketplace follows compact reference-style stacked filters and horizontal RTL cards", () => {
  const finalPass = responsiveCss.slice(responsiveCss.lastIndexOf("/* Reference-aligned mobile marketplace pass:"));
  assert.match(finalPass, /\.pf-page \.pf-mobile-reference-filters \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important;/s,
    "mobile filters should stack in the compact reference flow");
  assert.match(finalPass, /\.pf-page \.pf-grid\.is-list-view > \.pcard \{[^}]*grid-template-columns: 118px minmax\(0, 1fr\) !important;[^}]*grid-template-areas: "media body" "actions actions"/s,
    "mobile list cards should place the image on the RTL leading side with details beside it");
  assert.match(finalPass, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-actions \.property-action \{[^}]*min-height: 44px !important;/s,
    "horizontal mobile cards must preserve 44px action targets");
});

testRunner.test("global music dock is compact and page-scoped over the mobile property list", () => {
  const finalPass = responsiveCss.slice(responsiveCss.lastIndexOf("/* Keep the global music dock from obscuring mobile listing cards; playback stays available. */"));
  assert.match(finalPass, /body:has\(\.pf-page\).*\.music-player-float-progress \{\s*display: none !important;/s,
    "the dock should hide its progress row to avoid obscuring the listing");
  const finalParityPass = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final parity pass: restore the reference's dark marketplace masthead"));
  assert.match(finalParityPass, /\.pf-page \.pf-hero \{[^}]*background: linear-gradient\(145deg, #193a55 0%, #0b1a2b 78%\) !important;/s,
    "the mobile marketplace masthead should retain the navy/gold reference hierarchy");
  assert.match(propertiesRoute, /className="pf-mobile-search-cta"[\s\S]*?\.pf-mobile-reference-query input[\s\S]*?\.focus\(\)/,
    "the reference-style gold search action should focus the real property search input");
  assert.match(finalParityPass, /\.pf-page \.pf-hero-copy p \{[^}]*display: block !important;/s,
    "the mobile hero should retain its explanatory copy like the reference page");
  assert.match(finalParityPass, /\.pf-page \.pf-mobile-reference-range \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important;/s,
    "mobile price and area ranges should follow the reference's single-column form rhythm");
  assert.match(finalParityPass, /\.pf-grid\.is-list-view > \.pcard \.pcard-actions \{[^}]*overflow-x: auto !important;/s,
    "property actions should stay on one compact horizontal strip instead of doubling card height");
  assert.match(finalParityPass, /\.pf-grid\.is-list-view > \.pcard \.pcard-actions \{[^}]*position: absolute !important;[^}]*top: auto !important;[^}]*bottom: 0 !important;[^}]*height: 52px !important;/s,
    "property actions should occupy the card's text column without adding a second full-width row");
  assert.match(finalParityPass, /\.pf-grid\.is-list-view > \.pcard \.pcard-actions \.property-actions(?:-compact)? \{[^}]*flex-wrap: nowrap !important;/s,
    "mobile property actions should remain horizontally reachable in a single row");
  assert.match(finalParityPass, /\.pf-grid\.is-list-view > \.pcard \.pcard-actions \.property-actions(?:-compact)? \{[^}]*display: flex !important;[^}]*position: static !important;[^}]*flex-wrap: nowrap !important;/s,
    "compact property actions must be a single scrollable flex row rather than a wrapping grid");
  assert.match(finalParityPass, /\.pf-grid\.is-list-view > \.pcard \.pcard-actions \.property-action \{[^}]*min-width: 44px !important;[^}]*min-height: 44px !important;/s,
    "property action controls must preserve 44px hit targets at narrow phone widths");
  assert.match(finalParityPass, /body:has\(\.pf-page\) \.action-menu\.floating-call-menu \{[^}]*left: auto !important;[^}]*right: 12px !important;[^}]*bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\) !important;/s,
    "the floating contact control should sit opposite the music dock and above the mobile navigation");
  assert.match(responsiveSmoke, /floating contact control leaves the safe area above mobile navigation/,
    "browser smoke should catch contact controls that overlap the bottom navigation");
  assert.match(finalParityPass, /\.pf-page \.pf-quick \.pf-chip \{ min-height: 44px !important; \}/,
    "quick filters should retain full-size touch targets on phones");
  assert.match(finalParityPass, /\.pf-page \.pf-views button \{ min-width: 44px !important; min-height: 44px !important; \}/,
    "view-switch buttons should retain full-size touch targets on phones");
  assert.match(responsiveSmoke, /primary listing controls below 44px touch targets/,
    "browser smoke should validate the primary marketplace controls, not only the music dock");
  assert.match(finalParityPass, /\.pcard-actions \.property-action \{[^}]*flex: 0 0 44px !important;[^}]*min-width: 44px !important;[^}]*min-height: 44px !important;/s,
    "mobile property action buttons must not shrink below the 44px touch target");
  assert.match(responsiveSmoke, /actionsBounds\.left < card\.mediaBounds\.right && card\.actionsBounds\.right > card\.mediaBounds\.left/,
    "the browser smoke must check actual action/photo overlap instead of rejecting all absolute positioning");
  assert.match(responsiveSmoke, /\.pcard-actions \.property-action/,
    "the responsive browser smoke must measure the real property action targets");
  assert.match(finalParityPass, /\.music-player-float:not\(\.music-player-float-empty\) \{[^}]*height: 54px !important;[^}]*min-height: 54px !important;/s,
    "the collapsed music dock should fit below the filter/category area without covering listing content");
  assert.match(finalParityPass, /\.music-player-float:not\(\.music-player-float-empty\) \{[^}]*width: 112px !important;/s,
    "the collapsed music dock should occupy only a small corner of the mobile listing");
  assert.match(finalParityPass, /\.music-player-float-meta,[\s\S]*?\.music-player-float-controls button:not\(\.music-player-float-play\) \{\s*display: none !important;/s,
    "the mobile mini-player should keep play and playlist controls while avoiding a wide overlay");
  assert.match(finalParityPass, /\.music-player-float-controls button \{[^}]*width: 44px !important;[^}]*height: 44px !important;/s,
    "the compact music dock must preserve 44px touch targets for playback controls");
  assert.match(finalParityPass, /\.music-player-utility \{[^}]*width: 44px !important;[^}]*height: 44px !important;/s,
    "the playlist toggle must retain a 44px touch target");
  assert.match(finalParityPass, /@media \(max-width: 380px\) \{[\s\S]*?grid-template-columns: 104px minmax\(0, 1fr\) !important;[\s\S]*?pcard-actions \{ inset-inline-start: 104px !important;/s,
    "the 320–380px card image and action column must stay aligned with the narrower image width");
});
