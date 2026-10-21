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
const propertiesRoute = fs.readFileSync(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");
const dealRoomCss = fs.readFileSync(new URL("../src/property-deal-room.css", import.meta.url), "utf8");
const documentPackCss = fs.readFileSync(new URL("../src/property-document-pack.css", import.meta.url), "utf8");
const questionLogCss = fs.readFileSync(new URL("../src/property-question-log.css", import.meta.url), "utf8");
const renovationTrackerCss = fs.readFileSync(new URL("../src/property-renovation-tracker.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const propertyDetailMobileCss = fs.readFileSync(new URL("../src/property-detail-mobile-redesign.css", import.meta.url), "utf8");
const browserSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
const propertyDetailViewSource = fs.readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");
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

testRunner.test("responsive guardrails and property-detail final layers load after the older global styles", () => {
  assert.match(rootRoute, /import responsiveHardeningCss from "\.\.\/mobile-responsive-hardening\.css\?url";/);
  assert.match(rootRoute, /import propertyDetailMobileRedesignCss from "\.\.\/property-detail-mobile-redesign\.css\?url";/);
  assert.match(rootRoute, /import propertyDetailPremiumFinalCss from "\.\.\/property-detail-premium-final\.css\?url";/);
  assert.match(rootRoute, /import propertyDetailIconsClarityCss from "\.\.\/property-detail-icons-clarity\.css\?url";/);
  const linkPositions = [...rootRoute.matchAll(/\{ rel: "stylesheet", href: ([A-Za-z][A-Za-z0-9]*) \}/g)].map((match) => ({
    name: match[1],
    index: match.index,
  }));
  assert.ok(linkPositions.length > 0, "root route should link the shared CSS files");
  assert.equal(linkPositions.at(-1)?.name, "propertyDetailIconsClarityCss", "the icon clarity layer must load last");
  const responsiveIndex = linkPositions.findIndex((item) => item.name === "responsiveHardeningCss");
  const mobileDetailIndex = linkPositions.findIndex((item) => item.name === "propertyDetailMobileRedesignCss");
  const premiumDetailIndex = linkPositions.findIndex((item) => item.name === "propertyDetailPremiumFinalCss");
  const iconClarityIndex = linkPositions.findIndex((item) => item.name === "propertyDetailIconsClarityCss");
  assert.ok(
    responsiveIndex >= 0 && mobileDetailIndex > responsiveIndex && premiumDetailIndex > mobileDetailIndex && iconClarityIndex > premiumDetailIndex,
    "mobile layout, premium presentation and icon clarity must layer in that order",
  );
  assert.match(propertyDetailMobileCss, /@media \(max-width: 760px\)/);
  assert.match(propertyDetailMobileCss, /\.property-mobile-actions\s*\{[^}]*position:\s*fixed\s*!important/s);
  assert.match(propertyDetailMobileCss, /padding:\s*12px 0 calc\(126px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(propertyDetailMobileCss, /\.property-gallery-main > picture > img[\s\S]*?object-fit:\s*contain\s*!important/s, "the mobile redesign must not crop the listing photo or its permanent watermark");
  assert.match(propertyDetailMobileCss, /details:not\(\[open\]\)\s*>\s*:not\(summary\)\s*\{[^}]*display:\s*none\s*!important/s, "native accordions must hide content while closed");
  assert.match(rootRoute, /<html lang="fa" dir="rtl"/);
});


testRunner.test("property-detail icons keep clear contrast and visible stroke weight", () => {
  const iconCss = fs.readFileSync(new URL("../src/property-detail-icons-clarity.css", import.meta.url), "utf8");
  assert.match(iconCss, /svg\.lucide\s*\{[^}]*opacity:\s*1\s*!important/s);
  assert.match(iconCss, /svg\.lucide\s*\{[^}]*stroke-width:\s*2\.25px\s*!important/s);
  assert.match(iconCss, /\.property-spec-item-icon[\s\S]*?background:\s*#f7ecd6\s*!important/);
  assert.match(iconCss, /\.property-spec-item-icon[\s\S]*?color:\s*#102d45\s*!important/);
});

testRunner.test("Playwright responsive matrix includes all requested widths and key routes", () => {
  assert.match(browserSmoke, /const viewportWidths = \[320, 360, 375, 390, 414, 768, 1024, 1440\]/);
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

testRunner.test("mobile property gallery keeps full media visible and gives video controls usable touch targets", () => {
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-gallery-main\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10\s*!important/s,
    "the mobile hero media frame must keep a landscape-friendly 16:10 layout",
  );
  assert.match(
    responsiveCss,
    /body:has\(\.property-detail-page\) \.property-detail-page \.property-gallery-wrap \.property-gallery \.property-gallery-main\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10\s*!important/s,
    "the final mobile ratio rule must outrank the legacy signature stylesheet",
  );
  assert.match(
    responsiveCss,
    /@media\s*\(max-width:\s*360px\)\s*\{\s*body:has\(\.property-detail-page\) \.property-detail-page \.property-gallery-wrap \.property-gallery \.property-gallery-main\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10\s*!important/s,
    "extra-narrow phones must preserve the landscape media frame",
  );
  assert.match(
    responsiveCss,
    /@media\s*\(max-width:\s*360px\)\s*\{\s*\.property-detail-page \.property-gallery-open\s*\{[^}]*inset:\s*49px auto auto 8px\s*!important;[^}]*width:\s*max-content\s*!important/s,
    "the full-screen control on narrow phones must shrink to its content instead of stretching edge-to-edge",
  );
  assert.match(
    browserSmoke,
    /gallery\.openButton\.width > Math\.min\(gallery\.stage\.width \* 0\.62, 180\)/,
    "the responsive browser matrix must detect a stretched full-screen action on small phones",
  );
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-gallery-main > picture > img\s*,[\s\S]*?object-fit:\s*contain\s*!important/s,
    "mobile photos must be fully visible instead of being cropped by cover",
  );
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-gallery-main > \.property-video-player \.property-video-frame video\s*\{[^}]*object-fit:\s*contain\s*!important/s,
    "property videos must retain their full frame",
  );
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-gallery-rail\s*\{[^}]*overflow-x:\s*auto\s*!important/s,
    "the thumbnail rail must be horizontally scrollable on mobile",
  );
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-gallery-thumb,\s*\.property-detail-page \.property-gallery-thumb:nth-of-type\(n \+ 5\)\s*\{[^}]*flex:\s*0 0 76px\s*!important/s,
    "all gallery thumbnails, including items after the fourth, must be the same width",
  );
  assert.match(
    responsiveCss,
    /\.property-detail-page \.property-video-controls button\s*\{[^}]*width:\s*44px\s*!important;[^}]*height:\s*44px\s*!important/s,
    "video transport buttons must be touch-friendly on phones",
  );
  assert.match(
    responsiveCss,
    /\.property-lightbox \.property-video-player\.is-lightbox \.property-video-frame video\s*\{[^}]*object-fit:\s*contain\s*!important/s,
    "video remains uncropped in the mobile full-screen viewer",
  );
  assert.match(
    propertyDetailViewSource,
    /className="property-gallery-thumb-video"/,
    "video thumbnails must have a visible play marker",
  );
  assert.match(
    propertyDetailViewSource,
    /<Play size=\{14\} fill="currentColor" aria-hidden="true" \/>/,
    "the thumbnail marker must use a visible, decorative play icon",
  );
});
