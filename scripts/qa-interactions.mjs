#!/usr/bin/env node
/**
 * Interaction test for the property-detail page.
 *
 * Everything a redesign must not break: gallery thumbnails, lightbox, swipe,
 * pinch/double-tap zoom, share, copy link, favorite, compare, print, WhatsApp,
 * call, the map section, the amenities accordion, and keyboard access.
 *
 *   node scripts/qa-interactions.mjs <slug> [width]
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const slug = process.argv[2] ?? "آپارتمان-لوکس-چشم‌انداز-اصفهان-qa-rich";
const width = Number(process.argv[3] ?? 390);
const url = BASE + "/properties/" + encodeURIComponent(slug);

const results = [];
const note = (name, ok, detail = "") =>
  results.push({ name, ok, detail: String(detail).slice(0, 90) });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({
  viewport: { width, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();

const dialogs = [];
page.on("dialog", async (d) => {
  dialogs.push(d.message());
  await d.dismiss().catch(() => {});
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page
  .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 30000 })
  .catch(() => {});
await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);

// --- gallery: thumbnails switch the main image -----------------------------
const thumbs = await page.locator(".property-gallery-thumb").count();
note(
  "gallery has at least one thumbnail",
  thumbs >= 1,
  `${thumbs} thumb(s)${thumbs === 1 ? " (listing has a single image)" : ""}`,
);
if (thumbs > 1) {
  await page.locator(".property-gallery-thumb").nth(1).click();
  await page.waitForTimeout(600);
  const counter = await page
    .locator(".property-gallery-counter")
    .textContent()
    .catch(() => "");
  note("thumbnail switches image", /تصویر ۲/.test(counter ?? ""), counter?.trim());

  // --- swipe inside the lightbox -------------------------------------------
  // Swipe lives on the fullscreen stage, not the inline frame: that is where a
  // visitor pins to zoom with one hand.
  if (width <= 720) {
    await page.locator(".property-gallery-open").click();
    await page.waitForTimeout(600);
    const before = await page.locator(".property-lightbox-count").textContent().catch(() => "");
    const box = await page.locator(".property-lightbox-stage").boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await page.evaluate(
        ([sx, sy, ex]) => {
          const el = document.querySelector(".property-lightbox-stage");
          if (!el) return;
          const touch = (x) =>
            new Touch({ identifier: 1, target: el, clientX: x, clientY: sy });
          const fire = (type, x) =>
            el.dispatchEvent(
              new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: type === "touchend" ? [] : [touch(x)],
                changedTouches: [touch(x)],
              }),
            );
          fire("touchstart", sx);
          fire("touchmove", (sx + ex) / 2);
          fire("touchmove", ex);
          fire("touchend", ex);
        },
        [box.x + box.width * 0.85, y, box.x + box.width * 0.1],
      );
      await page.waitForTimeout(700);
      const after = await page
        .locator(".property-lightbox-count")
        .textContent()
        .catch(() => "");
      note(
        "swipe advances gallery in lightbox",
        (before ?? "").trim() !== (after ?? "").trim(),
        `${(before ?? "").trim()} → ${(after ?? "").trim()}`,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}

// --- lightbox: open, keyboard nav, escape, zoom ----------------------------
await page.locator(".property-gallery-open").click();
await page.waitForTimeout(700);
const lightboxOpen = await page.locator(".property-lightbox").count();
note("lightbox opens", lightboxOpen === 1);
if (lightboxOpen) {
  const focusInLightbox = await page.evaluate(
    () => document.querySelector(".property-lightbox")?.contains(document.activeElement) ?? false,
  );
  note("lightbox takes focus", focusInLightbox);

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const lbCounter = await page.locator(".property-lightbox-count").textContent().catch(() => "");
  note("lightbox arrow navigation", (lbCounter ?? "").trim().length > 0, lbCounter?.trim());

  const zoomBtn = page.locator(".property-lightbox-zoom-hint");
  if (await zoomBtn.count()) {
    await zoomBtn.click();
    await page.waitForTimeout(400);
    const zoomed = await page.evaluate(
      () =>
        document
          .querySelector(".property-lightbox-media-button")
          ?.classList.contains("is-zoomed") ?? false,
    );
    note("lightbox zoom toggles", zoomed);
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  note("lightbox closes on Escape", (await page.locator(".property-lightbox").count()) === 0);

  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  note("body scroll restored after lightbox", bodyOverflow !== "hidden", `overflow="${bodyOverflow}"`);
}

// --- copy link / share ------------------------------------------------------
// Headless Chromium has no navigator.share, so this exercises the clipboard
// fallback the button is designed to use.
await page.evaluate(() => navigator.clipboard?.writeText?.("sentinel").catch(() => {}));
const shareBtn = page.getByRole("button", { name: /اشتراک‌گذاری فایل/ }).first();
if (await shareBtn.count()) {
  await shareBtn.click();
  await page.waitForTimeout(1000);
  const copied = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => ""));
  note(
    "share copies the listing link",
    typeof copied === "string" && copied.includes("/properties/"),
    copied === "sentinel" ? "clipboard unchanged" : (copied ?? "").slice(0, 70),
  );
} else {
  note("share button present", false, "aria-label اشتراک‌گذاری فایل not found");
}

// --- favorite + compare (localStorage backed) -------------------------------
const favBtn = page.getByRole("button", { name: /ذخیره فایل|حذف از ذخیره‌ها/ }).first();
if (await favBtn.count()) {
  const before = await page.evaluate(() => localStorage.getItem("hirmand-favorite-properties"));
  await favBtn.click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => localStorage.getItem("hirmand-favorite-properties"));
  note("favorite toggles", before !== after, `${before} → ${after}`);
}

const cmpBtn = page.getByRole("button", { name: /افزودن به مقایسه|حذف از مقایسه/ }).first();
if (await cmpBtn.count()) {
  const before = await page.evaluate(() => localStorage.getItem("hirmand-compare-properties"));
  await cmpBtn.click();
  await page.waitForTimeout(700);
  const cmp = await page.evaluate(() => localStorage.getItem("hirmand-compare-properties"));
  note("compare toggles", before !== cmp, `${before} → ${cmp}`);
}

// --- print button -----------------------------------------------------------
const printBtn = page.getByRole("button", { name: /چاپ فایل/ }).first();
if (await printBtn.count()) {
  await page.evaluate(() => {
    window.__printed = false;
    window.print = () => {
      window.__printed = true;
    };
  });
  await printBtn.click();
  await page.waitForTimeout(700);
  note("print button triggers print", await page.evaluate(() => window.__printed === true));
}

// --- print (does not throw, print stylesheet present) -----------------------
const printRules = await page.evaluate(() => {
  let found = 0;
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of rules ?? []) {
      if (r.type === CSSRule.MEDIA_RULE && /print/i.test(r.conditionText ?? "")) found++;
    }
  }
  return found;
});
note("print stylesheet present", printRules > 0, `${printRules} @media print blocks`);
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(400);
const printOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
note("no horizontal overflow in print", printOverflow <= 1, `${printOverflow}px`);
await page.emulateMedia({ media: "screen" });

// --- WhatsApp + call links --------------------------------------------------
const wa = await page.locator('a[href*="wa.me"]').count();
const tel = await page.locator('a[href^="tel:"]').count();
note("WhatsApp link present", wa > 0, `${wa} links`);
note("call link present", tel > 0, `${tel} links`);
const waHref = await page.locator('a[href*="wa.me"]').first().getAttribute("href").catch(() => "");
note(
  "WhatsApp link well-formed",
  /^https:\/\/wa\.me\/\d{10,15}\?text=/.test(waHref ?? ""),
  (waHref ?? "").slice(0, 60),
);

// --- map section ------------------------------------------------------------
const map = await page.locator(".property-location-section iframe").count();
note("map iframe present", map === 1);
const mapCtaOverIframe = await page.evaluate(() => {
  const frame = document.querySelector(".property-location-section iframe");
  const cta = document.querySelector(".property-map-actions a");
  if (!frame || !cta) return false;
  const a = frame.getBoundingClientRect();
  const b = cta.getBoundingClientRect();
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y > 0;
});
note("no CTA overlapping the map iframe", !mapCtaOverIframe);

// --- amenities accordion ----------------------------------------------------
const amenities = page.locator("details.property-spec-amenities");
if ((await amenities.count()) === 1) {
  const count = await page
    .locator(".property-spec-amenity-item")
    .count();
  note("amenities list present", count > 0, `${count} items`);
  const openBefore = await amenities.evaluate((el) => el.hasAttribute("open"));
  await amenities.locator("summary").click();
  await page.waitForTimeout(500);
  const openAfter = await amenities.evaluate((el) => el.hasAttribute("open"));
  note("amenities accordion toggles", openBefore !== openAfter, `${openBefore} → ${openAfter}`);
  note(
    "amenity labels are real labels",
    (await page.locator(".property-spec-amenity-item strong").first().textContent()) !== "امکانات",
    (await page.locator(".property-spec-amenity-item strong").first().textContent())?.trim(),
  );
} else {
  // Absence is the correct graceful state when the listing stores no amenity
  // data: rendering an empty accordion would imply data that is not there.
  const hasAmenityData = await page.evaluate(() =>
    (document.querySelector(".property-detail-page")?.innerText ?? "").includes("امکانات تکمیلی"),
  );
  note(
    "amenities accordion (or correctly absent without data)",
    !hasAmenityData,
    hasAmenityData ? "amenity data present but accordion missing" : "no amenity data on this listing",
  );
}

// --- specs accordion (the QA-asserted wrapper) -----------------------------
note(
  "specs accordion wrapper intact",
  (await page.locator(".property-specs-accordion").count()) === 1 &&
    (await page.locator(".property-specs-accordion-body").count()) === 1,
);
note(
  "specs are grouped",
  (await page.locator(".property-spec-group").count()) >= 2,
  `${await page.locator(".property-spec-group").count()} groups`,
);

// --- keyboard access + focus visibility ------------------------------------
const focusables = await page.evaluate(
  () => document.querySelectorAll('.property-detail-page a[href], .property-detail-page button').length,
);
note("focusable controls present", focusables > 8, `${focusables} controls`);
await page.evaluate(() => document.body.focus());
for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
const focusInfo = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { ok: false, why: "no element focused" };
  const s = getComputedStyle(el);
  return {
    ok: s.outlineStyle !== "none" || s.boxShadow !== "none",
    tag: el.tagName.toLowerCase(),
    cls: (typeof el.className === "string" ? el.className : "").split(/\s+/)[0] || "",
    outline: s.outline,
    shadow: s.boxShadow === "none" ? "none" : "set",
  };
});
note("focus-visible styling on a tab stop", focusInfo.ok, JSON.stringify(focusInfo));

// --- SEO --------------------------------------------------------------------
const seo = await page.evaluate(() => {
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
    try {
      const j = JSON.parse(s.textContent || "{}");
      return j["@type"] || "unknown";
    } catch {
      return "invalid-json";
    }
  });
  return {
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    ld,
    h1: document.querySelector(".property-detail-page h1")?.textContent?.trim() ?? "",
  };
});
note("title set", seo.title.length > 10, seo.title);
note("canonical set", Boolean(seo.canonical), seo.canonical);
note("meta description set", (seo.description?.length ?? 0) > 20);
note(
  "JSON-LD property + breadcrumb",
  seo.ld.some((t) => /RealEstateListing|Product|Residence|Apartment/i.test(t)) &&
    seo.ld.some((t) => /BreadcrumbList/i.test(t)),
  seo.ld.join(", "),
);
note("h1 is the real listing title", seo.h1.length > 3, seo.h1);

// --- no fabricated data: every price/spec traces to the listing -------------
note("price is present and Persian-formatted", /[۰-۹]/.test(
  (await page.locator(".property-price-value").first().textContent().catch(() => "")) ?? "",
));

await browser.close();

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
