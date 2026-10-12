#!/usr/bin/env node
/**
 * Per-section mobile audit for the property-detail page.
 *
 * `qa-visual-matrix.mjs` answers "is anything broken at this width"; this
 * answers "which section is wrong, and by how much", for each of the areas
 * the mobile brief calls out: header, breadcrumb, gallery, title, price, spec
 * grid, accordions, description, amenities, map, the fixed CTA bar and safe
 * areas. Every check is measured off the live layout, so the report is a list
 * of real numbers rather than a screenshot review.
 *
 *   node scripts/qa-mobile-detail.mjs <slug> [widths]
 *
 * Widths default to the required portrait matrix; pass landscape sizes too,
 * e.g. `node scripts/qa-mobile-detail.mjs <slug> 844x390`.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const slug = process.argv[2] ?? "ویلای-تست-گالری-۳۴۵۵۵۵d4-browser-smoke";
const raw = process.argv[3] ?? "320,360,375,390,393,412,430";
const sizes = raw.split(",").map((token) => {
  const [w, h] = token.trim().split(/[x×]/).map(Number);
  // A bare width gets a realistic portrait height; landscape callers pass "WxH".
  return { w, h: h ?? (w <= 500 ? 844 : 900) };
});
const url = "/properties/" + encodeURIComponent(slug);
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const probe = () => {
  const doc = document.documentElement;
  const box = (sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      l: +r.left.toFixed(1),
      r: +r.right.toFixed(1),
      t: +r.top.toFixed(1),
      b: +r.bottom.toFixed(1),
      fs: s.fontSize,
      lh: s.lineHeight,
      fw: s.fontWeight,
      disp: s.display,
      pos: s.position,
      pad: s.padding,
      gtc: s.gridTemplateColumns,
      of: s.objectFit,
      radius: s.borderRadius,
      clip: s.overflow === "hidden" ? "hidden" : s.overflow,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    };
  };
  const all = (sel) => [...document.querySelectorAll(sel)];

  // Every element whose painted box escapes the viewport horizontally.
  const bleeding = [];
  for (const el of all("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
      bleeding.push({
        sel: (typeof el.className === "string" && el.className
          ? "." + el.className.split(/\s+/).slice(0, 3).join(".")
          : el.tagName.toLowerCase()),
        over: +(r.right - doc.clientWidth).toFixed(1),
        left: +r.left.toFixed(1),
        w: +r.width.toFixed(1),
      });
    }
  }
  bleeding.sort((a, b) => b.over - a.over || a.left - b.left);

  // Long words / unbroken strings that break a narrow column.
  const tight = [];
  for (const el of all(".property-detail-page *")) {
    if (el.children.length) continue;
    const t = (el.textContent || "").trim();
    if (t.length < 12) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (el.scrollWidth > el.clientWidth + 2) {
      tight.push({
        sel: (typeof el.className === "string" && el.className
          ? "." + el.className.split(/\s+/).slice(0, 2).join(".")
          : el.tagName.toLowerCase()),
        text: t.slice(0, 30),
        cw: el.clientWidth,
        sw: el.scrollWidth,
      });
    }
  }

  // Pairwise overlap between the page's major blocks. A screenshot review
  // catches this by eye; measuring it means it cannot regress unnoticed.
  const SECTION_SELECTORS = [
    ".property-breadcrumb",
    ".property-gallery",
    ".property-detail-summary",
    ".property-divar-specs",
    ".property-detail-body",
    ".property-location-section",
    ".property-quick-overview",
    ".property-related",
    ".property-final-cta",
  ];
  const sectionBoxes = SECTION_SELECTORS.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.height === 0) return null;
    return { sel, top: r.top + scrollY, bottom: r.bottom + scrollY };
  }).filter(Boolean);
  const overlaps = [];
  for (let i = 0; i < sectionBoxes.length; i++) {
    for (let j = i + 1; j < sectionBoxes.length; j++) {
      const a = sectionBoxes[i];
      const b = sectionBoxes[j];
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (y > 2) overlaps.push(`${a.sel} n ${b.sel} ${Math.round(y)}px`);
    }
  }

  // Leaves whose own content does not fit and is clipped rather than scrolled.
  const clipped = [];
  for (const el of all(".property-detail-page *")) {
    if (el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.overflow === "visible" && s.overflowX === "visible") continue;
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
      clipped.push(
        `${(typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/)[0] : el.tagName.toLowerCase())} ${el.scrollWidth}/${el.clientWidth}`,
      );
    }
  }

  // Colours of the copy a phone user actually reads, against the surface it is
  // painted on. Only the colours are collected here; the WCAG ratio is
  // computed in Node after the page returns, where the maths can be trusted
  // and unit-checked (see `contrastRatio` below).
  const parseColor = (value) => {
    const m = (value.match(/[\d.]+/g) || []).map(Number);
    return m.length >= 3 ? { c: m.slice(0, 3), a: m[3] ?? 1 } : null;
  };
  const effectiveBg = (el) => {
    let node = el;
    while (node && node !== doc) {
      const p = parseColor(getComputedStyle(node).backgroundColor);
      if (p && p.a > 0.05) return p.c;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const hex = (c) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  const contrast = [];
  for (const [name, sel] of [
    ["h1", ".property-detail-page h1"],
    ["price", ".property-price-value"],
    ["specValue", ".property-spec-item strong"],
    ["specLabel", ".property-spec-item small"],
    ["desc", ".property-description-copy p"],
    ["lead", ".property-description-copy p:first-child"],
    ["breadcrumb", ".property-breadcrumb"],
    ["barLabel", ".property-mobile-action span"],
    ["mapCaption", ".property-map-actions"],
    ["fileCode", ".property-file-code"],
    ["amenity", ".property-spec-amenity-item strong"],
  ]) {
    const el = document.querySelector(sel);
    if (!el) {
      contrast.push({ name, ratio: null });
      continue;
    }
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) {
      contrast.push({ name, fg: null, bg: null });
      continue;
    }
    contrast.push({
      name,
      size: cs.fontSize,
      weight: cs.fontWeight,
      fg: hex(fg.c),
      bg: hex(effectiveBg(el)),
    });
  }

  const header = document.querySelector("header.site-header, .site-header, header");
  const bar = document.querySelector(".property-mobile-actions");
  const barBox = bar ? box(bar) : null;
  const barStyle = bar ? getComputedStyle(bar) : null;

  // Which CSS rule actually wins for the fixed bar on this width.
  const barSources = [];
  if (bar) {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const walk = (list, media) => {
        for (const rule of list) {
          if (rule.media) {
            walk(rule.cssRules, rule.media.mediaText);
            continue;
          }
          if (!rule.selectorText) continue;
          if (!/\.property-mobile-actions\b/.test(rule.selectorText)) continue;
          if (media && !window.matchMedia(media).matches) continue;
          if (!media && !window.matchMedia(rule.conditionText || "all").matches) continue;
          try {
            if (!bar.matches(rule.selectorText)) continue;
          } catch {
            continue;
          }
          barSources.push({
            href: (sheet.href || "inline").split("/").pop(),
            sel: rule.selectorText.replace(/\s+/g, " ").slice(0, 80),
            media: media ?? null,
            inset: rule.style.inset || null,
            ib: rule.style.insetBlockEnd || rule.style.bottom || null,
            bg: rule.style.background || rule.style.backgroundColor || null,
            pad: rule.style.padding || null,
          });
        }
      };
      walk(rules, null);
    }
  }

  // Which rules match the viewport band, so a hidden fixed bar is explainable.
  const bands = [];
  for (const width of [320, 360, 375, 390, 393, 412, 430, 700, 720, 760, 844, 900, 932, 1024]) {
    bands.push({ width, active: bands.active });
  }

  const accordionBodies = all(".property-specs-accordion-body").map((el) => ({
    ...box(el),
    open: el.getAttribute("data-open") ?? el.className,
    text: (el.textContent || "").trim().slice(0, 24),
  }));
  const accordions = all(".property-specs-accordion").map((el) => ({
    summaryH: box(".property-specs-accordion-summary", el)?.h ?? null,
    bodyH: box(".property-specs-accordion-body", el)?.h ?? null,
    open: el.getAttribute("data-open"),
  }));

  const specGrid = box(".property-divar-specs");
  const specCards = all(".property-spec-item").map((el) => box(el));
  const amen = box(".property-spec-amenities-body");
  const amenItems = all(".property-spec-amenity-item").map((el) => box(el));

  const mainImg = document.querySelector(".property-gallery-main img, .property-gallery-main picture img");
  const mainBox = box(".property-gallery-main");

  const iframe = document.querySelector(".property-location-section iframe, .property-map iframe, iframe");
  const finalCta = box(".property-final-cta");

  return {
    vw: innerWidth,
    vh: innerHeight,
    dsw: doc.scrollWidth,
    dcw: doc.clientWidth,
    overflow: doc.scrollWidth - doc.clientWidth,
    bleeding: bleeding.slice(0, 8),
    tight: tight.slice(0, 8),
    overlaps,
    clipped: clipped.slice(0, 8),
    contrast,
    bands,
    header: header ? { ...box(header), padTop: getComputedStyle(header).paddingTop } : null,
    headerOverlap: (() => {
      const h = header?.getBoundingClientRect();
      const first = document.querySelector(".property-detail-page")?.getBoundingClientRect();
      if (!h || !first) return null;
      return +(first.top - h.bottom).toFixed(1);
    })(),
    breadcrumb: box(".property-breadcrumb"),
    breadcrumbScroll: (() => {
      const el = document.querySelector(".property-breadcrumb");
      return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null;
    })(),
    gallery: {
      main: mainBox,
      mainImg: mainImg
        ? {
            box: box(mainImg),
            natural: [mainImg.naturalWidth, mainImg.naturalHeight],
            complete: mainImg.complete,
          }
        : null,
      counter: box(".property-gallery-counter"),
      counterText: (document.querySelector(".property-gallery-counter")?.textContent || "").trim(),
      open: box(".property-gallery-open"),
      rail: (() => {
        const el = document.querySelector(".property-gallery-rail");
        return el ? { ...box(el), sw: el.scrollWidth, cw: el.clientWidth } : null;
      })(),
      thumbs: all(".property-gallery-thumb").slice(0, 3).map((el) => box(el)),
      thumbCount: all(".property-gallery-thumb").length,
      navs: all(".property-gallery-nav").map((el) => box(el)),
    },
    summary: box(".property-detail-summary"),
    h1: box(".property-detail-page h1"),
    price: box(".property-detail-page .property-price, .property-detail-summary .property-price"),
    priceText: (() => {
      const el = document.querySelector(".property-detail-summary .property-price, .property-detail-page .property-price");
      return el ? el.textContent.trim().slice(0, 40) : null;
    })(),
    specGrid,
    specCardCount: specCards.length,
    specCardWidths: [...new Set(specCards.map((c) => Math.round(c.w)))],
    specCardHeights: [...new Set(specCards.map((c) => Math.round(c.h)))],
    specOverflow: specCards.filter((c) => c.r > doc.clientWidth + 1).length,
    amenities: amen,
    amenCols: amen ? amen.gtc : null,
    amenItemHeights: [...new Set(amenItems.map((c) => Math.round(c.h)))],
    amenOverflow: amenItems.filter((c) => c.r > doc.clientWidth + 1).length,
    accordions,
    accordionBodies: accordionBodies.map((b) => ({ w: b.w, sw: b.sw, cw: b.cw, h: b.h })),
    accordionOverflow: accordionBodies.filter((b) => b.sw > b.cw + 2).length,
    desc: (() => {
      const ps = all(".property-description-copy p");
      return {
        count: ps.length,
        sizes: [...new Set(ps.map((p) => getComputedStyle(p).fontSize))],
        lineHeights: [...new Set(ps.map((p) => getComputedStyle(p).lineHeight))],
        widest: ps.length ? Math.max(...ps.map((p) => p.getBoundingClientRect().width)).toFixed(1) : null,
        fontFamily: ps.length ? getComputedStyle(ps[0]).fontFamily.split(",")[0] : null,
        overflowing: ps.filter((p) => p.scrollWidth > p.clientWidth + 2).length,
      };
    })(),
    map: iframe
      ? {
          box: box(iframe),
          container: box(iframe.closest(".property-map, .property-location-section") || iframe.parentElement),
          radius: getComputedStyle(iframe).borderRadius,
          src: (iframe.src || "").slice(0, 40),
        }
      : null,
    mapOverflow: (() => {
      const el = document.querySelector(".property-location-section");
      if (!el) return null;
      return el.scrollWidth - el.clientWidth;
    })(),
    video: (() => {
      const v = document.querySelector(".property-detail-page video");
      if (!v) return null;
      const c = v.closest(".property-video, .property-detail-video") || v.parentElement;
      return { box: box(v), container: box(c), controls: v.controls, poster: !!v.poster };
    })(),
    bar: barBox
      ? {
          ...barBox,
          bottomCss: barStyle.bottom,
          topCss: barStyle.top,
          pb: barStyle.paddingBottom,
          bg: barStyle.backgroundColor,
          z: barStyle.zIndex,
          cols: barStyle.gridTemplateColumns,
          actions: [...bar.querySelectorAll("a,button")].map((el) => ({
            ...box(el),
            label: (el.textContent || "").trim().slice(0, 14),
          })),
          overflowing: [...bar.querySelectorAll("a,button")].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > doc.clientWidth + 1 || r.left < -1 || el.scrollWidth > el.clientWidth + 2;
          }).length,
        }
      : null,
    barVisible: !!bar && barStyle.display !== "none" && barBox.h > 0,
    barSources,
    padBottom: (() => {
      const el = document.querySelector(".property-detail-page");
      return el ? parseFloat(getComputedStyle(el).paddingBottom) : null;
    })(),
    finalCta: finalCta,
    finalCtaOverflow: (() => {
      const el = document.querySelector(".property-final-cta");
      return el ? el.scrollWidth - el.clientWidth : null;
    })(),
    // Bottom-most content vs. the fixed bar: is anything permanently hidden?
    barClearance: (() => {
      const page = document.querySelector(".property-detail-page");
      if (!page || !barBox || !barStyle || barStyle.position !== "fixed") return null;
      return +(
        page.getBoundingClientRect().bottom -
        doc.scrollHeight -
        barBox.h +
        (parseFloat(barStyle.bottom) || 0)
      ).toFixed(1);
    })(),
    touchTargets: (() => {
      const sel = [
        ".property-mobile-actions a",
        ".property-mobile-actions button",
        ".property-primary-contact a",
        ".property-primary-contact button",
        ".property-gallery-open",
        ".property-gallery-nav",
        ".property-gallery-thumb",
        ".property-specs-accordion-summary",
        ".property-actions a",
        ".property-actions button",
        ".property-final-cta a",
        ".property-final-cta button",
        ".property-breadcrumb a",
        ".site-header a",
        ".site-header button",
      ].join(",");
      const small = [];
      for (const el of all(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height < 44 || r.width < 44) {
          small.push(
            `${(typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : el.tagName.toLowerCase())} ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return [...new Set(small)];
    })(),
    // Buttons whose label wraps to more than one line inside a fixed bar.
    // Counting rects of the label's own text range is exact; dividing the
    // button's height by its line-height is not, because the button also has
    // padding and an icon.
    wrappedLabels: (() => {
      if (!bar) return [];
      const out = [];
      for (const el of bar.querySelectorAll("a,button")) {
        const range = document.createRange();
        let found = null;
        for (const node of el.childNodes) {
          if (node.nodeType === 3 && node.textContent.trim()) {
            range.selectNodeContents(node);
            found = range;
            break;
          }
        }
        if (!found) continue;
        const rects = [...found.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        if (tops.size > 1) {
          out.push(`${(el.textContent || "").trim().slice(0, 12)} ${tops.size}L`);
        }
      }
      return out;
    })(),
  };
};

const report = [];
// WCAG 2.1 relative luminance / contrast ratio.
const srgb = (channel) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const rgbOf = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const contrastRatio = (fgHex, bgHex) => {
  const a = luminance(rgbOf(fgHex));
  const b = luminance(rgbOf(bgHex));
  return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
};

for (const { w, h } of sizes) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: h > w,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/webgl|\/api\/music|Failed to load resource/i.test(t)) return;
    errors.push(t);
  });
  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page
    .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 30000 })
    .catch(() => {});
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);

  const facts = await page.evaluate(probe);
  facts.consoleErrors = errors;
  for (const entry of facts.contrast ?? []) {
    entry.ratio = entry.fg && entry.bg ? contrastRatio(entry.fg, entry.bg) : null;
  }
  facts.lowContrast = (facts.contrast ?? [])
    .filter((entry) => entry.ratio !== null && entry.ratio < 4.5)
    .map((entry) => `${entry.name} ${entry.ratio} (${entry.fg} on ${entry.bg} @${entry.size})`);
  await page.screenshot({
    path: `${outDir}/mob-${w}x${h}.png`,
    fullPage: true,
  });
  report.push(facts);
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ url, report }, null, 2));
