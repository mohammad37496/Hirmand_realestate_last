#!/usr/bin/env node
/**
 * Visual + geometry probe for the property-detail page.
 *
 * Screenshots a live listing across the requested viewport matrix and reports
 * the geometric facts a screenshot review would otherwise catch by eye:
 * horizontal overflow, dark backgrounds, section overlap, element overlap of
 * the fixed bar, touch-target size, and uncaught console errors.
 *
 *   node scripts/qa-visual-matrix.mjs <slug> [label]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const slug = process.argv[2] ?? "ویلای-تست-گالری-۳۴۵۵۵۵d4-browser-smoke";
const label = process.argv[3] ?? "page";
// Optional comma-separated width filter, so one run stays inside the shell
// timeout: node scripts/qa-visual-matrix.mjs <slug> <label> 320,390,1440
const only = process.argv[4] ? new Set(process.argv[4].split(",").map(Number)) : null;
const url = "/properties/" + encodeURIComponent(slug);
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

// The mobile widths the redesign is specified against (iPhone SE through
// iPhone 15 Pro Max, plus the common Android sizes), a landscape phone, the
// tablet edge, and the desktop widths used as a no-regression fingerprint.
const VIEWPORTS = [
  { w: 320, h: 568, name: "320x568" },
  { w: 360, h: 800, name: "360x800" },
  { w: 375, h: 667, name: "375x667" },
  { w: 375, h: 812, name: "375x812" },
  { w: 390, h: 844, name: "390x844" },
  { w: 393, h: 852, name: "393x852" },
  { w: 412, h: 915, name: "412x915" },
  { w: 430, h: 932, name: "430x932" },
  { w: 844, h: 390, name: "844x390-landscape", mobile: true },
  { w: 932, h: 430, name: "932x430-landscape", mobile: true },
  { w: 768, h: 1024, name: "768x1024" },
  { w: 1024, h: 800, name: "1024x800" },
  { w: 1280, h: 800, name: "1280x800" },
  { w: 1440, h: 900, name: "1440x900" },
  { w: 1920, h: 1080, name: "1920x1080" },
];

const luminance = (r, g, b) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const report = [];

for (const vp of VIEWPORTS) {
  if (only && !only.has(vp.w)) continue;
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  const IGNORE =
    /webgl|WebGL|webglcontextcreationerror|Failed to initialize WebGL|BindToCurrentSequence|\/api\/music|Failed to load resource/i;
  const isNoise = (text) => IGNORE.test(text);
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/webgl|WebGL|\/api\/music|Failed to load resource/i.test(t)) return;
    errors.push(t);
  });

  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page
    .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 30000 })
    .catch(() => {});
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const facts = await page.evaluate(() => {
    const luminance = (r, g, b) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const doc = document.documentElement;
    const px = (el, prop) => (el ? parseFloat(getComputedStyle(el)[prop]) || 0 : 0);

    // Worst horizontal offender inside the page.
    let worst = null;
    let max = 0;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) {
        const over = r.right - doc.clientWidth;
        if (over > max) {
          max = over;
          worst =
            typeof el.className === "string" && el.className
              ? el.className.split(/\s+/).slice(0, 3).join(".")
              : el.tagName.toLowerCase();
        }
      }
    }

    // Effective painted background, walking ancestors until one paints.
    const effectiveBg = (el) => {
      let node = el;
      while (node && node !== doc) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/i.test(c)) return c;
        node = node.parentElement;
      }
      return getComputedStyle(doc).backgroundColor;
    };

    // Elements whose painted background is a genuinely unwanted dark surface.
    // Two exclusions matter here:
    //   * the lightbox overlay — the one sanctioned dark surface;
    //   * brand hues. Hirmand's navy (#0b1a2b) is dark by luminance but it is
    //     the brand's primary action colour, so a navy CTA is intentional, not
    //     the "unnecessary black / dark grey" this check is hunting for. A
    //     neutral (low-saturation) dark is the real defect.
    const darkSurfaces = [];
    for (const el of document.querySelectorAll(
      ".property-detail-page, .property-detail-page *",
    )) {
      if (el.closest(".property-lightbox")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40) continue;
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/[\d.]+/g);
      if (!m) continue;
      const [rr, gg, bb, aa = "1"] = m.map(Number);
      if (aa === 0) continue;
      if (luminance(rr, gg, bb) >= 0.22) continue;
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation > 0.25) continue; // a brand hue, not a neutral slab
      darkSurfaces.push(
        (typeof el.className === "string" ? el.className.split(/\s+/)[0] : "") ||
          el.tagName.toLowerCase(),
      );
    }

    // Fixed bar vs. footer/content overlap.
    const bar = document.querySelector(".property-mobile-actions");
    const barRect = bar && getComputedStyle(bar).position === "fixed" ? bar.getBoundingClientRect() : null;
    const barOverlap = [];
    if (barRect) {
      for (const sel of [".site-footer", "footer", ".property-related"]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const y = Math.max(0, Math.min(barRect.bottom, r.bottom) - Math.max(barRect.top, r.top));
        const x = Math.max(0, Math.min(barRect.right, r.right) - Math.max(barRect.left, r.left));
        if (x * y > 400) barOverlap.push(sel);
      }
    }

    const smallTargets = [];
    for (const el of document.querySelectorAll(
      ".property-mobile-actions a, .property-mobile-actions button, .property-primary-contact a, .property-gallery-open, .property-gallery-nav, .property-gallery-thumb",
    )) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44 && r.top < innerHeight * 3) {
        smallTargets.push(
          ((el.textContent || "").trim().slice(0, 12) || el.className.split(/\s+/)[0]) +
            " " +
            Math.round(r.height) + "px",
        );
      }
    }

    const gal = document.querySelector(".property-gallery-main");
    const galRect = gal?.getBoundingClientRect();

    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      worst,
      pageBg: effectiveBg(document.querySelector(".property-detail-page") ?? document.body),
      summaryBg: effectiveBg(document.querySelector(".property-detail-summary")),
      h1Color: (() => {
        const el = document.querySelector(".property-detail-page h1");
        return el ? getComputedStyle(el).color : null;
      })(),
      h1: document.querySelector(".property-detail-page h1")?.textContent?.trim() ?? "",
      darkSurfaces: [...new Set(darkSurfaces)],
      barOverlap,
      smallTargets,
      padBottom: px(document.querySelector(".property-detail-page"), "paddingBottom"),
      gallery: galRect ? { w: Math.round(galRect.width), h: Math.round(galRect.height), ratio: +(galRect.width / Math.max(galRect.height, 1)).toFixed(2) } : null,
      fixedBars: [...document.querySelectorAll(".property-mobile-actions, .quick-actions, .floating-call-menu")]
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.position === "fixed" && s.display !== "none" && r.height > 0;
        })
        .length,
      h1Count: document.querySelectorAll(".property-detail-page h1").length,
    };
  });

  const bgL = luminance(...facts.pageBg.match(/\d+/g).map(Number).slice(0, 3));
  const problems = [];
  const realErrors = errors.filter((e) => !isNoise(e));
  if (facts.overflow > 1) problems.push(`overflow ${facts.overflow}px (${facts.worst})`);
  if (bgL < 0.35) problems.push(`page bg dark, luminance ${bgL.toFixed(2)}`);
  if (facts.darkSurfaces.length) problems.push(`dark surfaces: ${facts.darkSurfaces.join(", ")}`);
  if (facts.barOverlap.length) problems.push(`fixed bar overlaps ${facts.barOverlap.join(", ")}`);
  if (facts.smallTargets.length) problems.push(`targets <44px: ${facts.smallTargets.join(", ")}`);
  // A landscape phone is 844px *wide*, so width alone misclassifies it. The
  // viewport list carries an explicit mobile flag for exactly this reason.
  const isMobile = vp.mobile ?? vp.w <= 720;
  if (isMobile && facts.fixedBars !== 1) problems.push(`fixed bars on mobile: ${facts.fixedBars}`);
  if (!isMobile && facts.fixedBars > 0) problems.push(`fixed bar leaked to desktop: ${facts.fixedBars}`);
  if (isMobile && facts.padBottom < 100) problems.push(`padding-bottom ${facts.padBottom}px < 100`);
  if (realErrors.length) problems.push(`console: ${realErrors.slice(0, 2).join(" | ")}`);
  if (!facts.h1) problems.push("no h1");

  await page.screenshot({ path: `${outDir}/${label}-${vp.name}.png`, fullPage: true });
  await page.screenshot({ path: `${outDir}/${label}-${vp.name}-fold.png` });

  report.push({
    viewport: `${vp.w}x${vp.h}`,
    ok: problems.length === 0,
    problems,
    bg: facts.pageBg,
    summaryBg: facts.summaryBg,
    h1Color: facts.h1Color,
    h1Count: facts.h1Count,
    gallery: facts.gallery,
    padBottom: facts.padBottom,
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ url, report }, null, 2));
process.exitCode = report.some((r) => !r.ok) ? 1 : 0;
