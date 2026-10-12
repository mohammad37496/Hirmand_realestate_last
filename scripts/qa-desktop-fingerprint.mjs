#!/usr/bin/env node
/**
 * Desktop no-regression fingerprint.
 *
 * A mobile-scoped change is only safe if the desktop layout is provably
 * untouched. This dumps the geometry, paint and typography of the property-detail
 * page's key regions at desktop widths as one hashable JSON blob. Run it before
 * and after a change; the two must be byte-identical.
 *
 *   node scripts/qa-desktop-fingerprint.mjs <slug> [outfile] [widths]
 *
 * `widths` defaults to the desktop no-regression set; pass e.g. `320,390,430`
 * to fingerprint mobile instead. The same blob format is used for both, so a
 * before/after diff is a plain `diff`.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const slug = process.argv[2] ?? "آپارتمان-لوکس-چشم‌انداز-اصفهان-qa-rich";
const outfile = process.argv[3] ?? "";
const WIDTHS = process.argv[4]
  ? process.argv[4].split(",").map(Number)
  : [1024, 1280, 1440, 1920];

const REGIONS = [
  ".property-detail-page",
  ".property-breadcrumb",
  ".property-detail-top",
  ".property-detail-top-gallery",
  ".property-gallery",
  ".property-gallery-main",
  ".property-gallery-rail",
  ".property-gallery-open",
  ".property-gallery-counter",
  ".property-detail-summary",
  ".property-detail-hero-row",
  ".property-detail-page h1",
  ".property-detail-meta",
  ".property-price-block",
  ".property-price-value",
  ".property-primary-contact",
  ".property-tools-heading",
  ".property-actions",
  ".property-summary-facts",
  ".property-detail-content",
  ".property-detail-main",
  ".property-detail-aside",
  ".property-detail-aside-inner",
  ".property-specs-accordion",
  ".property-specs-accordion-body",
  ".property-spec-group",
  ".property-spec-grid",
  ".property-spec-item",
  ".property-spec-amenities",
  ".property-spec-amenity-item",
  ".property-section-heading",
  ".property-description-meta",
  ".property-description-copy p",
  ".property-features li",
  ".property-location-section",
  ".property-map-card",
  ".property-final-cta",
  ".property-contact-card",
  ".property-quick-overview-list",
  ".property-related",
  ".property-grid",
  ".property-mobile-actions",
];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const snapshot = {};
for (const width of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width, height: width >= 1024 ? 900 : 844 },
  });
  await page.goto(
    BASE + "/properties/" + encodeURIComponent(slug),
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );
  await page
    .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 30000 })
    .catch(() => {});
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);

  snapshot[width] = await page.evaluate((sels) => {
    const out = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        out[sel] = "missing";
        continue;
      }
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out[sel] = [
        Math.round(r.width),
        Math.round(r.height),
        s.backgroundColor,
        s.color,
        s.fontSize,
        s.lineHeight,
        s.fontWeight,
        s.borderRadius,
        s.padding,
        s.gap,
        s.display,
        s.gridTemplateColumns,
      ].join("|");
    }
    out.__overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  }, REGIONS);

  await page.close();
}

await browser.close();

const json = JSON.stringify(snapshot, null, 2);
if (outfile) {
  writeFileSync(outfile, json);
  console.log("wrote", outfile);
} else {
  console.log(json);
}
