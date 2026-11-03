import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const matchingCss = fs.readFileSync(new URL("../src/admin-matching.css", import.meta.url), "utf8");
const opsCss = fs.readFileSync(new URL("../src/admin-ops.css", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("admin matching secondary labels meet WCAG AA on light cards", () => {
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

test("admin owner card secondary labels meet WCAG AA contrast", () => {
  assert.match(opsCss, /\.admin-owner-title small\{color:#59636e/);
  assert.match(opsCss, /\.admin-owner-stats small\{color:#59636e/);
});
