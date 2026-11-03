import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/components/hirmand/admin-shell-css.ts", import.meta.url), "utf8");
const areaCss = fs.readFileSync(new URL("../src/admin-area-content.css", import.meta.url), "utf8");
const productivity = fs.readFileSync(new URL("../src/components/hirmand/admin-productivity-center.tsx", import.meta.url), "utf8");
const securityCss = fs.readFileSync(new URL("../src/admin-security.css", import.meta.url), "utf8");
const seoCss = fs.readFileSync(new URL("../src/admin-seo-redirects.css", import.meta.url), "utf8");
const contentCss = fs.readFileSync(new URL("../src/admin-content-studio.css", import.meta.url), "utf8");
const opsCss = fs.readFileSync(new URL("../src/admin-ops.css", import.meta.url), "utf8");
const matchingCss = fs.readFileSync(new URL("../src/admin-matching.css", import.meta.url), "utf8");
const mobileClarity = fs.readFileSync(new URL("../src/admin-mobile-clarity.css", import.meta.url), "utf8");
const inboxCss = fs.readFileSync(new URL("../src/admin-customer-inbox.css", import.meta.url), "utf8");
const mediaCss = fs.readFileSync(new URL("../src/components/hirmand/admin-media-field.css", import.meta.url), "utf8");
const siteMobileTouchContractCss = fs.readFileSync(new URL("../src/site-mobile-touch-contract.css", import.meta.url), "utf8");
const listingAssistant = fs.readFileSync(new URL("../src/components/hirmand/admin-listing-assistant.tsx", import.meta.url), "utf8");
const finalLayer = css.slice(css.lastIndexOf("Final mobile readability pass"));

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("admin property metadata wraps long Persian titles instead of clipping them", () => {
  assert.ok(finalLayer.length > 0, "the final readability layer must exist");
  assert.match(
    finalLayer,
    /\.admin-property-meta h3,\s*\.admin-property-meta p\s*\{[\s\S]*?white-space: normal !important;[\s\S]*?overflow-wrap: break-word !important;[\s\S]*?text-overflow: clip !important;/,
  );
  assert.ok(
    css.lastIndexOf("Final mobile readability pass") > css.lastIndexOf(".admin-property-meta h3{margin:0"),
    "the wrapping rule must follow the older ellipsis declarations in the CSS cascade",
  );
});

test("admin icon actions have 44px targets on phones and coarse-pointer devices", () => {
  assert.match(
    finalLayer,
    /@media \(max-width: 640px\), \(pointer: coarse\)[\s\S]*?\.admin-icon-btn,[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;[\s\S]*?flex: 0 0 44px !important;/,
  );
  assert.ok(
    css.lastIndexOf("Final mobile readability pass") > css.lastIndexOf(".admin-icon-btn{width:34px!important}"),
    "the 44px touch-target rule must override the older 34px mobile declaration",
  );
});


test("admin visual audit emulates touch input through tablet widths", () => {
  const audit = fs.readFileSync(new URL("./admin-visual-audit.mjs", import.meta.url), "utf8");
  assert.match(audit, /hasTouch: touchInputMode \|\| viewport\.width <= 1024/);
  assert.match(audit, /isMobile: viewport\.width <= 640/);
  assert.match(audit, /window\.matchMedia\("\(pointer: coarse\)"\)\.matches/);
});

test("admin QA npm scripts run directly on Windows without a POSIX shell", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["qa:admin"], "node ./scripts/admin-qa.mjs");
  assert.equal(packageJson.scripts["qa:admin-a11y"], "node ./scripts/admin-visual-audit.mjs");
});

test("admin browser audits accept an installed Chromium-compatible browser path", () => {
  for (const file of ["admin-qa.mjs", "admin-visual-audit.mjs"]) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
    assert.match(source, /executablePath: process\.env\.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
  }
});

test("admin mobile workspace keeps compact two-column metrics at 390px and below", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.doesNotMatch(
    css,
    /\.admin-stats-grid,\.admin-dashboard-stats\{grid-template-columns:1fr!important\}/,
    "an older important one-column rule must not override the final two-column mobile layout",
  );
  assert.match(finalLayer, /@media\(max-width:390px\)[\s\S]*?\.admin-stats-grid,\.admin-dashboard-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(finalLayer, /\.admin-content\{padding:14px 12px calc\(108px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test("admin mobile tables scroll inside their own container and form fields stack", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.match(finalLayer, /\.admin-main :is\(\.admin-table-wrap,\.admin-target-table-wrap,\[class\*="table-wrap"\]\)\{max-width:100%;overflow-x:auto/);
  assert.match(finalLayer, /\.admin-form-grid,\.admin-main \.admin-form-grid\{grid-template-columns:minmax\(0,1fr\)/);
});

test("admin mobile topbar keeps the title and action controls on separate grid rows", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.match(finalLayer, /\.admin-topbar>div:not\(\.admin-topbar-actions\)\{grid-column:2;grid-row:1\}/);
  assert.match(finalLayer, /\.admin-topbar-actions\{grid-column:1\/-1;grid-row:2/);
  assert.doesNotMatch(finalLayer, /\.admin-topbar>div\{grid-column:2;grid-row:1\}/);
});

test("admin light surfaces override legacy low-contrast dark-shell labels", () => {
  const finalLayer = css.slice(css.lastIndexOf("Contrast corrections for legacy dark-shell accents"));
  for (const rule of [
    /\.admin-main \.admin-area-status\{color:#f7f5ef!important\}/,
    /\.admin-main \.admin-security-status\{color:#344054!important;background:#eef2f6!important\}/,
    /\.admin-main \.admin-security-status\.is-active,\s*\.admin-main \.admin-security-current\{color:#17663a!important;background:#e8f6ed!important\}/,
    /\.admin-main \.admin-seo-empty\{color:#475467!important\}/,
    /\.admin-main \.admin-seo-hero h2\{color:#132333!important\}/,
    /\.admin-main \.admin-notification-count\{color:#fff!important\}/,
  ]) assert.match(finalLayer, rule);
});

test("admin productivity task fields never collapse beside fixed-width controls on tablets", () => {
  assert.match(productivity, /@media \(max-width:1100px\)[\s\S]*?\.admin-productivity-form\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(productivity, /@media \(max-width:700px\)[\s\S]*?\.admin-productivity-form\{grid-template-columns:1fr\}/);
  assert.match(productivity, /aria-label="جستجوی وظیفه‌های مرکز بهره‌وری"/);
  assert.match(productivity, /\.admin-productivity-chip:is\(button,a\)\{min-height:44px/);
  assert.match(productivity, /\.admin-productivity-file-links a\{[^}]*min-height:44px/);
});

test("shared floating music and contact controls stay in document flow on admin routes", () => {
  assert.match(siteMobileTouchContractCss, /html body:has\(\.admin-app\) #hirmand-site-music-player\s*\{[^}]*position:\s*static !important;[^}]*inset:\s*auto !important;/s);
  assert.match(siteMobileTouchContractCss, /html body:has\(\.admin-app\) \.action-menu\.floating-call-menu\s*\{[^}]*position:\s*static !important;[^}]*inset:\s*auto !important;/s);
  const audit = fs.readFileSync(new URL("./admin-visual-audit.mjs", import.meta.url), "utf8");
  assert.match(audit, /adminFloatingControlsInFlow/);
  assert.match(audit, /shared floating controls remain fixed over admin content/);
});

test("admin neighborhood preview action keeps a full touch-sized hit area", () => {
  assert.match(areaCss, /\.admin-area-editor-head a\{[^}]*min-height:44px;[^}]*padding:7px 10px/);
});

test("admin lead phone and matched-property links meet the 44px touch target", () => {
  const finalLayer = css.slice(css.lastIndexOf("Contrast corrections for legacy dark-shell accents"));
  assert.match(finalLayer, /\.admin-main \.admin-lead-phone\{min-height:44px/);
  assert.match(finalLayer, /\.admin-main \.admin-lead-matches a\{min-height:44px/);
});

test("admin security, SEO, and content pages use readable text on their light cards", () => {
  assert.match(securityCss, /\.admin-security-hero p\{color:#475467\}/);
  assert.match(securityCss, /\.admin-security-main p,\.admin-security-main small\{color:#59636e\}/);
  assert.match(securityCss, /\.admin-security-stats span,\.admin-security-stats small\{color:#d4dce4\}/);
  assert.match(seoCss, /\.admin-seo-hero h2\{color:#132333\}/);
  assert.match(seoCss, /\.admin-seo-hero p\{color:#475467\}/);
  assert.match(seoCss, /\.admin-seo-404-row strong\{color:#132333\}/);
  assert.match(contentCss, /\.admin-content-hero p\{color:#475467\}/);
  assert.match(contentCss, /\.admin-content-list-row strong\{color:#132333\}/);
  assert.match(contentCss, /\.admin-content-field input,\.admin-content-field textarea,\.admin-content-point textarea\{border-color:#cbd5df;background:#fff;color:#152430\}/);
});

test("admin dark area editor keeps its gold kicker and helper text legible", () => {
  assert.match(areaCss, /\.admin-area-content \.kicker\{color:#d6b66e!important\}/);
  assert.match(areaCss, /\.admin-area-field small,\.admin-area-field-hint\{font-size:.73rem;line-height:1.8;color:rgba\(247,245,239,\.47\)\}/);
  assert.match(areaCss, /\.admin-area-editor-head p,\.admin-area-publish-toggle small,\.admin-area-field small,\.admin-area-field-hint\{color:rgba\(247,245,239,\.82\)\}/);
});

test("admin finance secondary labels meet readable contrast on light cards", () => {
  assert.match(opsCss, /\.admin-finance-summary small\{color:#59636e/);
  assert.match(opsCss, /\.admin-finance-row>div small\{[^}]*color:#59636e/);
  assert.match(opsCss, /\.admin-finance-row time\{color:#59636e/);
});

test("admin matching request, mode, timeline and result labels meet readable contrast", () => {
  assert.match(matchingCss, /\.admin-matching-request-grid small,[\s\S]*?color:#59636e/);
  assert.match(matchingCss, /\.admin-matching-request-section em,[\s\S]*?color:#59636e/);
  assert.match(matchingCss, /\.admin-matching-mode small\{[^}]*color:#59636e/);
  assert.match(matchingCss, /\.admin-matching-card-prices small\{[^}]*color:#59636e/);
  assert.match(opsCss, /\.admin-matching-timeline small\{[^}]*color:#59636e/);
  for (const background of ["#fffdf9", "#fffaf0", "#ffffff", "#fbfaf7"]) {
    assert.ok(contrastRatio("#59636e", background) >= 4.5, `#59636e must meet WCAG AA on ${background}`);
  }
});

test("admin matching phone link has a full 44px touch target", () => {
  assert.match(matchingCss, /\.admin-matching-request-grid a\{[^}]*min-height:44px/);
});

test("admin owner card secondary labels meet readable contrast", () => {
  assert.match(opsCss, /\.admin-owner-title small\{color:#59636e/);
  assert.match(opsCss, /\.admin-owner-stats small\{color:#59636e/);
});

test("mobile admin drawer uses light labels on its navy navigation surface", () => {
  assert.match(mobileClarity, /\.admin-app \.admin-drawer \.admin-sidebar-nav\s*\{\s*background: linear-gradient\(180deg, #081320 0%, #0b1a2b 100%\) !important/);
  assert.match(mobileClarity, /\.admin-app \.admin-drawer \.admin-nav-btn\s*\{\s*color: #e4e8ed !important/);
  assert.match(mobileClarity, /\.admin-nav-btn-create \.admin-nav-btn-label,[\s\S]*?\.admin-nav-btn-meta\s*\{\s*color: #7a5414 !important/);
  assert.match(mobileClarity, /\.admin-app \.admin-drawer \.admin-sidebar-foot-label\s*\{\s*color: #59636e !important/);
});

test("admin form media and customer inbox helper text meets readable contrast", () => {
  assert.match(inboxCss, /\.admin-customer-inbox-empty\{[^}]*color:#59636e/);
  assert.match(listingAssistant, /\.admin-seo-preview-top span\{[^}]*color:#59636e/);
  assert.match(mediaCss, /--hirmand-media-muted: #59636e/);
  assert.match(mediaCss, /\.hirmand-media-dropzone > small\s*\{[\s\S]*?color: #59636e/);
  assert.match(mediaCss, /\.hirmand-media-empty\s*\{[\s\S]*?color: #59636e/);
  assert.match(mediaCss, /\.hirmand-media-count span\s*\{\s*color: #725115/);
  assert.match(mediaCss, /\.hirmand-watermark-note\s*\{[\s\S]*?color: #59636e/);
  assert.match(listingAssistant, /\.admin-quality-heading small\{[^}]*color:#59636e/);
  assert.match(listingAssistant, /\.admin-quality-note\{[^}]*color:#59636e!important/);
  const finalLayer = css.slice(css.lastIndexOf("Contrast corrections for legacy dark-shell accents"));
  assert.match(finalLayer, /\.admin-main small\.admin-field-help\{color:#59636e!important\}/);
  assert.match(finalLayer, /\.admin-main \.admin-data-health-summary \.is-warning strong\{color:#7a5414!important\}/);
  assert.match(finalLayer, /\.admin-app \.admin-drawer \.admin-sidebar-foot-label\{color:#59636e!important\}/);
  assert.match(finalLayer, /\.admin-main \.admin-quality-heading small\{color:#59636e!important\}/);
  assert.match(finalLayer, /\.admin-main \.hirmand-media-manager small\{color:#59636e!important\}/);
  assert.match(finalLayer, /\.admin-main \.hirmand-media-manager \.hirmand-media-dropzone>span:not\(\.hirmand-media-drop-icon\)\{color:#475467!important\}/);
  assert.match(finalLayer, /\.admin-main \.hirmand-media-manager \.hirmand-media-empty>span\{color:#59636e!important\}/);
});

test("admin touch navigation, drawer and confirmation actions retain usable targets", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.match(finalLayer, /\.admin-mobile-nav button,\.admin-mobile-site\{flex:0 0 68px;min-width:68px;min-height:54px/);
  assert.match(finalLayer, /\.admin-property-actions \.admin-icon-btn\{width:44px;height:44px;min-width:44px;min-height:44px\}/);
  assert.match(finalLayer, /\.admin-dialog-actions>\*\{width:100%;min-height:46px\}/);
  assert.ok(finalLayer.includes(".admin-drawer{overscroll-behavior:contain"));
});
