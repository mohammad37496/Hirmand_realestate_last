import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/routes/guides.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/guides.css", import.meta.url), "utf8");

test("guides page uses the Hirmand visual system and readable Persian typography", () => {
  assert.match(page, /guides-hero/);
  assert.match(page, /guides-discovery/);
  assert.match(page, /guides-cta/);
  assert.match(styles, /--guides-deep:\s*#173d39/);
  assert.match(styles, /--guides-gold:\s*#c48a3a/);
  assert.match(styles, /font-family:\s*var\(--font,\s*"Vazirmatn"/);
  assert.match(styles, /color:\s*var\(--guides-text\)/);
});

test("guide search, category filters, accordion and sharing remain accessible", () => {
  assert.match(page, /aria-label="جستجو در متن راهنماها"/);
  assert.match(page, /aria-pressed=\{category === item\}/);
  assert.match(page, /aria-expanded=\{open\}/);
  assert.match(page, /aria-controls=\{panelId\}/);
  assert.match(page, /اشتراک‌گذاری این راهنما/);
  assert.match(page, /نمایش همه راهنماها/);
});

test("guide page remains responsive and respects reduced-motion preferences", () => {
  assert.match(styles, /@media\s*\(max-width:\s*820px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*620px\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /grid-template-columns:\s*36px minmax\(0,1fr\) 20px/);
});
