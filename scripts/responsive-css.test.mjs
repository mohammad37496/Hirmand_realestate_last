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
const propertyCardCss = fs.readFileSync(new URL("../src/property-card.css", import.meta.url), "utf8");
const propertyShowcase = fs.readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");
const propertyLibrary = fs.readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const commissionLibrary = fs.readFileSync(new URL("../src/lib/commission.ts", import.meta.url), "utf8");
const commissionCalculator = fs.readFileSync(new URL("../src/components/hirmand/commission-calculator.tsx", import.meta.url), "utf8");
const deployWorkflow = fs.readFileSync(new URL("../.github/workflows/deploy-liara.yml", import.meta.url), "utf8");
const liveDeploymentSmoke = fs.readFileSync(new URL("./verify-live-deployment.mjs", import.meta.url), "utf8");
const dealRoomCss = fs.readFileSync(new URL("../src/property-deal-room.css", import.meta.url), "utf8");
const documentPackCss = fs.readFileSync(new URL("../src/property-document-pack.css", import.meta.url), "utf8");
const questionLogCss = fs.readFileSync(new URL("../src/property-question-log.css", import.meta.url), "utf8");
const renovationTrackerCss = fs.readFileSync(new URL("../src/property-renovation-tracker.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/mobile-responsive-hardening.css", import.meta.url), "utf8");
const browserSmoke = fs.readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");
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

testRunner.test("responsive guardrails load after the older global styles", () => {
  assert.match(rootRoute, /import responsiveHardeningCss from "\.\.\/mobile-responsive-hardening\.css\?url";/);
  const linkPositions = [...rootRoute.matchAll(/\{ rel: "stylesheet", href: ([A-Za-z][A-Za-z0-9]*) \}/g)].map((match) => ({
    name: match[1],
    index: match.index,
  }));
  assert.ok(linkPositions.length > 0, "root route should link the shared CSS files");
  assert.equal(linkPositions.at(-1)?.name, "musicPlayerLayoutCss", "the final music-player layout overrides must load after responsive guardrails");
  assert.match(rootRoute, /<html lang="fa" dir="rtl"/);
});

testRunner.test("Playwright responsive matrix includes all requested widths and key routes", () => {
  assert.match(browserSmoke, /const viewportWidths = \[320, 360, 375, 390, 430, 768, 1024, 1440\]/);
  assert.match(browserSmoke, /const brokenWords = \[\]/, "browser smoke must inspect narrow Persian text elements");
  assert.match(browserSmoke, /page\.on\("console"/, "browser smoke must capture console errors");
  assert.match(browserSmoke, /page\.on\("requestfailed"/, "browser smoke must capture failed network requests");
  assert.match(browserSmoke, /criticalNetworkFailures/, "same-origin script, style, font and server failures must fail verification");
  assert.match(browserSmoke, /first property image did not load successfully/, "the first real listing image must load");
  assert.match(browserSmoke, /smallTargets = \[\]/, "browser smoke must inspect touch target dimensions");
  assert.match(browserSmoke, /if \(viewport <= 430\)/, "430px must remain in the touch-target phone matrix");
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


testRunner.test("mobile property directory starts in an accessible horizontal list view", () => {
  assert.match(propertiesRoute, /matchMedia\("\(max-width: 720px\)"\)[\s\S]*?setViewMode\("list"\)/);
  assert.match(propertiesRoute, /aria-label="نمایش فهرستی فایل‌ها" aria-pressed=\{viewMode === "list"\}/);
  assert.match(propertiesRoute, /aria-label="نمایش شبکه‌ای فایل‌ها" aria-pressed=\{viewMode === "grid"\}/);
  assert.match(propertiesRoute, /aria-label="نمایش فایل‌ها روی نقشه" aria-pressed=\{viewMode === "split"\}/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link[\s\S]*?grid-template-columns:clamp\(96px,28vw,116px\) minmax\(0,1fr\)/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link[^}]*direction:rtl/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-actions[\s\S]*?grid-row:2/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-specs[\s\S]*?background:transparent/);
});


testRunner.test("all shared property cards use the readable RTL mobile list layout", () => {
  assert.match(propertyShowcase, /<article className="pcard pcard-mobile-list">/);
  assert.match(propertyShowcase, /property\.storage[\s\S]*?انباری/);
  assert.match(propertyLibrary, /export type PropertyCardData = Pick<[\s\S]*?\| "storage"/);
  assert.match(propertyLibrary, /bedrooms, built_year, parking, elevator, storage, price, deposit, rent/);
  assert.match(propertyLibrary, /storage: Boolean\(row\.storage\)/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-link[\s\S]*?grid-template-columns:clamp\(96px,28vw,116px\) minmax\(0,1fr\)/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-actions \.property-actions-compact[\s\S]*?flex-wrap:wrap/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-actions \.property-action[\s\S]*?width:44px; height:44px; min-height:44px/);
  assert.match(propertyCardCss, /\.pcard-mobile-list \.pcard-title[\s\S]*?font-size:\.88rem/);
  assert.match(propertyCardCss, /\.pf-grid\.is-grid-view \.pcard-mobile-list/);
  assert.match(responsiveCss, /\.area-profile-listings, \.compare-grid, \.budget-result-grid[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
});

testRunner.test("responsive defaults adapt until a visitor manually selects a view", () => {
  const responsiveEffect = propertiesRoute.match(/\/\/ Apply responsive defaults until[\s\S]*?\}, \[viewModeManuallySelected\]\);/)?.[0] ?? "";
  assert.ok(responsiveEffect, "responsive list and map defaults should be applied");
  assert.match(responsiveEffect, /if \(!viewModeManuallySelected\) setViewMode\(media\.matches \? "list" : "split"\)/);
  assert.match(responsiveEffect, /media\.addEventListener\("change", applyResponsiveDefault\)/);
  assert.match(propertiesRoute, /setViewModeManuallySelected\(true\)/);
  assert.match(propertiesRoute, /viewMode === "grid" \? " is-grid-view" : ""/);
  assert.match(browserSmoke, /mobile property view buttons preserve filters and URL parameters/);
  assert.match(browserSmoke, /verifyActionToggle/);
  assert.match(browserSmoke, /targetOrigin = new URL\(frame\.url\(\)\)\.origin/,
    "browser network checks must follow the final page origin after redirects");

  assert.match(browserSmoke, /first shared property-card image did not load or fall back successfully/,
    "browser smoke must verify shared-card image loading on every property-list surface");
  assert.match(browserSmoke, /interactive map canvas/, "browser smoke must verify the map view renders its real map canvas");

  assert.match(browserSmoke, /page\.goBack\(\{ waitUntil: "domcontentloaded" \}\)/, "browser back must restore the real listing route");
  assert.match(browserSmoke, /\.pf-sidebar\.is-open\[role=dialog\] \.pf-reset/, "reset filters must target the open mobile drawer");
  assert.match(responsiveCss, /\.pf-page \.pf-filter-overview > button\s*\{[^}]*min-height:\s*44px;/s,
    "the final responsive CSS layer must enforce the active-filter clear touch target");
  assert.match(propertyFiltersRedesignCss, /body:has\(\.pf-sidebar\.is-open\) \.quick-actions\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    "the fixed quick-action bar must not intercept taps while the mobile filter drawer is open");
  assert.match(responsiveCss, /\.pf-page \.pf-search button\[aria-label="پاک کردن جست‌وجو"\]\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s,
    "the final responsive CSS layer must keep the mobile search-clear action at 44px");
  assert.match(browserSmoke, /search clear action must be at least 44×44px/, "browser smoke must verify the search clear target in the DOM");
  assert.match(browserSmoke, /active-filter clear action must be at least 44×44px/, "browser smoke must verify the active-filter clear target in the DOM");
  assert.match(browserSmoke, /Object\.entries\(expected\)\.every\(\(\[key, value\]\) => actual\.get\(key\) === value\)/, "browser back must preserve every active filter parameter");
  assert.match(browserSmoke, /transactionGroup[\s\S]*?minArea[\s\S]*?minPrice[\s\S]*?neighborhoodSearch[\s\S]*?sortControl[\s\S]*?loadMore/, "browser smoke should exercise real property filters, sorting and pagination");
  assert.match(browserSmoke, /detailsHref\.startsWith\("\/properties\/"\)/);
});


testRunner.test("property cards show construction year only when real data exists", () => {
  assert.match(propertyLibrary, /export type PropertyCardData = Pick<[\s\S]*?\| "builtYear"/);
  assert.match(propertyLibrary, /bedrooms, built_year, parking, elevator, storage, price/);
  assert.match(propertyLibrary, /builtYear: numberOrNull\(row\.built_year\)/);
  assert.match(propertyShowcase, /property\.builtYear != null && property\.builtYear > 0[\s\S]*?ساخت/);
});

testRunner.test("commission estimate uses the 1405 VAT rate and explains local tariff limits", () => {
  assert.match(commissionLibrary, /export const VAT = 0\.10/);
  assert.match(commissionLibrary, /مالیات ارزش افزوده \(۱۰٪\)/);
  assert.match(commissionCalculator, /مالیات = ۱۰٪ از کمیسیون پایه/);
  assert.match(commissionCalculator, /مالیات ارزش افزوده \(۱۰٪\)/);
  assert.doesNotMatch(commissionCalculator, /مالیات ارزش افزوده \(۹٪\)/);
  assert.match(commissionCalculator, /مالیات ۱۰٪ اضافه/);
  assert.match(commissionCalculator, /ضریب[\s\S]*?ارزش معاملاتی و سقف مصوب هر شهرستان/);
});


testRunner.test("Liara deployment verifies the exact main commit and published mobile assets", () => {
  assert.match(deployWorkflow, /Stamp deployment revision[\s\S]*?write-deployment-info\.mjs/);
  assert.match(deployWorkflow, /Verify live Liara release matches this commit[\s\S]*?verify-live-deployment\.mjs/);
  assert.match(deployWorkflow, /id: live_release_verify\s+continue-on-error: true/);
  assert.match(deployWorkflow, /Enforce live release and browser verification[\s\S]*?LIVE_RELEASE_OUTCOME[\s\S]*?LIVE_BROWSER_OUTCOME/);
  assert.match(deployWorkflow, /Install live browser smoke dependencies[\s\S]*?playwright install --with-deps chromium/);
  assert.match(deployWorkflow, /Verify live property experience in a real browser[\s\S]*?responsive-layout-smoke\.mjs https:\/\/hirmandrealestate\.ir/);
  assert.match(deployWorkflow, /Upload live responsive screenshots[\s\S]*?actions\/upload-artifact@v4[\s\S]*?hirmand-live-responsive/);
  const liveRevisionIndex = deployWorkflow.indexOf("Verify live Liara release matches this commit");
  const liveBrowserInstallIndex = deployWorkflow.indexOf("Install live browser smoke dependencies");
  const liveBrowserSmokeIndex = deployWorkflow.indexOf("Verify live property experience in a real browser");
  assert.ok(liveRevisionIndex >= 0 && liveRevisionIndex < liveBrowserInstallIndex && liveBrowserInstallIndex < liveBrowserSmokeIndex,
    "live browser checks must run only after the exact Liara revision is verified");
  assert.match(deployWorkflow, /- name: Deploy\s+timeout-minutes: 40/);
  assert.match(liveDeploymentSmoke, /EXPECTED_DEPLOYMENT_SHA/);
  assert.match(liveDeploymentSmoke, /const pageOrigin = new URL\(pageUrl\)\.origin;/,
    "live asset checks must use the actual final page origin after redirects");
  assert.doesNotMatch(liveDeploymentSmoke, /nestedAssetPattern/,
    "live verification must not invent nested asset URLs from arbitrary JavaScript strings");

  assert.match(liveDeploymentSmoke, /deployment\.json/);
  assert.match(liveDeploymentSmoke, /pcard-mobile-list/);
  assert.match(liveDeploymentSmoke, /نمایش فهرستی فایل‌ها/);
});
