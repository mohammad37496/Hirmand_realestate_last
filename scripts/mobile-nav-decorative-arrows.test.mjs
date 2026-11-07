import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(new URL("../src/components/hirmand/header.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/header-redesign.css", import.meta.url), "utf8");

test("mobile primary navigation has no decorative trailing arrows", () => {
  const mobilePrimaryNav = header.slice(header.indexOf('<div className="mobile-nav-section">'), header.indexOf('<div className="mobile-nav-section mobile-action-section">'));
  assert.doesNotMatch(mobilePrimaryNav, /mobile-menu-link-arrow|<span[^>]*>←<\/span>/);
  assert.doesNotMatch(styles, /mobile-menu-link-arrow/);
});

test("functional finance-tools disclosure chevron remains accessible", () => {
  assert.match(header, /aria-expanded=\{financeOpen\}/);
  assert.match(header, /aria-controls="mobile-finance-tools"/);
  assert.match(header, /<ChevronDown size=\{18\} aria-hidden="true" className="mobile-tools-trigger-icon" \/>/);
});
