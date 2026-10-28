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
const desktopCardVisualQa = fs.readFileSync(new URL("./desktop-property-card-visual-qa.mjs", import.meta.url), "utf8");
const propertySearchBrowserSmoke = fs.readFileSync(new URL("./property-search-browser-smoke.mjs", import.meta.url), "utf8");
const propertiesRoute = fs.readFileSync(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");
const propertiesMapSource = fs.readFileSync(new URL("../src/components/hirmand/properties-map.tsx", import.meta.url), "utf8");
const dealRoomCss = fs.readFileSync(new URL("../src/property-deal-room.css", import.meta.url), "utf8");
const documentPackCss = fs.readFileSync(new URL("../src/property-document-pack.css", import.meta.url), "utf8");
const questionLogCss = fs.readFileSync(new URL("../src/property-question-log.css", import.meta.url), "utf8");
const renovationTrackerCss = fs.readFileSync(new URL("../src/property-renovation-tracker.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const musicPlayerCss = fs.readFileSync(new URL("../src/music-player.css", import.meta.url), "utf8");
const propertiesMarketplaceCss = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");
const propertiesHirmandSignatureCss = fs.readFileSync(new URL("../src/properties-hirmand-signature.css", import.meta.url), "utf8");
const propertiesMobileReferenceCss = fs.readFileSync(new URL("../src/properties-mobile-reference.css", import.meta.url), "utf8");
const propertyDetailV2Css = fs.readFileSync(new URL("../src/property-detail-page.css", import.meta.url), "utf8");
const propertyGalleryMobileCss = fs.readFileSync(new URL("../src/property-gallery-mobile.css", import.meta.url), "utf8");
const propertyDetailLuxuryCss = fs.readFileSync(new URL("../src/property-detail-page-luxury.css", import.meta.url), "utf8");
const propertyExperienceRedesignCss = fs.readFileSync(new URL("../src/property-experience-redesign.css", import.meta.url), "utf8");
const propertyCardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const browserSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
const propertyDetailViewSource = fs.readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");
const propertyQuestionLogSource = fs.readFileSync(new URL("../src/components/hirmand/property-question-log.tsx", import.meta.url), "utf8");
const propertyShowcaseSource = fs.readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");
const propertiesDataSource = fs.readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const packageJson = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");

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
  assert.match(propertiesRoute, /const mobileQuery = window\.matchMedia\("\(max-width:\s*620px\)"\)[\s\S]*?const applyResponsiveDefault = \(\) => \{\s*if\s*\(!userSelectedViewMode\.current\)\s*setViewMode\(mobileQuery\.matches\s*\?\s*"list"\s*:\s*"grid"\);\s*\}[\s\S]*?mobileQuery\.addEventListener\("change",\s*applyResponsiveDefault\)/,
    "mobile visitors should land on property listings even when a responsive preview changes viewport, while retaining the map as an explicit view");
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
  assert.deepEqual(
    [...responsiveCss.matchAll(/\.pf-grid\.is-list-view > \.pcard \.pcard-actions \{ inset-inline-start: (max\(112px, 36%\)) !important; \}/g)].map((match) => match[1]),
    ["max(112px, 36%)", "max(112px, 36%)"],
    "the narrow-phone action rail must track the photo's max(112px, 36%) column to avoid covering the image at every phone width",
  );
  assert.match(mobilePass, /\.pf-page\s+\.pf-more\s+\.btn-ghost\s*\{[^}]*min-height:\s*44px;/s);
});

testRunner.test("mobile listing cards keep all property actions in one horizontally scrollable touch rail", () => {
  const finalMobileCardRules = propertiesMobileReferenceCss.slice(
    propertiesMobileReferenceCss.lastIndexOf("/* Keep the mobile directory scan-friendly"),
  );
  assert.match(finalMobileCardRules, /grid-template-rows:\s*minmax\(138px,\s*auto\)\s+auto/);
  assert.match(finalMobileCardRules, /\.pcard-actions-footer\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(finalMobileCardRules, /\.property-actions(?:-compact)?\s*\{[^}]*flex-wrap:\s*nowrap[^}]*width:\s*max-content/s);
  assert.match(finalMobileCardRules, /\.property-action\s*\{[^}]*min-height:\s*44px/);
  assert.match(finalMobileCardRules, /body:has\(\.site-home\).*\.property-showcase \.property-grid > \.pcard \{[^}]*grid-template-rows:\s*minmax\(138px,\s*auto\)\s+auto/s,
    "homepage property cards should use the same compact two-column mobile rhythm");
  assert.match(finalMobileCardRules, /\.pcard-spec-built-year,[\s\S]*?\.pcard-spec-elevator\s*\{\s*display:\s*none/s,
    "secondary homepage specs should not force an excessively tall mobile card");
});

testRunner.test("property marketplace mobile controls retain working search, filter, sort and view handlers", () => {
  assert.match(propertiesRoute, /value=\{q\}\s+onChange=\{\(e\) => setQ\(e\.target\.value\)\}/s,
    "search must remain bound to the existing query state");
  assert.match(propertiesRoute, /onClick=\{\(\) => setMobileFiltersOpen\(true\)\}/,
    "the filter drawer must remain reachable from the mobile toolbar");
  assert.match(propertiesRoute, /value=\{sort\}\s+onChange=\{\(e\) => setSort\(e\.target\.value as PropertySort\)\}/s,
    "sorting must remain connected to the existing state");
  assert.match(propertiesRoute, /onClick=\{\(\) => \{\s*userSelectedViewMode\.current = true;\s*setViewMode\("list"\);\s*\}\}[\s\S]*?onClick=\{\(\) => \{\s*userSelectedViewMode\.current = true;\s*setViewMode\("grid"\);\s*\}\}[\s\S]*?onClick=\{\(\) => \{\s*userSelectedViewMode\.current = true;\s*setViewMode\("split"\);\s*\}\}/s,
    "list, grid and map mode controls must remain interactive");
  assert.match(propertiesRoute, /aria-pressed=\{viewMode === "list"\}[\s\S]*?aria-pressed=\{viewMode === "grid"\}[\s\S]*?aria-pressed=\{viewMode === "split"\}/s,
    "view mode buttons must expose their selected state to assistive technology");
  assert.match(propertiesMarketplaceCss, /\.pf-page\s+\.pf-grid\.is-list-view\s*>\s*\.pcard/,
    "the existing list-mode card styling must remain available on larger screens");
  assert.match(responsiveSmoke, /mobileMarketplace\.rootWidth\s*<\s*mobileMarketplace\.viewportWidth\s*-\s*1/,
    "the browser smoke must detect a root width that leaves a blank strip beside the mobile viewport");
  assert.match(responsiveSmoke, /mobileMarketplace\.activeViewIndex\s*!==\s*0\s*\|\|\s*mobileMarketplace\.hasMap/,
    "the browser smoke must verify that the initial mobile state shows listings rather than the map");
  assert.match(responsiveSmoke, /viewButtons\.nth\(2\)\.click\(\)[\s\S]*?viewButtons\.nth\(0\)\.click\(\)/,
    "the browser smoke must exercise map-to-list mode switching");
  assert.match(responsiveSmoke, /buttons\.length === 3 && buttons\[0\]\?\.getAttribute\("aria-pressed"\) === "true"/,
    "the browser smoke must wait for React hydration and the mobile default before clicking view controls");
  assert.match(responsiveSmoke, /card\.actionsBounds\.top < card\.mediaBounds\.bottom && card\.actionsBounds\.bottom > card\.mediaBounds\.top/,
    "photo/action overlap must be checked in both dimensions to avoid false positives for stacked grid cards");
});

testRunner.test("mobile homepage reclaims the stable scrollbar gutter and removes the oversized bottom-aligned hero", () => {
  assert.match(propertiesMobileReferenceCss, /@media \(max-width:\s*640px\)[\s\S]*?html:has\(\.site-home\)\s*\{\s*scrollbar-gutter:\s*auto !important;/,
    "the homepage must use the full mobile viewport width instead of leaving a stable-gutter strip");
  assert.match(propertiesMobileReferenceCss, /body:has\(\.site-home\) \.site-home \.hero-inner\s*\{[^}]*min-height:\s*0 !important;[^}]*justify-content:\s*flex-start !important;/s,
    "the mobile homepage hero must not retain a desktop-sized min-height and bottom-aligned content");
  assert.match(propertiesMobileReferenceCss, /body:has\(\.site-home\) \.site-home \.hero-search select\s*\{[^}]*grid-column:\s*auto !important;[^}]*height:\s*40px !important;[^}]*min-height:\s*40px !important;/s,
    "homepage search fields must use the compact two-column rhythm so fixed mobile docks do not cover the submit button on short phones");
  assert.match(responsiveSmoke, /homepageMobileGeometry\.rootWidth < homepageMobileGeometry\.viewportWidth - 1/,
    "the responsive browser smoke must fail if the homepage leaves a blank strip beside the viewport");
  assert.match(responsiveSmoke, /homepageMobileGeometry\.firstContentOffset > 32/,
    "the responsive browser smoke must detect excess blank space before mobile homepage hero content");
});

testRunner.test("mobile card visual QA tolerates only sub-hundredth-pixel Chromium rounding on 44px targets", () => {
  assert.match(desktopCardVisualQa, /button\.width >= 43\.99 && button\.height >= 43\.99/,
    "the visual QA should accept only subpixel rounding, not genuinely undersized touch targets");
});

testRunner.test("property marketplace mobile map and horizontal tool strips have bounded scrolling", () => {
  const marker = "/* Final mobile pass for the /properties marketplace only. Keep desktop rules intact. */";
  const mobilePass = responsiveCss.slice(responsiveCss.indexOf(marker));
  assert.match(mobilePass, /\.pf-page\s+\.pf-quick\s*\{[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-tools\s*\{[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain;/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-map-divar-layout\s+\.pf-map-panel\s*\{[^}]*height:\s*min\(48vh,\s*390px\);/s);
  assert.match(mobilePass, /\.pf-page\s+\.pf-map-divar-layout\s+\.pf-map-canvas\s*\{[^}]*min-height:\s*280px;[^}]*height:\s*100%;/s);
});

testRunner.test("property search browser smoke explicitly selects map view before checking map results", () => {
  assert.match(propertySearchBrowserSmoke, /async function openMapView\(page\)[\s\S]*?mapButton\.click\(\)[\s\S]*?\.pf-map-divar-layout/s,
    "map-result assertions should first switch to the actual map view instead of relying on a default mode");
  assert.equal((propertySearchBrowserSmoke.match(/await openMapView\((?:page|invalid|empty)\)/g) ?? []).length, 3,
    "fixture/shared URL, invalid filter and empty-result checks should all establish map view explicitly");
});

testRunner.test("property search browser smoke waits for the resolved empty state, not its loading placeholder", () => {
  assert.match(propertySearchBrowserSmoke, /const emptyState = empty\.locator\("\.pf-map-list-empty"\)\.filter\(\{ hasText: \/پیدا نشد\/ \}\);[\s\S]*?await emptyState\.waitFor\(\{ state: "visible", timeout: timeoutMs \}\)/,
    "no-match assertions should wait until the search request resolves to the explicit empty state");
});

testRunner.test("property-local question log hydrates before reading browser storage", () => {
  assert.match(propertyQuestionLogSource, /useState<QuestionItem\[]>\(\[\]\)/,
    "the question log must use the same initial rows for server and browser rendering");
  assert.match(propertyQuestionLogSource, /useEffect\(\(\) => \{\s*setItems\(readItems\(property\.id, defaults\)\);\s*setLoadedPropertyId\(property\.id\);\s*\}, \[property\.id, defaults\]\)/s,
    "saved questions should load after hydration and follow the active property");
  assert.match(propertyQuestionLogSource, /if \(loadedPropertyId !== property\.id\) return;[\s\S]*?localStorage\.setItem/,
    "the initial empty state must not overwrite the saved log before it has loaded");
  assert.doesNotMatch(propertyQuestionLogSource, /useState<QuestionItem\[]>\(\(\) => readItems\(property\)\)/,
    "browser-local storage must not be read by the initial render");
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
    stylesheetLinks.indexOf("responsiveHardeningCss") < stylesheetLinks.indexOf("propertiesMobileReferenceCss"),
    true,
    "the responsive guardrail stylesheet must load before the page-scoped mobile reference layer",
  );
  assert.equal(
    stylesheetLinks.at(-2),
    "propertiesMobileReferenceCss",
    "the dedicated mobile listing layer must remain immediately before the scoped music-player layer",
  );
  assert.equal(
    stylesheetLinks.at(-3),
    "responsiveHardeningCss",
    "the responsive guardrail stylesheet must remain after the general-purpose page layers",
  );
  assert.equal(
    stylesheetLinks.at(-1),
    "musicPlayerCss",
    "the player-only final layer must load last to correct the dock without undoing other responsive guardrails",
  );
  assert.match(rootRoute, /import musicPlayerCss from "\.\.\/music-player\.css\?url";/);
});

testRunner.test("mobile property directory matches the compact reference layout without replacing the listing implementation", () => {
  const mobileReferenceCss = fs.readFileSync(new URL("../src/properties-mobile-reference.css", import.meta.url), "utf8");
  assert.match(rootRoute, /import propertiesMobileReferenceCss from "\.\.\/properties-mobile-reference\.css\?url";/);
  assert.match(mobileReferenceCss, /@media \(max-width: 640px\)[\s\S]*?\.pf-page \.pf-hero[\s\S]*?linear-gradient\(145deg, #193b55 0%, #0b1a2b 76%\)/);
  assert.match(mobileReferenceCss, /\.pf-grid\.is-list-view > \.pcard[\s\S]*?grid-template-columns: 116px minmax\(0, 1fr\)/);
  assert.match(mobileReferenceCss, /\.pf-mobile-reference-range[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileReferenceCss, /\.pcard-actions \.property-action[\s\S]*?min-height: 40px !important/);
  assert.match(mobileReferenceCss, /@media \(max-width: 380px\)[\s\S]*?grid-template-columns: 102px minmax\(0, 1fr\)/);
});

testRunner.test("the final mobile reference card layout overrides legacy stacked-card rules", () => {
  const mobileReferenceCss = fs.readFileSync(new URL("../src/properties-mobile-reference.css", import.meta.url), "utf8");
  const finalContract = mobileReferenceCss.slice(mobileReferenceCss.lastIndexOf("/* Final mobile reference contract."));
  assert.match(finalContract, /body:has\(\.pf-page\) \.pf-page \.pf-grid\.is-list-view > \.pcard\s*\{[\s\S]*?grid-template-columns: 116px minmax\(0, 1fr\) !important;/,
    "the mobile list view must use a horizontal photo/details card at reference widths");
  assert.match(finalContract, /\.pcard > \.pcard-link\s*\{[\s\S]*?display: contents !important;/,
    "the card link must allow the image and details to occupy separate grid columns");
  assert.match(finalContract, /\.pcard > \.pcard-actions\s*\{[\s\S]*?grid-column: 1 \/ -1 !important;[\s\S]*?grid-row: 2 !important;/,
    "card actions must remain in a separate full-width row beneath the content");
  assert.match(finalContract, /\.property-qr-backdrop,[\s\S]*?\.property-brief-backdrop\s*\{[\s\S]*?z-index: 1000000 !important;/,
    "QR and property brief dialogs must appear above sticky listing controls");
  assert.match(finalContract, /\.property-qr-close\s*\{[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;/,
    "the QR dialog close control must remain touch-accessible on phones");
  const propertyActions = fs.readFileSync(new URL("../src/components/hirmand/property-actions.tsx", import.meta.url), "utf8");
  assert.equal((propertyActions.match(/createPortal\(/g) ?? []).length, 2,
    "QR and property brief dialogs must escape card stacking contexts through a body portal");
  assert.match(propertyActions, /createPortal\([\s\S]*?document\.body[\s\S]*?createPortal\([\s\S]*?document\.body/,
    "both listing-card dialogs must render at the document body level");
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
  const finalActionPass = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Final footer action contract for property cards:"));
  assert.match(finalActionPass, /\.pcard-footer-with-actions > \.pcard-actions\.pcard-actions-footer[\s\S]*?position: static !important;[\s\S]*?background: transparent !important;[\s\S]*?overflow-x: auto !important;/s,
    "listing actions must be a transparent, horizontally scrollable footer row, never an overlay on the photo");
  assert.match(finalActionPass, /\.property-actions(?:-compact)? \{[\s\S]*?flex-wrap: nowrap !important;[\s\S]*?width: max-content !important;/s,
    "the full action set must stay in one bounded horizontal row");
  assert.match(finalActionPass, /@media \(max-width: 1024px\)[\s\S]*?\.property-action \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/s,
    "touch layouts must retain 44px action targets after desktop styles load");
  assert.match(finalParityPass, /html:has\(\.pf-page\) body:has\(\.pf-page\) \.action-menu\.floating-call-menu \{[^}]*left: auto !important;[^}]*right: 12px !important;[^}]*bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\) !important;/s,
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
  assert.match(finalParityPass, /\.pf-page \.pf-grid\.is-list-view > \.pcard \.pcard-actions \{[^}]*padding: 4px 0 !important;/s,
    "the horizontally scrolling action strip must not clip the first 44px button with side padding");
  assert.match(finalParityPass, /\.property-actions(?:-compact)? \{[^}]*flex: 0 0 max-content !important;[^}]*width: max-content !important;/s,
    "the action group must retain its intrinsic width so it scrolls as one row");
  assert.match(responsiveSmoke, /actionsBounds\.left < card\.mediaBounds\.right && card\.actionsBounds\.right > card\.mediaBounds\.left/,
    "the browser smoke must check actual action/photo overlap instead of rejecting all absolute positioning");
  assert.match(responsiveSmoke, /\.pcard-actions \.property-action/,
    "the responsive browser smoke must measure the real property action targets");
  assert.match(finalParityPass, /\.music-player-float:not\(\.music-player-float-empty\) \{[^}]*height: 44px !important;[^}]*min-height: 44px !important;/s,
    "the collapsed music dock should use the smallest touch-safe height to reduce overlap with listing content");
  assert.match(finalParityPass, /\.music-player-float:not\(\.music-player-float-empty\) \{[^}]*width: 112px !important;/s,
    "the collapsed music dock should occupy only a small corner of the mobile listing");
  assert.match(finalParityPass, /\.music-player-float-meta,[\s\S]*?\.music-player-float-controls button:not\(\.music-player-float-play\) \{\s*display: none !important;/s,
    "the mobile mini-player should keep play and playlist controls while avoiding a wide overlay");
  assert.match(finalParityPass, /\.music-player-float-controls button \{[^}]*width: 44px !important;[^}]*height: 44px !important;/s,
    "the compact music dock must preserve 44px touch targets for playback controls");
  assert.match(finalParityPass, /\.music-player-utility \{[^}]*width: 44px !important;[^}]*height: 44px !important;/s,
    "the playlist toggle must retain a 44px touch target");
  assert.match(finalParityPass, /html:has\(\.pf-page\) body:has\(\.pf-page\) \.action-menu\.floating-call-menu \{[^}]*height: 44px !important;[^}]*min-height: 44px !important;[^}]*padding: 0 12px !important;/s,
    "the floating contact control should shrink to a 44px-high touch target instead of covering card actions");
  assert.match(responsiveSmoke, /if \(width <= 640\) \{\s*const contact = metrics\.floatingContact;[\s\S]*?floating controls exceed the 44px compact overlay height/s,
    "the 44px floating-control height requirement should be scoped to phones, preserving tablet and desktop player sizing");
  assert.match(responsiveSmoke, /if \(width <= 1024 && metrics\.pointerCoarse\) \{\s*const undersized = dock\.buttons\.filter/,
    "44px music-control touch targets should be enforced on phones and tablets without penalizing desktop mouse controls");
  assert.match(finalParityPass, /@media \(max-width: 380px\) \{[\s\S]*?grid-template-columns: 104px minmax\(0, 1fr\) !important;[\s\S]*?pcard-actions \{ inset-inline-start: max\(112px, 36%\) !important;/s,
    "the 320–380px card image and action column must stay aligned with the narrower image width");
  assert.match(responsiveCss, /@media \(min-width: 641px\) and \(max-width: 1024px\) \{[\s\S]*?music-player-float:not\(\.music-player-float-empty\) \{[\s\S]*?width: 112px !important;[\s\S]*?height: 54px !important;/s,
    "tablet and narrow-laptop listings should use the compact music dock too");
  assert.match(responsiveCss, /@media \(min-width: 641px\) and \(max-width: 1024px\) \{[\s\S]*?\.pf-page \.pcard-actions \.property-action \{[^}]*width: 44px !important;[^}]*min-width: 44px !important;[^}]*height: 44px !important;[^}]*min-height: 44px !important;/s,
    "tablet property action buttons should keep 44px targets without changing wide desktop cards");
  assert.match(responsiveCss, /@media \(min-width: 1025px\) \{[\s\S]*?music-player-float:not\(\.music-player-float-empty\) \{[\s\S]*?height: 84px !important;/s,
    "wide desktop listings should keep the full player while hiding the progress row and reducing height");
  assert.match(responsiveCss, /html:has\(\.pf-page\) body:has\(\.pf-page\) \.action-menu\.floating-call-menu \{\s*bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\) !important;/s,
    "the floating contact action should stay in the bottom corner opposite the music dock at every viewport");
});

testRunner.test("mobile grid mode remains distinct and the floating contact shortcut stays available", () => {
  const gridPass = responsiveCss.slice(responsiveCss.lastIndexOf("/* The grid/list toggle changes the card layout"));
  assert.match(gridPass, /\.pf-page \.pf-grid:not\(\.is-list-view\) > \.pcard > \.pcard-link \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important;/s,
    "grid mode should restore a vertical image-first card instead of inheriting horizontal list layout");
  assert.match(gridPass, /\.pf-page \.pf-grid:not\(\.is-list-view\) > \.pcard \.pcard-media \{[^}]*aspect-ratio: 16 \/ 10 !important;/s,
    "grid mode should give listing images a stable landscape ratio");
  const finalMobile = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final mobile listing treatment:"));
  assert.match(finalMobile, /\.action-menu\.floating-call-menu \{[^}]*display: flex !important;/s,
    "the listing redesign must preserve the floating contact shortcut");
  assert.doesNotMatch(finalMobile, /\.action-menu\.floating-call-menu\s*\{[^}]*display:\s*none\s*!important;/s,
    "the listing page must not hide the floating contact shortcut on phones");
});

testRunner.test("listing and homepage action rails stay in the footer, clear of images and links", () => {
  const finalActionPass = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Final footer action contract for property cards:"));
  assert.match(finalActionPass, /\.pf-grid > \.pcard > \.pcard-footer-with-actions > \.pcard-actions\.pcard-actions-footer,[\s\S]*?position: static !important;[\s\S]*?inset: auto !important;[\s\S]*?transform: none !important;/s,
    "the final action wrapper must remain in footer flow and never overlay the image");
  assert.match(propertyShowcaseSource, /<div className="pcard-visual">[\s\S]*?<\/div>\s*<Link[\s\S]*?className="pcard-link pcard-copy-link"[\s\S]*?<div className="pcard-footer pcard-footer-with-actions"[\s\S]*?className="pcard-actions pcard-actions-footer"/,
    "the homepage and marketplace must keep the operations in the shared footer rather than the image region");
  const compactPass = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final mobile listing treatment:"));
  assert.match(compactPass, /body:has\(\.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\) \{[^}]*width: 112px !important;[^}]*height: 44px !important;/s,
    "the home music dock must collapse to a compact mobile control so it does not cover listing prices");
  assert.match(compactPass, /body:has\(\.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\) \{[^}]*left: auto !important;[^}]*right: 0 !important;/s,
    "the compact home music dock should sit over the image column rather than the price text");
  assert.match(compactPass, /body:has\(\.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\) \.music-player-float-controls \.music-player-float-play \{[^}]*width: 44px !important;[^}]*height: 44px !important;/s,
    "the compact home music dock must retain an accessible play target");
  assert.match(propertyShowcaseSource, /property\.builtYear\.toLocaleString\("fa-IR"\)[\s\S]*?ساخت/,
    "property cards should show the construction year when the listing has one");
  assert.match(propertiesDataSource, /built_year, parking, elevator, price, deposit, rent/,
    "the public property-card query must provide the construction year to both card layouts");
});

testRunner.test("all property card views keep the full action rail in a scrollable footer", () => {
  const footerStart = propertyShowcaseSource.indexOf('<div className="pcard-footer pcard-footer-with-actions">');
  const actionStart = propertyShowcaseSource.indexOf('<div className="pcard-actions pcard-actions-footer"', footerStart);
  assert.ok(footerStart >= 0 && actionStart > footerStart, "the action rail must be inside the shared footer");
  assert.doesNotMatch(propertyShowcaseSource, /pcard-actions-list-overlay/, "the photo overlay rail must be retired from the actual card component");
  assert.match(propertyShowcaseSource.slice(footerStart), /className="pcard-actions pcard-actions-footer"[\s\S]*?<PropertyActions property=\{property\} compact \/>/,
    "all existing action handlers must remain mounted in the footer");
  const finalActionPass = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Final footer action contract for property cards:"));
  assert.match(finalActionPass, /\.pcard-footer-with-actions > \.pcard-actions\.pcard-actions-footer[\s\S]*?overflow-x: auto !important;/s,
    "all card views must provide internal horizontal scrolling instead of squeezing buttons");
  assert.match(finalActionPass, /@media \(max-width: 1024px\)[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;/s,
    "mobile and tablet rails must preserve the full 44px touch target");
});

testRunner.test("desktop list cards separate navigation content and footer actions into distinct grid rows", () => {
  const desktopList = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Final desktop list-card contract for /properties."), propertiesMobileReferenceCss.lastIndexOf("/* Final footer action contract for property cards:"));
  assert.match(desktopList, /\.pf-grid\.is-list-view > \.pcard\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) 72px !important;/s,
    "desktop/tablet list cards must reserve a separate 72px footer track");
  assert.match(desktopList, /\.pf-grid\.is-list-view > \.pcard > \.pcard-visual\s*\{[\s\S]*?grid-row:\s*1 \/ span 2 !important;/s,
    "the property image must span both rows without overlapping the footer column");
  assert.match(desktopList, /\.pf-grid\.is-list-view > \.pcard > \.pcard-copy-link\s*\{[\s\S]*?grid-row:\s*1 !important;[\s\S]*?height:\s*auto !important;/s,
    "the stretched property navigation link must be confined to the content row");
  assert.match(desktopList, /\.pf-grid\.is-list-view > \.pcard > \.pcard-footer-with-actions\s*\{[\s\S]*?grid-row:\s*2 !important;[\s\S]*?height:\s*72px !important;/s,
    "the footer and action rail must occupy only the second grid row");
});

testRunner.test("list-card footer has an intrinsic grid track so card clipping cannot hide it", () => {
  assert.match(propertiesMarketplaceCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard\s*\{[^}]*grid-template-rows:\s*minmax\(228px,\s*auto\)\s+auto;[^}]*overflow:\s*hidden;/s,
    "the list card must reserve an intrinsic first row before its footer row while retaining rounded-edge clipping");
  assert.match(propertyExperienceRedesignCss, /\.pf-page \.pf-grid\.is-list-view > \.pcard > \.pcard-footer-with-actions\s*\{[^}]*grid-row:\s*2;[^}]*display:\s*grid;[^}]*min-width:\s*0;/s,
    "the location, details link and operations must share a content-sized footer track");
  assert.match(propertyExperienceRedesignCss, /\.pcard-footer-with-actions \.pcard-actions-footer\s*\{[^}]*position:\s*static;[^}]*grid-column:\s*1\s*\/\s*-1;/s,
    "the operations container must stay in footer flow instead of overlaying or escaping the card track");
  assert.match(propertiesMobileReferenceCss, /\.pcard-footer-with-actions \.pcard-details-link\s*\{[^}]*display:\s*inline-flex\s*!important;[^}]*white-space:\s*normal\s*!important;/s,
    "the mobile list footer must show a wrapping details link beside the property location");
  assert.match(propertiesMobileReferenceCss, /\.pcard-footer-with-actions \.pcard-location\s*\{[^}]*overflow:\s*visible\s*!important;[^}]*text-overflow:\s*clip\s*!important;/s,
    "the mobile footer location must wrap instead of being ellipsized or clipped");
});

testRunner.test("mobile property card content stays readable beside the compact action rail", () => {
  const finalCardContract = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final card contract for phones:"));
  assert.match(finalCardContract, /@media \(max-width: 620px\)/);
  assert.match(finalCardContract, /\.pcard-title \{[^}]*display: block !important;[^}]*overflow: visible !important;[^}]*-webkit-line-clamp: unset !important;[^}]*overflow-wrap: anywhere !important;/s,
    "long Persian property titles should wrap naturally instead of being clipped to two lines");
  assert.match(finalCardContract, /\.pcard-price-row \{[^}]*min-width: 0 !important;[^}]*max-width: 100% !important;/s,
    "purchase and rent price rows should stay inside narrow cards");
  assert.match(finalCardContract, /\.pcard-specs \.pcard-spec \{[^}]*white-space: normal !important;[^}]*overflow-wrap: anywhere !important;/s,
    "cards with variable numbers of specifications should wrap without horizontal overflow");
  assert.match(propertyShowcaseSource, /<div className="pcard-body">[\s\S]*?<\/div>\s*<\/Link>\s*<div className="pcard-footer pcard-footer-with-actions">/,
    "the footer and its action buttons must sit outside the property link to preserve valid interactive markup");
});

testRunner.test("the last compact-phone override preserves 44px property action targets", () => {
  const compactPhoneOverride = responsiveCss.slice(responsiveCss.lastIndexOf("/* Compact property-card action rail on phones:"));
  assert.match(compactPhoneOverride, /\.property-action \{[^}]*height: 44px !important;[^}]*min-height: 44px !important;/s,
    "the final <=640px override must not shrink action buttons below the shared 44px touch target");
  assert.doesNotMatch(compactPhoneOverride, /\.property-action \{[^}]*height: 3[68]px !important;/s,
    "late compact styles must not silently override the accessible action height");
});

testRunner.test("desktop grid and home cards keep action rails separate from property photos", () => {
  const desktopActionRail = responsiveCss.slice(responsiveCss.lastIndexOf("/* Desktop grid cards also keep their action rail in normal flow."));
  assert.match(desktopActionRail, /@media \(min-width: 721px\)/);
  assert.ok(desktopActionRail.includes(".pf-grid:not(.is-list-view) > .pcard > .pcard-actions"),
    "the desktop grid action rail needs an explicit non-list-view selector");
  assert.ok(desktopActionRail.includes(".property-grid:not(.is-list-view) > .pcard > .pcard-actions"),
    "homepage showcase actions need an explicit non-list-view selector");
  assert.match(desktopActionRail, /position: relative !important;\s*inset: auto !important;/s,
    "desktop grid action rails should stay in normal flow rather than overlaying property photos");
  assert.match(desktopActionRail, /\.property-action \{[^}]*height: 44px !important;[^}]*min-height: 44px !important;/s,
    "desktop grid action controls should remain comfortably clickable");
});

testRunner.test("property card action icons stay legible above decorative layers", () => {
  const iconGuard = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final icon legibility guard:"));
  assert.ok(iconGuard.length > 0, "the final icon legibility guard must remain the last CSS layer");
  assert.match(iconGuard, /\.pcard > \.pcard-actions \.property-action svg \{[^}]*opacity: 1 !important;[^}]*visibility: visible !important;[^}]*stroke: currentColor !important;/s,
    "property action SVGs must remain visible and inherit the high-contrast action color");
  assert.match(iconGuard, /\.pcard > \.pcard-actions::before,[\s\S]*?content: none !important;[\s\S]*?display: none !important;/s,
    "decorative pseudo-elements must not cover the action rail");
});

testRunner.test("the final shared action contract wins the cascade for desktop list cards too", () => {
  const finalContract = responsiveCss.slice(responsiveCss.lastIndexOf("/* Final shared action contract:"));
  assert.ok(finalContract.length > 0, "the shared action contract must be the final CSS layer");
  assert.match(finalContract, /\.pf-grid:is\(\.is-list-view, :not\(\.is-list-view\)\) > \.pcard > \.pcard-actions \.property-action,\s*body:has\(\.property-showcase\)[\s\S]*?min-width: 44px !important;\s*min-height: 44px !important;/s,
    "all property action buttons must keep a 44px minimum target in both listing views");
  assert.match(finalContract, /\.property-action:focus-visible[\s\S]*?outline: 2px solid #c08a2a !important;/,
    "the final action layer must preserve a visible Hirmand-gold keyboard focus ring");
  assert.match(responsiveSmoke, /actionLinkOverlap[\s\S]*?mediaActionOverlap[\s\S]*?undersizedActions/,
    "browser smoke must measure link/action and photo/action overlap plus computed target sizes");
});

testRunner.test("property introduction dialogs are styled on listing pages and remain printable", () => {
  assert.match(rootRoute, /propertyCardCss/,
    "property card and action dialog styles must be included in the global route stylesheet links");
  assert.match(propertyCardCss, /\.property-brief-backdrop\s*\{[^}]*position: fixed !important;[^}]*z-index: 99999 !important;/s,
    "the property introduction dialog opened from a listing card must overlay card action rails and sticky navigation");
  assert.match(propertyCardCss, /\.property-brief-close\s*\{[^}]*width: 44px;[^}]*height: 44px;/s,
    "the dialog close button must have a touch-friendly hit area");
  assert.match(propertyCardCss, /@media print[\s\S]*?body:has\(\.property-brief-dialog\) \.property-brief-dialog,\s*body:has\(\.property-brief-dialog\) \.property-brief-dialog \*/,
    "printing a property introduction must isolate the brief from the listing page");
});

testRunner.test("desktop Hirmand card polish keeps the footer action rail bounded", () => {
  const desktopCardPolish = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Desktop property cards: a deliberate information hierarchy"));
  assert.match(desktopCardPolish, /@media\s*\(min-width:\s*768px\)/,
    "desktop card refinements must be isolated from mobile and tablet rules");
  assert.match(desktopCardPolish, /\.pf-grid:not\(\.is-list-view\)\s*>\s*\.pcard\s*>\s*\.pcard-footer\s*>\s*\.pcard-actions,[\s\S]*?\{[^}]*position:\s*static;[^}]*grid-column:\s*1\s*\/\s*-1;/s,
    "grid-view actions must occupy their own footer row rather than overlay the property photo");
  assert.match(desktopCardPolish, /\.pcard-footer \.property-action\s*\{[^}]*flex:\s*0\s+0\s+30px;[^}]*height:\s*32px;/s,
    "desktop grid actions must use coordinated, bounded button dimensions");
  assert.match(desktopCardPolish, /@media\s*\(min-width:\s*1024px\)[\s\S]*?body:has\(\.pf-page\) \.music-player-float:not\(\.music-player-float-empty\)\s*\{[^}]*position:\s*static !important;/s,
    "the global music dock must leave listing-card footers unobstructed on desktop without changing tablet behavior");
  assert.match(desktopCardPolish, /@media\s*\(max-width:\s*1199px\)[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    "narrow desktop cards must wrap eight actions into a four-column rail instead of overflowing");
  assert.match(desktopCardPolish, /\.pf-grid\.is-list-view\s*>\s*\.pcard\s*>\s*\.pcard-footer-with-actions[\s\S]*?\.pcard-actions-footer\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s,
    "list-view actions must remain in a separate footer row");
  assert.match(packageJson, /"test:property-card-visual":\s*"node scripts\/property-card-local-browser\.test\.mjs visual"/,
    "the desktop visual QA must be repeatable against the local app and isolated property fixtures through an npm script");
  const desktopListPolish = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Desktop list view: compact, editorial property rows"));
  assert.match(desktopListPolish, /^\/\* Desktop list view:[\s\S]*?@media\s*\(min-width:\s*1024px\)/,
    "the editorial list-row redesign must be scoped to desktop widths and leave tablet/mobile layout rules intact");
  assert.match(desktopListPolish, /grid-template-columns:\s*clamp\(220px,\s*23vw,\s*290px\)\s+minmax\(0,\s*1fr\)/,
    "desktop list cards must use a controlled landscape image column and a flexible readable information column");
  assert.match(desktopListPolish, /\.pcard-footer-with-actions[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
    "desktop list footers must reserve separate space for location/details and the action rail");
  assert.match(desktopListPolish, /\.pcard-footer-with-actions \.property-action\s*\{[^}]*width:\s*36px !important;[^}]*min-width:\s*36px !important;[^}]*height:\s*36px !important;/s,
    "the compact desktop footer must keep all eight action targets large enough to use comfortably");
});

testRunner.test("responsive browser smoke follows the real nested card-footer action DOM", () => {
  assert.match(responsiveSmoke, /\.pcard-footer-with-actions > \.pcard-actions, \.pcard-footer > \.pcard-actions, \.pcard-actions/,
    "action geometry must be measured from the actual footer-nested PropertyCard structure");
  assert.match(responsiveSmoke, /card\.querySelectorAll\("\.pcard-actions \.property-action"\)/,
    "operation counting must not require actions to be direct children of the article");
  assert.match(responsiveSmoke, /const expectedButtons = 8/,
    "the browser smoke must require all eight operations in every view and viewport");
  assert.match(responsiveSmoke, /if \(width <= 1024 && card\.undersizedActions\.some/,
    "the 44px hit-area contract should apply to touch devices, not shrink desktop mouse controls");
  assert.match(responsiveSmoke, /dock\.position === "fixed" && \(dock\.left/,
    "only a fixed music dock should be checked against viewport bounds; desktop flow placement can extend below the fold");
});

testRunner.test("opening the map does not silently turn its default viewport into a property filter", () => {
  assert.match(propertiesMapSource, /const hasUserAdjustedViewport = useRef\(false\)/,
    "map bounds should only be persisted after an explicit viewport interaction");
  assert.match(propertiesMapSource, /if \(!viewportReady \|\| !hasUserAdjustedViewport\.current\) return/,
    "mounting the map must not emit default bounds that hide listings when returning to list mode");
  assert.match(propertiesMapSource, /hasUserAdjustedViewport\.current = true;[\s\S]*?setView\(\(current\) => \(\{/,
    "user-driven zooming must continue to persist the intentional map viewport");
});

testRunner.test("tablet property action buttons stay 44px after desktop card styling loads", () => {
  const tabletFinal = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Tablet widths are still touch-first."));
  assert.match(tabletFinal, /@media \(min-width: 641px\) and \(max-width: 1024px\)/);
  assert.match(tabletFinal, /\.pf-grid:not\(\.is-list-view\) > \.pcard > \.pcard-footer-with-actions \.pcard-actions \.property-action,[\s\S]*?\.pf-grid\.is-list-view > \.pcard > \.pcard-footer-with-actions \.pcard-actions \.property-action,[\s\S]*?\.property-grid > \.pcard > \.pcard-footer-with-actions \.pcard-actions \.property-action \{[^}]*width: 44px !important;[^}]*min-width: 44px !important;[^}]*height: 44px !important;[^}]*min-height: 44px !important;/s,
    "high-specificity tablet touch targets must override desktop grid/list footer rules that shrink buttons to 29/36px");
  assert.match(tabletFinal, /\.pcard-footer-with-actions \.pcard-actions \{[^}]*overflow-x: auto !important;/s,
    "tablet action rails must scroll internally so 44px controls do not expand the card or page width");
  assert.match(tabletFinal, /\.pcard-footer-with-actions \.property-actions \{[^}]*display: flex !important;[^}]*flex-wrap: nowrap !important;/s,
    "tablet action controls must remain in a single horizontal row instead of wrapping into extra card height");
});

testRunner.test("empty music-player status cannot intercept unrelated page controls", () => {
  assert.match(musicPlayerCss, /html body \.music-player-float-empty\s*\{\s*pointer-events: none !important;\s*\}[\s\S]*?html body \.music-player-float-empty button\s*\{\s*pointer-events: auto !important;\s*\}/,
    "the empty/loading player surface should let clicks pass through while its own controls remain interactive");
});


testRunner.test("mobile map result cards use the Hirmand navy-and-gold signature", () => {
  const mapTheme = propertiesMobileReferenceCss.slice(propertiesMobileReferenceCss.lastIndexOf("/* Final Hirmand mobile map-card theme:"));
  assert.ok(mapTheme.length > 0, "map results need a final Hirmand theme layer");
  assert.match(mapTheme, /\.pf-page \.pf-map-card-row\.is-active\s*\{[^}]*#c08a2a/s, "active map rows must use Hirmand gold accents");
  assert.match(mapTheme, /\.pf-page \.pf-map-item-price\s*\{[^}]*color:\s*#0b1a2b/s, "map prices must use the Hirmand navy palette");
  assert.match(mapTheme, /\.pf-page \.pf-map-divar-layout \.pf-map-item-open\s*\{[^}]*background:\s*#0b1a2b !important;[^}]*color:\s*#f5d995 !important/s, "details action must use navy with gold text");
  assert.match(mapTheme, /:focus-visible[\s\S]*?outline:\s*2px solid #c08a2a/, "map controls must keep a visible Hirmand-gold focus ring");
});


testRunner.test("responsive browser matrix covers the requested mobile, tablet, laptop and desktop widths", () => {
  const matrix = responsiveSmoke.slice(
    responsiveSmoke.indexOf("const viewportMatrix = ["),
    responsiveSmoke.indexOf("];", responsiveSmoke.indexOf("const viewportMatrix = [")),
  );
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1366, 1440, 1920]) {
    assert.ok(matrix.includes(`width: ${width},`), `missing responsive viewport width: ${width}px`);
  }
});

testRunner.test("gold surfaces use the navy foreground for readable contrast", () => {
  const skipLinkRule = globalCss.match(/\.skip-link\s*\{[^}]*\}/s)?.[0] ?? "";
  const primaryButtonRule = globalCss.match(/\.btn-gold\s*\{[^}]*\}/s)?.[0] ?? "";
  assert.match(skipLinkRule, /background:\s*var\(--gold\);/);
  assert.match(skipLinkRule, /color:\s*var\(--fg\);/,
    "the keyboard skip link must use a dark foreground on the gold background");
  assert.match(primaryButtonRule, /background:\s*var\(--gold-soft\);/);
  assert.match(primaryButtonRule, /color:\s*var\(--fg\);/,
    "primary gold buttons must use a dark foreground so their labels remain readable");
});

testRunner.test("global UI respects the reduced-motion accessibility preference", () => {
  const reducedMotion = globalCss.slice(globalCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reducedMotion.length > 0, "shared styles must define a reduced-motion fallback");
  assert.match(reducedMotion, /animation-duration:\s*0\.01ms\s*!important;/);
  assert.match(reducedMotion, /animation-iteration-count:\s*1\s*!important;/);
  assert.match(reducedMotion, /transition-duration:\s*0\.01ms\s*!important;/);
  assert.match(reducedMotion, /scroll-behavior:\s*auto\s*!important;/);
});

testRunner.test("responsive browser smoke records console errors and fails on app runtime/network errors", () => {
  assert.ok(responsiveSmoke.includes('page.on("console"'), "browser smoke must collect console errors");
  assert.ok(responsiveSmoke.includes('page.on("requestfailed"'), "browser smoke must observe failed requests");
  assert.ok(responsiveSmoke.includes('page.on("response"'), "browser smoke must observe HTTP server errors");
  assert.ok(responsiveSmoke.includes("same-origin server errors"), "same-origin HTTP 5xx responses must fail the run");
  assert.ok(responsiveSmoke.includes("failed same-origin requests"), "same-origin request failures must fail the run");
  assert.ok(responsiveSmoke.includes("uncaught browser errors"), "uncaught page errors must fail the run");
});



testRunner.test("gold foreground combinations meet WCAG AA normal-text contrast", () => {
  const rootVars = globalCss.match(/:root\s*\{([^}]*)\}/s)?.[1] ?? "";
  const foreground = rootVars.match(/--fg:\s*(#[0-9a-f]{6})/i)?.[1];
  const gold = rootVars.match(/--gold:\s*(#[0-9a-f]{6})/i)?.[1];
  const goldSoft = rootVars.match(/--gold-soft:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(foreground && gold && goldSoft, "the global palette must expose concrete colors for contrast checks");

  const luminance = (hex) => {
    const channels = hex.slice(1).match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16) / 255) ?? [];
    assert.equal(channels.length, 3);
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };

  assert.ok(contrast(foreground, gold) >= 4.5, "skip-link text must meet WCAG AA on the gold accent");
  assert.ok(contrast(foreground, goldSoft) >= 4.5, "primary button text must meet WCAG AA on the gold-soft fill");
});


testRunner.test("responsive smoke includes property request and digital business card routes", () => {
  const routeBlock = responsiveSmoke.slice(
    responsiveSmoke.indexOf("const routes = ["),
    responsiveSmoke.indexOf("];", responsiveSmoke.indexOf("const routes = [")),
  );
  assert.ok(routeBlock.includes('"/request-property"'), "property request form must be covered by browser smoke");
  assert.ok(routeBlock.includes('"/card"'), "digital business card must be covered by browser smoke");
});


testRunner.test("property ad-copy handles denied clipboard permission", () => {
  const propertyActions = fs.readFileSync(new URL("../src/components/hirmand/property-actions.tsx", import.meta.url), "utf8");
  const copyHandler = propertyActions.slice(
    propertyActions.indexOf("function copyPropertyAdText"),
    propertyActions.indexOf("function readCompare"),
  );
  assert.ok(copyHandler.includes(".catch("), "clipboard rejection must be handled");
  assert.ok(copyHandler.includes("toast.error("), "users must receive feedback when clipboard access is denied");
});



testRunner.test("bedroom and bathroom filters use two equal columns", () => {
  assert.match(
    propertiesRoute,
    /<div className="pf-range pf-range-two">\\s*<label className="pf-field">\\s*<span>حداقل خواب<\\/span>[\\s\\S]*?<\\/label>\\s*<label className="pf-field">\\s*<span>حداقل حمام<\\/span>[\\s\\S]*?<\\/label>\\s*<\\/div>/,
    "the bedroom/bathroom pair must not use the generic three-column range layout",
  );
  assert.match(
    responsiveCss,
    /\\.pf-page \\.pf-range\\.pf-range-two\\s*\\{[^}]*grid-template-columns:\\s*repeat\\(2,\\s*minmax\\(0,\\s*1fr\\)\\)/s,
    "both Persian field labels must receive an equal-width desktop/tablet track",
  );
});
