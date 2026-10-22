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
const propertyDetailMobileCss = fs.readFileSync(new URL("../src/property-detail-mobile-redesign.css", import.meta.url), "utf8");
const propertyDetailV2Css = fs.readFileSync(new URL("../src/property-detail-page.css", import.meta.url), "utf8");
const propertyGalleryMobileCss = fs.readFileSync(new URL("../src/property-gallery-mobile.css", import.meta.url), "utf8");
const propertyDetailLuxuryCss = fs.readFileSync(new URL("../src/property-detail-page-luxury.css", import.meta.url), "utf8");
const propertyExperienceRedesignCss = fs.readFileSync(new URL("../src/property-experience-redesign.css", import.meta.url), "utf8");
const browserSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
const propertyDetailViewSource = fs.readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");
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
  assert.match(propertyDetailV2Css, /\.hd-feature-list li svg\s*\{[^}]*color:\s*var\(--hd-brass\)/s);
  assert.match(propertyDetailViewSource, /className="hd-spec-icon"><Icon size=\{18\} aria-hidden="true" \/>/);
  assert.match(propertyDetailViewSource, /className="hd-feature-list"/);
  assert.match(propertyDetailViewSource, /features\.map\(\(feature\) => <li key=\{feature\}><Check size=\{16\} aria-hidden="true" \/>/);
});

testRunner.test("Playwright responsive matrix includes all requested widths and key routes", () => {
  assert.match(browserSmoke, /const viewportWidths = \[320, 360, 375, 390, 414, 430, 768, 1024, 1440\]/);
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


testRunner.test("responsive guardrails are loaded after every other site stylesheet", () => {
  const stylesheetLinks = [...rootRoute.matchAll(/\\{ rel: "stylesheet", href: (\\w+) \\}/g)]
    .map((match) => match[1]);
  assert.equal(
    stylesheetLinks.at(-1),
    "responsiveHardeningCss",
    "the responsive guardrail stylesheet must be last so later redesign layers cannot undo it",
  );
});

testRunner.test("responsive browser smoke covers the required viewport matrix", () => {
  const matrix = responsiveSmoke.match(/const viewportMatrix = \\[([\\s\\S]*?)\\];/);
  assert.ok(matrix, "responsive smoke must define an explicit width/height viewport matrix");
  const pairs = [...matrix[1].matchAll(/width: (\\d+), height: (\\d+)/g)]
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
  assert.match(responsiveSmoke, /await page\\.setViewportSize\\(\\{ width, height \\}\\)/);
  assert.match(responsiveSmoke, /viewportMatrix\\.length/);
  assert.match(responsiveSmoke, /\\$\\{width\\}x\\$\\{height\\}\\.png/);
});
