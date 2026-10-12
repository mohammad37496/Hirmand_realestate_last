/**
 * Dev-only geometric audit of the property-detail redesign: verifies with real
 * layout numbers what a screenshot review would check by eye — no overlap, one
 * fixed bar, paper-theme background (not dark), gallery aspect ratio, tappable
 * targets, and horizontal-overflow across the requested viewport matrix.
 *   node scripts/qa-geometry-audit.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const VILLA = "/properties/" + encodeURIComponent("ویلای-تست-گالری-۳۴۵۵۵۵d4-browser-smoke");

const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1280, 1920];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const problems = [];

// Luminance helpers for theme verification.
function luminance(r, g, b) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(rgb1, rgb2) {
  const [r1, g1, b1] = rgb1.match(/\d+/g).map(Number).slice(0, 3);
  const [r2, g2, b2] = rgb2.match(/\d+/g).map(Number).slice(0, 3);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

for (const width of VIEWPORTS) {
  const isMobile = width <= 720;
  const page = await browser.newPage({ viewport: { width, height: isMobile ? 844 : 800 } });
  await page.goto(BASE + VILLA, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 1. Horizontal overflow.
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    worst: (() => {
      let worst = null;
      let max = 0;
      for (const el of document.querySelectorAll(".property-detail-page *")) {
        const r = el.getBoundingClientRect();
        if (r.right > document.documentElement.clientWidth + 1 && r.width > 0) {
          const over = r.right - document.documentElement.clientWidth;
          if (over > max) {
            max = over;
            worst = el.className && typeof el.className === "string" ? el.className.slice(0, 60) : el.tagName;
          }
        }
      }
      return worst ? `${worst} (+${Math.round(max)}px)` : null;
    })(),
  }));
  if (overflow.doc > 1) problems.push(`${width}px: horizontal overflow ${overflow.doc}px — ${overflow.worst}`);

  // 2. Theme: paper background, not dark.
  const theme = await page.evaluate(() => {
    // Effective background: walk up until a non-transparent layer paints.
    const effectiveBg = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && !/rgba?\(0, 0, 0, 0\)|transparent/i.test(c)) return c;
        node = node.parentElement;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    return {
      page: effectiveBg(document.querySelector(".property-detail-page") ?? document.body),
      summary: effectiveBg(document.querySelector(".property-detail-summary")),
      h1: (() => {
        const el = document.querySelector(".property-detail-page h1");
        return el ? getComputedStyle(el).color : null;
      })(),
    };
  });
  if (theme.page) {
    const l = luminance(...theme.page.match(/\d+/g).map(Number).slice(0, 3));
    if (l < 0.35) problems.push(`${width}px: page background is dark (luminance ${l.toFixed(2)}) — theme regression`);
  }
  if (theme.h1 && theme.summary) {
    const c = contrast(theme.h1, theme.summary);
    if (c < 4.5) problems.push(`${width}px: h1 contrast ${c.toFixed(2)} < 4.5`);
  }

  // 3. Fixed bars: exactly one on mobile, none overlapping content badly.
  const bars = await page.evaluate(() => {
    const visibleFixed = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.display === "none" || s.visibility === "hidden" || r.width <= 0) return null;
      return { sel, position: s.position, top: r.top, bottom: r.bottom, height: r.height, width: r.width };
    };
    return [
      visibleFixed(".property-mobile-actions"),
      visibleFixed(".quick-actions"),
      visibleFixed(".floating-call-menu"),
    ].filter(Boolean);
  });
  const fixedBars = bars.filter((b) => b.position === "fixed");
  if (isMobile && fixedBars.length !== 1) {
    problems.push(`${width}px: expected exactly 1 fixed contact bar, got ${fixedBars.length} (${fixedBars.map((b) => b.sel).join(",") || "none"})`);
  }
  if (!isMobile && fixedBars.length > 0) {
    problems.push(`${width}px: fixed bar leaked to desktop: ${fixedBars.map((b) => b.sel).join(",")}`);
  }

  // 4. Section overlap among the main stacked sections.
  const overlaps = await page.evaluate(() => {
    const sels = [
      ".property-detail-top-gallery",
      ".property-detail-summary",
      ".property-divar-specs",
      ".property-detail-body",
      ".property-location-section",
      ".property-final-cta",
    ];
    const rects = sels
      .map((sel) => {
        const el = document.querySelector(sel);
        return el ? { sel, r: el.getBoundingClientRect() } : null;
      })
      .filter(Boolean)
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const bad = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = x * y;
        const minArea = Math.min(a.width * a.height, b.width * b.height);
        if (area > minArea * 0.5 && area > 400) {
          bad.push(`${rects[i].sel}∩${rects[j].sel}=${Math.round(area)}px²`);
        }
      }
    }
    return bad;
  });
  if (overlaps.length) problems.push(`${width}px: section overlap — ${overlaps.join(", ")}`);

  // 5. Gallery aspect ratio on desktop hero (16/10 ± 0.3) and sane on mobile.
  const gal = await page.evaluate(() => {
    const el = document.querySelector(".property-gallery-main");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, ratio: r.width / Math.max(r.height, 1) };
  });
  if (!gal) problems.push(`${width}px: gallery main missing`);
  else if (!isMobile && Math.abs(gal.ratio - 1.6) > 0.45) {
    problems.push(`${width}px: desktop gallery ratio ${gal.ratio.toFixed(2)} far from 16/10`);
  } else if (gal.h < 150) {
    problems.push(`${width}px: gallery too short (${Math.round(gal.h)}px)`);
  }

  // 6. Tappable targets inside the mobile bar.
  if (isMobile) {
    const small = await page.evaluate(() => {
      const bar = document.querySelector(".property-mobile-actions");
      if (!bar) return [];
      return [...bar.querySelectorAll("a,button")]
        .map((el) => ({ h: el.getBoundingClientRect().height, label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20) }))
        .filter((x) => x.h > 0 && x.h < 40);
    });
    if (small.length) problems.push(`${width}px: bar controls under 40px tall — ${small.map((s) => `"${s.label}" ${Math.round(s.h)}px`).join(", ")}`);
  }

  await page.close();
}

await browser.close();
if (problems.length) {
  console.log("PROBLEMS:");
  problems.forEach((p) => console.log("  " + p));
  process.exitCode = 1;
} else {
  console.log(`GEOMETRY AUDIT OK — all ${VIEWPORTS.length} viewports clean`);
}
