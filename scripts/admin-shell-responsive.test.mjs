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
