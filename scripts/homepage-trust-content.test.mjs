import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/components/hirmand/site-page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/hirmand/homepage-polish.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme-pro.css", import.meta.url), "utf8");

test("homepage removes the trust-strip consultant, guide and office links", () => {
  const main = page.slice(page.indexOf("export function SitePage"));
  const visibleContent = main.slice(main.indexOf("<main className=\"site-home\">"), main.indexOf("<details className=\"home-secondary\">"));

  assert.match(visibleContent, /<TrustStrip\s*\/>/);
  assert.doesNotMatch(visibleContent, /SmartRecommendations|smart-recommendations/);
  assert.match(visibleContent, /<GuidesPreview\s*\/>/);
  assert.doesNotMatch(page, /trust-strip-links|مشاهده مشاوران و راه‌های تماس|راهنمای تصمیم‌گیری و معامله|نشانی و ارتباط با دفتر/);
});

test("homepage guide previews deep-link to the selected guide", () => {
  assert.match(page, /href=\{`\/guides\?guide=\$\{encodeURIComponent\(guide\.id\)\}`\}/);
  assert.match(page, /DEFAULT_GUIDES\.slice\(0, 3\)/);
});

test("homepage trust and guide cards remain usable on narrow screens", () => {
  assert.doesNotMatch(styles, /trust-strip-links|smart-recommend/);
  assert.match(styles, /\.site-home \.property-card\s*\{/);
  assert.match(styles, /\.site-home \.home-guides-grid\s*\{/);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("homepage consultant cards can shrink below their desktop grid minimum", () => {
  const teamGrid = theme.match(/\.team-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(teamGrid, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*300px\),\s*1fr\)\)/);
  assert.doesNotMatch(teamGrid, /minmax\(300px\s*,/);
  assert.match(theme, /@media\s*\(max-width:\s*720px\)\s*\{\s*\.team-card\s*\{\s*grid-template-columns:\s*62px\s+minmax\(0,\s*1fr\)/);
  assert.match(theme, /\.team-profile-link\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
});
