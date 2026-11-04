#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = new URL(process.env.HIRMAND_LIVE_BASE_URL || "https://hirmandrealestate.ir/");
if (
  base.protocol !== "https:" ||
  !["hirmandrealestate.ir", "www.hirmandrealestate.ir"].includes(base.hostname.toLowerCase())
) {
  throw new Error("Live media smoke is restricted to the official HTTPS Hirmand site.");
}
base.pathname = "/";
base.search = "";
base.hash = "";

const timeoutMs = Number(process.env.LIVE_MEDIA_TIMEOUT_MS || 20_000);
const requiredProperties = Number(process.env.LIVE_MEDIA_REQUIRED_PROPERTIES || 3);
const fallbackPaths = new Set([
  "/images/type-apartment.jpg",
  "/images/type-villa.jpg",
  "/images/type-office.jpg",
  "/images/type-heritage.jpg",
  "/images/fallback/land-01.jpg",
  "/images/fallback/commercial-01.jpg",
  "/images/isfahan-arch.jpg",
  "/images/isfahan-hero.jpg",
]);

function isFallbackSource(value) {
  if (!value) return true;
  try {
    const url = new URL(value, base);
    if (url.pathname === "/api/media-proxy") {
      const target = url.searchParams.get("url");
      return target ? isFallbackSource(target) : false;
    }
    if (fallbackPaths.has(url.pathname) || url.pathname.startsWith("/images/fallback/")) return true;
    if (url.hostname.toLowerCase() === "images.pexels.com" && url.pathname.startsWith("/photos/")) return true;
    return false;
  } catch {
    return false;
  }
}

function sameOriginPath(path) {
  return new URL(path, base).toString();
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const tested = [];
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(timeoutMs);

  const listingResponse = await page.goto(sameOriginPath("/properties"), {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert.ok(listingResponse && listingResponse.status() < 400, "public property listing did not load");
  await page.waitForSelector('[data-property-link="true"]', { timeout: 30_000 });

  const listingLinks = page.locator('[data-property-link="true"]');
  const initialCount = await listingLinks.count();
  const maxCandidates = Math.min(initialCount, 30);

  const watermarkResponse = await page.request.get(sameOriginPath("/api/public-watermark"), {
    timeout: timeoutMs,
  });
  assert.ok(watermarkResponse.ok(), "public watermark settings endpoint failed");
  const watermarkSettings = await watermarkResponse.json();
  assert.equal(typeof watermarkSettings.enabled, "boolean", "watermark enabled flag is missing");
  const watermarkShouldShow =
    watermarkSettings.enabled === true &&
    (watermarkSettings.showLogo !== false ||
      (watermarkSettings.showText !== false && String(watermarkSettings.text || "").trim().length > 0));

  for (let index = 0; index < maxCandidates && tested.length < requiredProperties; index += 1) {
    await page.goto(sameOriginPath("/properties"), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const card = page.locator('[data-property-link="true"]').nth(index);
    await card.scrollIntoViewIfNeeded();
    const cardImage = card.locator("img").first();
    if ((await cardImage.count()) === 0) continue;

    const cardSource = await cardImage.evaluate((image) => image.currentSrc || image.src || image.getAttribute("src") || "");
    if (isFallbackSource(cardSource)) continue;

    const cardImageLoaded = await cardImage.evaluate(async (image) => {
      if (!(image instanceof HTMLImageElement)) return false;
      try {
        await image.decode();
      } catch {
        // The explicit naturalWidth check below reports decode/network failures.
      }
      return image.complete && image.naturalWidth > 0;
    });
    if (!cardImageLoaded) {
      throw new Error("A real property image in the listing failed to load.");
    }

    const href = await card.getAttribute("href");
    if (!href) continue;
    const detailUrl = new URL(href, sameOriginPath("/properties"));
    if (detailUrl.origin !== base.origin || !detailUrl.pathname.startsWith("/properties/")) continue;

    const detailResponse = await page.goto(detailUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    assert.ok(detailResponse && detailResponse.status() < 400, "public property detail route failed");
    await page.waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: timeoutMs });

    const mainImage = page.locator(".property-gallery-main img").first();
    if ((await mainImage.count()) === 0) continue;
    const detailSource = await mainImage.evaluate((image) => image.currentSrc || image.src || "");
    if (isFallbackSource(detailSource)) continue;

    await mainImage.waitFor({ state: "visible" });
    const detailImageLoaded = await mainImage.evaluate(async (image) => {
      if (!(image instanceof HTMLImageElement)) return false;
      try {
        await image.decode();
      } catch {
        // The explicit naturalWidth check below reports decode/network failures.
      }
      return image.complete && image.naturalWidth > 0;
    });
    if (!detailImageLoaded) {
      throw new Error("A real property image in the detail gallery failed to load.");
    }
    assert.ok(!/-watermarked\.(?:webp|mp4)(?:[?#]|$)/i.test(detailSource), "stored property image appears permanently watermarked");
    assert.equal(await page.locator(".property-media-watermark").count(), 0, "watermark appeared outside the enlarged image view");

    const openButton = page.locator(".property-gallery-open").first();
    assert.ok((await openButton.count()) > 0, "property gallery has no enlarged-view control");
    await openButton.click();
    await page.waitForSelector(".property-lightbox", { timeout: timeoutMs });

    const watermark = page.locator(".property-lightbox-media-wrap .property-media-watermark");
    if (watermarkShouldShow) {
      await watermark.waitFor({ state: "visible", timeout: timeoutMs });
      assert.equal(await watermark.count(), 1, "lightbox watermark is missing or duplicated");
      const positionOk = await page.evaluate(() => {
        const mark = document.querySelector(".property-lightbox-media-wrap .property-media-watermark");
        const frame = document.querySelector(".property-lightbox-media-wrap");
        if (!mark || !frame) return false;
        const m = mark.getBoundingClientRect();
        const f = frame.getBoundingClientRect();
        const rightGap = f.right - m.right;
        const bottomGap = f.bottom - m.bottom;
        return rightGap >= -1 && rightGap < 45 && bottomGap >= -1 && bottomGap < 45;
      });
      assert.ok(positionOk, "lightbox watermark is not in the image's lower-right corner");
    } else {
      await page.waitForTimeout(700);
      assert.equal(await watermark.count(), 0, "watermark is visible while the admin setting is disabled");
    }

    assert.equal(
      await page.locator(".property-lightbox-thumb .property-media-watermark").count(),
      0,
      "watermark appeared on a lightbox thumbnail",
    );
    await page.locator(".property-lightbox-close").click();
    await page.waitForSelector(".property-lightbox", { state: "detached", timeout: timeoutMs });
    assert.equal(await page.locator(".property-media-watermark").count(), 0, "watermark remained after closing the lightbox");

    tested.push(index);
  }

  if (tested.length < requiredProperties) {
    throw new Error(
      "Insufficient live listings with real, loadable property photos: tested " +
      tested.length + " of required " + requiredProperties + ".",
    );
  }

  console.log(
    "[live-property-media-smoke] PASS: listing images, " +
    tested.length +
    " real property detail galleries, enlarged-view watermark condition/placement, and clean thumbnails verified.",
  );
} catch (error) {
  console.error(
    "[live-property-media-smoke] FAIL: " +
    (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
