import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/components/hirmand/site-page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/hirmand/homepage-polish.css", import.meta.url), "utf8");
const recommendations = readFileSync(new URL("../src/components/hirmand/smart-recommendations.tsx", import.meta.url), "utf8");

test("homepage exposes consultant, guide and office information outside collapsed details", () => {
  const main = page.slice(page.indexOf("export function SitePage"));
  const visibleContent = main.slice(main.indexOf("<main className=\"site-home\">"), main.indexOf("<details className=\"home-secondary\">"));

  assert.match(visibleContent, /<TrustStrip\s*\/>/);
  assert.match(visibleContent, /<SmartRecommendations\s*\/>/);
  assert.match(visibleContent, /<GuidesPreview\s*\/>/);
  assert.match(page, /مشاهده مشاوران و راه‌های تماس/);
  assert.match(page, /نشانی و ارتباط با دفتر/);
});

test("homepage guide previews deep-link to the selected guide", () => {
  assert.match(page, /href=\{`\/guides\?guide=\$\{encodeURIComponent\(guide\.id\)\}`\}/);
  assert.match(page, /DEFAULT_GUIDES\.slice\(0, 3\)/);
});

test("smart recommendations provide useful next steps when there is no personal browsing history", () => {
  assert.match(recommendations, /if \(!ranked\.length\)/);
  assert.match(recommendations, /شروع بودجه‌یابی هوشمند/);
  assert.match(recommendations, /جست‌وجوی هوشمند فایل‌ها/);
});

test("homepage trust and guide cards remain usable on narrow screens", () => {
  assert.match(styles, /\.site-home \.trust-strip-links\s*\{/);
  assert.match(styles, /\.site-home \.home-guides-grid\s*\{/);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\)/);
});
