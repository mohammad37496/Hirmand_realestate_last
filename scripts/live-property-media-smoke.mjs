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
const requiredProperties = Number(process.env.LIVE_MEDIA_REQUIRED_PROPERTIES || 1);
const targetPropertyId = process.env.LIVE_MEDIA_PROPERTY_ID?.trim() || "";
const expectedGalleryImages = Number(
  process.env.LIVE_MEDIA_EXPECTED_GALLERY_IMAGES || (targetPropertyId ? 15 : 0),
);
if (targetPropertyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetPropertyId)) {
  throw new Error("LIVE_MEDIA_PROPERTY_ID must be a UUID.");
}
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
  const mediaProxyResponses = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/media-proxy") {
      mediaProxyResponses.push({ status: response.status(), url: response.url() });
    }
  });

  const openPropertyGrid = async () => {
    const response = await page.goto(sameOriginPath("/properties"), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    assert.ok(response && response.status() < 400, "public property listing did not load");
    const gridButton = page.getByRole("button", { name: "نمایش شبکه‌ای فایل‌ها" });
    await gridButton.waitFor({ state: "visible", timeout: 30_000 });
    if ((await gridButton.getAttribute("aria-pressed")) !== "true") {
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="نمایش شبکه‌ای فایل‌ها"]');
        const reactPropsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
        return Boolean(reactPropsKey && typeof button[reactPropsKey]?.onClick === "function");
      }, null, { timeout: 30_000 });
      await gridButton.click();
      await page.waitForFunction(() =>
        document.querySelector('button[aria-label="نمایش شبکه‌ای فایل‌ها"]')?.getAttribute("aria-pressed") === "true",
      null, { timeout: 15_000 });
    }
    await page.waitForSelector('[data-property-link="true"]:has(img)', { timeout: 30_000 });
    return page.locator('[data-property-link="true"]:has(img)');
  };

  const listingLinks = await openPropertyGrid();
  const initialCount = await listingLinks.count();
  const maxCandidates = targetPropertyId ? 1 : Math.min(initialCount, 30);

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
    const currentListingLinks = await openPropertyGrid();
    const card = targetPropertyId
      ? page.locator(`[data-property-link="true"][data-property-id="${targetPropertyId}"]:has(img)`).first()
      : currentListingLinks.nth(index);
    if (targetPropertyId && (await card.count()) === 0) {
      throw new Error("The requested live property ID is not present in the public listing.");
    }
    await card.scrollIntoViewIfNeeded();
    const cardImage = card.locator("img").first();
    if ((await cardImage.count()) === 0) continue;

    const cardSource = await cardImage.evaluate((image) => image.currentSrc || image.src || image.getAttribute("src") || "");
    if (isFallbackSource(cardSource)) {
      if (targetPropertyId) throw new Error("The requested property's listing card is using a fallback image.");
      continue;
    }

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
    const propertyId = await card.getAttribute("data-property-id");
    const detailUrl = new URL(href, sameOriginPath("/properties"));
    if (
      !["hirmandrealestate.ir", "www.hirmandrealestate.ir"].includes(detailUrl.hostname.toLowerCase()) ||
      detailUrl.protocol !== "https:" ||
      !detailUrl.pathname.startsWith("/properties/")
    ) continue;

    const detailMediaResponseStart = mediaProxyResponses.length;
    const detailResponse = await page.goto(detailUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    assert.ok(detailResponse && detailResponse.status() < 400, "public property detail route failed");
    await page.waitForSelector(".property-gallery-thumb", { state: "visible", timeout: timeoutMs });

    const mainImage = page.locator(".property-gallery-main img").first();
    if ((await mainImage.count()) === 0) continue;
    await mainImage.waitFor({ state: "visible" });
    const galleryThumbs = page.locator(".property-gallery-thumb");
    const galleryThumbCount = await galleryThumbs.count();
    await page.waitForFunction(() => {
      const thumb = document.querySelector(".property-gallery-thumb");
      const reactPropsKey = thumb && Object.keys(thumb).find((key) => key.startsWith("__reactProps$"));
      return Boolean(reactPropsKey && typeof thumb[reactPropsKey]?.onClick === "function");
    }, null, { timeout: timeoutMs });
    if (expectedGalleryImages > 0) {
      assert.equal(
        galleryThumbCount,
        expectedGalleryImages,
        `property ${propertyId || targetPropertyId} should expose ${expectedGalleryImages} gallery images`,
      );
    }

    const galleryImages = [];
    if (targetPropertyId || expectedGalleryImages > 0) {
      for (let galleryIndex = 0; galleryIndex < galleryThumbCount; galleryIndex += 1) {
        const thumb = galleryThumbs.nth(galleryIndex);
        await thumb.scrollIntoViewIfNeeded();
        const thumbImage = thumb.locator("img").first();
        if ((await thumbImage.count()) > 0) {
          const thumbImageHandle = await thumbImage.elementHandle();
          await page.waitForFunction(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            thumbImageHandle,
            { timeout: timeoutMs },
          );
        }

        await thumb.click();
        await page.waitForFunction((index) => {
          const active = document.querySelectorAll(".property-gallery-thumb")[index];
          const image = document.querySelector(".property-gallery-main img");
          return active?.getAttribute("aria-current") === "true" &&
            image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
        }, galleryIndex, { timeout: timeoutMs });

        const imageResult = await mainImage.evaluate((image) => ({
          source: image.currentSrc || image.src || "",
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        }));
        if (isFallbackSource(imageResult.source)) {
          throw new Error(`Gallery image ${galleryIndex + 1} used a fallback image instead of the property's media.`);
        }
        galleryImages.push(imageResult);
      }
    } else {
      const detailImageLoaded = await mainImage.evaluate(async (image) => {
        if (!(image instanceof HTMLImageElement)) return false;
        try {
          await image.decode();
        } catch {
          // The explicit naturalWidth check below reports decode/network failures.
        }
        return image.complete && image.naturalWidth > 0;
      });
      if (!detailImageLoaded) throw new Error("A real property image in the detail gallery failed to load.");
      galleryImages.push(await mainImage.evaluate((image) => ({
        source: image.currentSrc || image.src || "",
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })));
    }

    const detailProxyFailures = mediaProxyResponses
      .slice(detailMediaResponseStart)
      .filter((response) => response.status >= 500);
    assert.equal(
      detailProxyFailures.length,
      0,
      `property ${propertyId || targetPropertyId} media proxy returned a server error`,
    );

    if (galleryThumbCount > 0) {
      await galleryThumbs.first().click();
      await page.waitForFunction(() => {
        const active = document.querySelector(".property-gallery-thumb");
        const image = document.querySelector(".property-gallery-main img");
        return active?.getAttribute("aria-current") === "true" &&
          image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      }, null, { timeout: timeoutMs });
    }

    const detailSource = await mainImage.evaluate((image) => image.currentSrc || image.src || "");
    if (isFallbackSource(detailSource)) {
      throw new Error("A real property image in the detail gallery resolved to a fallback image.");
    }
    const permanentlyWatermarked = /-watermarked\.(?:webp|mp4)(?:[?#]|$)/i.test(detailSource);
    assert.equal(await page.locator(".property-media-watermark").count(), 0, "watermark appeared outside the enlarged image view");

    const openButton = page.locator(".property-gallery-open").first();
    assert.ok((await openButton.count()) > 0, "property gallery has no enlarged-view control");
    await page.waitForFunction(() => {
      const button = document.querySelector(".property-gallery-open");
      const reactPropsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      return Boolean(reactPropsKey && typeof button[reactPropsKey]?.onClick === "function");
    }, null, { timeout: timeoutMs });
    await openButton.click();
    await page.waitForSelector(".property-lightbox", { timeout: timeoutMs });

    const watermark = page.locator(".property-lightbox-media-wrap .property-media-watermark");
    if (permanentlyWatermarked) {
      assert.equal(await watermark.count(), 0, "a permanently watermarked image received a second overlay");
    } else if (watermarkShouldShow) {
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

    tested.push({ index, propertyId, permanentlyWatermarked, galleryImages: galleryImages.length });
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
    " real property detail galleries, " +
    tested.reduce((total, item) => total + item.galleryImages, 0) +
    " gallery images, watermark rendering without double overlays, and clean thumbnails verified; " +
    tested.filter((item) => item.permanentlyWatermarked).length + " legacy permanently watermarked image(s).",
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
