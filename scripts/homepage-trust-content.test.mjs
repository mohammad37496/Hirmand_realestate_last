import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/components/hirmand/site-page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/hirmand/homepage-polish.css", import.meta.url), "utf8");

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
