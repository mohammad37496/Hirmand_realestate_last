import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/properties-marketplace-polish.css", import.meta.url), "utf8");

test("related property cards fill equal-height grid rows despite optional content", () => {
  const relatedCardLayout = css.slice(css.lastIndexOf("/* Related property cards share one grid row"));

  assert.match(relatedCardLayout, /\.property-detail-page \.property-related \.property-grid\s*\{[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch;/);
  assert.match(relatedCardLayout, /\.property-detail-page \.property-related \.pcard\s*\{[^}]*height:\s*100%;/);
  assert.match(relatedCardLayout, /\.property-detail-page \.property-related \.pcard\s*>\s*\.pcard-link\s*\{[^}]*flex:\s*1 1 auto;/);
});
