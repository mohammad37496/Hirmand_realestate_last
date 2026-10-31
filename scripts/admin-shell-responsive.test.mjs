import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/components/hirmand/admin-shell-css.ts", import.meta.url), "utf8");
const finalLayer = css.slice(css.lastIndexOf("Final mobile readability pass"));

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
  assert.match(audit, /hasTouch: viewport\.width <= 1024/);
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
  assert.match(finalLayer, /@media\(max-width:390px\)[\s\S]*?\.admin-stats-grid,\.admin-dashboard-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(finalLayer, /\.admin-content\{padding:14px 12px calc\(108px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test("admin mobile tables scroll inside their own container and form fields stack", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.match(finalLayer, /\.admin-main :is\(\.admin-table-wrap,\.admin-target-table-wrap,\[class\*="table-wrap"\]\)\{max-width:100%;overflow-x:auto/);
  assert.match(finalLayer, /\.admin-form-grid,\.admin-main \.admin-form-grid\{grid-template-columns:minmax\(0,1fr\)/);
});

test("admin touch navigation, drawer and confirmation actions retain usable targets", () => {
  const finalLayer = css.slice(css.lastIndexOf("Mobile admin workspace: final responsive layer"));
  assert.match(finalLayer, /\.admin-mobile-nav button,\.admin-mobile-site\{flex:1 1 0;min-width:0;min-height:54px/);
  assert.match(finalLayer, /\.admin-property-actions \.admin-icon-btn\{width:44px;height:44px;min-width:44px;min-height:44px\}/);
  assert.match(finalLayer, /\.admin-dialog-actions>\*\{width:100%;min-height:46px\}/);
  assert.ok(finalLayer.includes(".admin-drawer{overscroll-behavior:contain"));
});
