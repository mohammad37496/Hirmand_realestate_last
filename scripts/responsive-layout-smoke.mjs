#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.RESPONSIVE_SMOKE_BASE_URL ?? "http://127.0.0.1:8081";
const viewportWidths = [320, 360, 375, 390, 414, 430, 768, 1024, 1440];
const propertyId = process.env.BROWSER_SMOKE_PROPERTY_ID || "browser-smoke-property-001";
const propertySlug = process.env.BROWSER_SMOKE_PROPERTY_SLUG || "آپارتمان-تست-ناوبری-۱۴۰۵-browser-smoke";
const routes = [
  "/",
  "/properties",
  "/properties?minArea=-1",
  "/properties?q=عبارت-آزمایشی-بدون-نتیجه-۷۸۹۱۲۳",
  "/areas",
  "/areas/شهرک-ولیعصر",
  "/guides",
  "/valuation",
  "/tools",
  "/tools/commission",
  "/tools/deposit",
  "/tools/loan",
  "/tools/rahn-rent",
  "/budget-match",
  "/smart-search",
  "/consultants",
  "/nearby",
  "/submit-property",
  "/file-code",
  "/favorites",
  "/compare",
  "/my-hirmand",
  "/notifications",
  "/tracking",
  "/request-tracking",
  "/staff-agreement",
  "/staff",
  "/areas/درچه",
  "/consultants/responsive-smoke-consultant",
  "/admin-mobile-management/responsive-smoke-employee",
  "/admin",
  "/admin-mobile-management",
  `/properties/${encodeURIComponent(propertySlug)}`,
  `/file/${encodeURIComponent(propertyId)}`,
  `/v/${encodeURIComponent(propertySlug)}/${encodeURIComponent(propertyId)}`,
];

const screenshotRoutes = new Set([
  "/",
  "/properties",
  "/areas",
  "/areas/شهرک-ولیعصر",
  "/budget-match",
  "/submit-property",
  "/tools/commission",
  "/tools/rahn-rent",
  "/admin",
]);
const screenshotWidths = new Set([320, 390, 430, 768, 1024]);
const outputDir = process.env.RESPONSIVE_SCREENSHOT_DIR || "/workspace/screenshots/responsive";
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const failures = [];
const summaries = [];

function routeFileName(route) {
  return route.replace(/[?].*$/, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "home";
}

try {
  for (const route of routes) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 900 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(12_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
      const response = await page.goto(new URL(route, baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response) {
        failures.push(`${route}: navigation returned no response`);
      } else if (response.status() >= 500) {
        failures.push(`${route}: HTTP ${response.status()} during navigation`);
      }
      // Give the client enough time to hydrate before interacting with React controls.
      await page.waitForTimeout(500);

      // Exercise the mobile filter drawer and neighborhood picker at 320px.
      if (route === "/properties") {
        const filterButton = page.locator(".pf-filter-btn").first();
        if (await filterButton.isVisible().catch(() => false)) {
          await filterButton.waitFor({ state: "visible" });
          let drawerOpened = false;
          for (let attempt = 0; attempt < 2 && !drawerOpened; attempt += 1) {
            await filterButton.click();
            try {
              await page.waitForFunction(
                () => document.querySelector(".pf-filter-btn")?.getAttribute("aria-expanded") === "true",
                null,
                { timeout: 2_000 },
              );
              drawerOpened = true;
            } catch {
              if (attempt === 0) await page.waitForTimeout(500);
            }
          }
          if (!drawerOpened) {
            failures.push("/properties @ 320px: mobile filter button did not open the drawer");
          }
          const drawer = page.locator(".pf-sidebar.is-open[role=dialog]").first();
          await drawer.waitFor({ state: "visible", timeout: 3_000 });
          const neighborhoodTrigger = page.locator(".pf-neighborhood-trigger").first();
          if (await neighborhoodTrigger.isVisible().catch(() => false)) {
            await neighborhoodTrigger.click();
            const neighborhoodDialog = page.locator(".pf-neighborhood-dialog[role=dialog]").first();
            await neighborhoodDialog.waitFor({ state: "visible", timeout: 8_000 });
            const dialogOverflow = await page.evaluate(() => Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth);
            if (dialogOverflow > 1) {
              failures.push("/properties @ 320px while neighborhood modal is open: horizontal overflow " + dialogOverflow + "px");
            }
            const closeNeighborhood = page.getByRole("button", { name: "بستن انتخاب محله" }).first();
            if (await closeNeighborhood.isVisible().catch(() => false)) await closeNeighborhood.click();
          }
          const closeFilters = page.locator(".pf-close").first();
          if (await closeFilters.isVisible().catch(() => false)) await closeFilters.click();
        }
      }

      if (route.startsWith("/properties/")) {
        await page.setViewportSize({ width: 320, height: 900 });
        const thumbs = page.locator(".property-detail-page.hd-property-detail-v2 .hd-gallery-thumbs > .hd-gallery-thumb");
        await thumbs.first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
        const thumbCount = await thumbs.count();
        if (thumbCount < 2) {
          failures.push(`${route}: seeded property detail did not expose multiple gallery thumbnails (found ${thumbCount})`);
        } else {
          const firstCounter = await page.locator(".hd-gallery-controls .property-gallery-counter").innerText().catch(() => "");
          await thumbs.nth(1).scrollIntoViewIfNeeded();
          const scrollBeforeSelection = await page.evaluate(() => window.scrollY);
          await thumbs.nth(1).click();
          if (await thumbs.nth(1).getAttribute("aria-pressed") !== "true") {
            failures.push(`${route}: selecting the second thumbnail did not update its active state`);
          }
          const secondCounter = await page.locator(".hd-gallery-controls .property-gallery-counter").innerText().catch(() => "");
          if (!secondCounter || secondCounter === firstCounter) {
            failures.push(`${route}: selecting a thumbnail did not update the current-image counter`);
          }
          const scrollAfterSelection = await page.evaluate(() => window.scrollY);
          if (Math.abs(scrollAfterSelection - scrollBeforeSelection) > 2) {
            failures.push(`${route}: selecting a thumbnail unexpectedly moved the page scroll position (${scrollBeforeSelection} → ${scrollAfterSelection})`);
          }
          const nextButton = page.locator('.hd-gallery-controls button[aria-label="تصویر بعدی"]').first();
          await nextButton.click();
          const thirdCounter = await page.locator(".hd-gallery-controls .property-gallery-counter").innerText().catch(() => "");
          if (!thirdCounter || thirdCounter === secondCounter) {
            failures.push(`${route}: the next-image control did not advance the image counter`);
          }
          const expandButton = page.locator(".hd-gallery-main .hd-gallery-expand").first();
          if (await expandButton.isVisible().catch(() => false)) {
            await expandButton.click();
            const lightbox = page.locator(".hd-lightbox[role='dialog']").first();
            const opened = await lightbox.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false);
            if (!opened) {
              failures.push(`${route}: the gallery expand control did not open the lightbox`);
            } else {
              const lightboxTargets = await lightbox.locator("button").evaluateAll((buttons) => buttons.map((button) => {
                const rect = button.getBoundingClientRect();
                return {
                  label: button.getAttribute("aria-label") || "",
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              }));
              if (lightboxTargets.some((target) => target.width < 44 || target.height < 44)) {
                failures.push(`${route}: lightbox contains a touch target below 44px: ${JSON.stringify(lightboxTargets)}`);
              }
              const lockedOverflow = await page.locator("body").evaluate((el) => getComputedStyle(el).overflow);
              if (lockedOverflow !== "hidden") failures.push(`${route}: background scrolling was not locked while the lightbox was open`);
              await page.keyboard.press("Escape");
              const closed = await lightbox.waitFor({ state: "hidden", timeout: 3_000 }).then(() => true).catch(() => false);
              if (!closed) {
                failures.push(`${route}: Escape did not close the lightbox`);
              } else {
                const restored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
                if (restored !== "نمایش تصویر در اندازهٔ بزرگ") {
                  failures.push(`${route}: closing the lightbox did not restore focus to the expand control`);
                }
                const unlockedOverflow = await page.locator("body").evaluate((el) => el.style.overflow);
                if (unlockedOverflow === "hidden") failures.push(`${route}: body overflow remained locked after closing the lightbox`);
              }
            }
          } else {
            failures.push(`${route}: gallery fullscreen control is missing or not visible`);
          }
        }
      }

      for (const width of viewportWidths) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ));
        const metrics = await page.evaluate(() => {
          const viewport = window.innerWidth;
          const rootWidth = Math.max(
            document.documentElement?.scrollWidth ?? 0,
            document.body?.scrollWidth ?? 0,
          );
          const overflow = Math.max(0, rootWidth - viewport);
          const offenders = [];

          if (overflow > 1) {
            const elements = [...document.querySelectorAll("body *")];
            for (const element of elements) {
              const style = getComputedStyle(element);
              if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
              if (style.position === "fixed") continue;
              if (element.closest(".leaflet-container, .maplibregl-map, .pf-map-panel, .pf-map, .table-responsive, .overflow-x-auto")) continue;
              let rect;
              try { rect = element.getBoundingClientRect(); } catch { continue; }
              if (rect.width < 1 || rect.height < 1) continue;
              if (rect.width <= viewport + 2 && rect.left >= -2 && rect.right <= viewport + 2) continue;
              const name = element.tagName.toLowerCase();
              const classes = typeof element.className === "string"
                ? element.className.trim().split(/\s+/).slice(0, 3).join(".")
                : "";
              offenders.push({
                element: name + (classes ? "." + classes : ""),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                text: (element.innerText || "").trim().replace(/\s+/g, " ").slice(0, 70),
              });
            }
          }

          const brokenWords = [];
          const textSelectors = "p,h1,h2,h3,h4,h5,h6,label,small,strong,span,a,button,li,dt,dd";
          for (const element of document.querySelectorAll(textSelectors)) {
            if (element.children.length > 0) continue;
            const text = (element.innerText || element.textContent || "").trim();
            if (text.length < 8 || !/[\u0600-\u06FF]/.test(text)) continue;
            if (/https?:\/\/|www\.|[A-Za-z0-9_]{12,}/i.test(text)) continue;
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
            if (element.closest(".leaflet-container, .maplibregl-map, .table-responsive, .overflow-x-auto, code, pre")) continue;
            if (element.closest('[aria-hidden="true"], [hidden], .sr-only, .visually-hidden, .screen-reader-only')) continue;
            const rect = element.getBoundingClientRect();
            if (rect.width > 62 || rect.height < 1) continue;
            const range = document.createRange();
            range.selectNodeContents(element);
            const lineTops = [...range.getClientRects()]
              .map((item) => Math.round(item.top))
              .filter((top, index, list) => list.indexOf(top) === index);
            if (lineTops.length >= 4 || style.wordBreak === "break-all") {
              brokenWords.push({
                element: element.tagName.toLowerCase() + (typeof element.className === "string" && element.className.trim() ? "." + element.className.trim().split(/\s+/).slice(0, 3).join(".") : ""),
                text: text.replace(/\s+/g, " ").slice(0, 70),
                width: Math.round(rect.width),
                lines: lineTops.length,
                wordBreak: style.wordBreak,
                wrap: style.overflowWrap,
              });
            }
          }

          const smallTargets = [];
          if (viewport <= 414) {
            for (const element of document.querySelectorAll("button,[role='button'],a.btn-gold,a.btn-outline,a.btn-ghost,.property-action,.pf-filter-btn,.pf-close,.menu-toggle")) {
              const style = getComputedStyle(element);
              if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
              if (element.closest(".leaflet-container, .maplibregl-map")) continue;
              const rect = element.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) continue;
              if (rect.width < 32 || rect.height < 32) {
                smallTargets.push({
                  element: element.tagName.toLowerCase() + (element.className && typeof element.className === "string" ? "." + element.className.trim().split(/\s+/).slice(0, 2).join(".") : ""),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  text: (element.innerText || element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50),
                });
              }
            }
          }

          let propertyGallery = null;
          const galleryMain = document.querySelector(".property-detail-page.hd-property-detail-v2 .hd-gallery-main, .property-detail-page:not(.hd-property-detail-v2) .property-gallery-main");
          const galleryStage = galleryMain?.querySelector(".hd-gallery-stage") ?? galleryMain;
          if (galleryMain && galleryStage && viewport <= 720) {
            const mainRect = galleryMain.getBoundingClientRect();
            const stageRect = galleryStage.getBoundingClientRect();
            const media = galleryStage.querySelector("picture img, video, .property-video-player video, .property-image-fallback");
            const mediaRect = media?.getBoundingClientRect();
            const mediaStyle = media ? getComputedStyle(media) : null;
            const rail = document.querySelector(".property-detail-page.hd-property-detail-v2 .hd-gallery-thumbs, .property-detail-page:not(.hd-property-detail-v2) .property-gallery-rail");
            const firstThumb = rail?.querySelector(".hd-gallery-thumb, .property-gallery-thumb");
            const thumbRect = firstThumb?.getBoundingClientRect();
            const railStyle = rail ? getComputedStyle(rail) : null;
            const railThumbs = rail ? [...rail.querySelectorAll(".hd-gallery-thumb, .property-gallery-thumb")] : [];
            const railThumbRects = railThumbs.slice(0, 4).map((thumb) => {
              const rect = thumb.getBoundingClientRect();
              return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
            });
            const openButton = galleryStage.querySelector(".hd-gallery-expand, .property-gallery-open");
            const openRect = openButton?.getBoundingClientRect();
            const navButtons = [...galleryMain.querySelectorAll(".hd-gallery-controls > button, .property-gallery-nav")].map((button) => {
              const rect = button.getBoundingClientRect();
              return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
              };
            });
            const videoControls = [...galleryMain.querySelectorAll(".property-video-controls button")].map((button) => {
              const rect = button.getBoundingClientRect();
              return { width: Math.round(rect.width), height: Math.round(rect.height) };
            });
            propertyGallery = {
              main: {
                width: Math.round(mainRect.width),
                height: Math.round(mainRect.height),
                left: Math.round(mainRect.left),
                right: Math.round(mainRect.right),
                top: Math.round(mainRect.top),
                bottom: Math.round(mainRect.bottom),
              },
              stage: {
                width: Math.round(stageRect.width),
                height: Math.round(stageRect.height),
                left: Math.round(stageRect.left),
                right: Math.round(stageRect.right),
                ratio: stageRect.height > 0 ? Number((stageRect.width / stageRect.height).toFixed(3)) : 0,
              },
              media: media && mediaRect ? {
                width: Math.round(mediaRect.width),
                height: Math.round(mediaRect.height),
                objectFit: mediaStyle?.objectFit ?? "",
                visible: mediaRect.width > 0 && mediaRect.height > 0 && mediaStyle?.visibility !== "hidden",
              } : null,
              thumb: thumbRect ? { width: Math.round(thumbRect.width), height: Math.round(thumbRect.height) } : null,
              rail: rail && railStyle ? {
                display: railStyle.display, flexDirection: railStyle.flexDirection, gridAutoFlow: railStyle.gridAutoFlow,
                overflowX: railStyle.overflowX, overflowY: railStyle.overflowY,
                scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, thumbRects: railThumbRects,
              } : null,
              openButton: openRect ? {
                width: Math.round(openRect.width),
                height: Math.round(openRect.height),
                left: Math.round(openRect.left),
                right: Math.round(openRect.right),
                top: Math.round(openRect.top),
                bottom: Math.round(openRect.bottom),
              } : null,
              navButtons,
              videoControls,
            };
          }

          return {
            viewport,
            rootWidth,
            overflow,
            offenders: offenders.slice(0, 8),
            brokenWords: brokenWords.slice(0, 8),
            smallTargets: smallTargets.slice(0, 8),
            propertyGallery,
            title: document.title,
          };
        });

        if (route.startsWith("/properties/") && width <= 760 && metrics.propertyGallery?.rail) {
          const rail = metrics.propertyGallery.rail;
          const thumbs = rail.thumbRects;
          if (thumbs.length > 1) {
            if (rail.display === "flex" && rail.flexDirection !== "column") {
              failures.push(`${route} @ ${width}px: mobile thumbnail list is flex-direction=${rail.flexDirection}, not vertical`);
            }
            if (rail.display === "grid" && rail.gridAutoFlow === "column") {
              failures.push(`${route} @ ${width}px: mobile thumbnail grid fills columns horizontally`);
            }
            if (rail.scrollWidth > rail.clientWidth + 1 || ["auto", "scroll"].includes(rail.overflowX)) {
              failures.push(`${route} @ ${width}px: thumbnail list requires horizontal scrolling (scrollWidth=${rail.scrollWidth}, clientWidth=${rail.clientWidth}, overflowX=${rail.overflowX})`);
            }
            const first = thumbs[0], second = thumbs[1];
            if (second.top <= first.top || Math.abs(second.left - first.left) > 4 || Math.abs(second.width - first.width) > 4) {
              failures.push(`${route} @ ${width}px: thumbnail cards are not stacked in one vertical column: ${JSON.stringify(thumbs.slice(0, 3))}`);
            }
          }
        }

        summaries.push({ route, ...metrics });
        if (metrics.overflow > 1) {
          failures.push(`${route} @ ${width}px: horizontal overflow ${metrics.overflow}px; elements=${JSON.stringify(metrics.offenders)}`);
        }
        if (metrics.brokenWords.length) {
          failures.push(`${route} @ ${width}px: text appears split letter-by-letter; elements=${JSON.stringify(metrics.brokenWords)}`);
        }

        if (metrics.propertyGallery && width <= 430) {
          const gallery = metrics.propertyGallery;
          if (gallery.stage.ratio < 1.0 || gallery.stage.ratio > 1.95) {
            failures.push(`${route} @ ${width}px: property media stage ratio ${gallery.stage.ratio} is outside a reasonable mobile frame range (1.0–1.95)`);
          }
          if (gallery.stage.left < -2 || gallery.stage.right > width + 2) {
            failures.push(`${route} @ ${width}px: property media stage escapes the viewport: ${JSON.stringify(gallery.stage)}`);
          }
          if (!gallery.media?.visible || gallery.media.width < gallery.stage.width * 0.8 || gallery.media.height < gallery.stage.height * 0.8) {
            failures.push(`${route} @ ${width}px: active property media is missing or not filling its stage: ${JSON.stringify(gallery.media)}`);
          }
          if (gallery.media?.objectFit && gallery.media.objectFit !== "contain") {
            failures.push(`${route} @ ${width}px: uploaded property media is cropped with object-fit=${gallery.media.objectFit}`);
          }
          if (gallery.thumb && (gallery.thumb.width < 60 || gallery.thumb.height < 48)) {
            failures.push(`${route} @ ${width}px: property gallery thumbnail is too small: ${JSON.stringify(gallery.thumb)}`);
          }
          if (gallery.openButton && (
            gallery.openButton.width < 44 ||
            gallery.openButton.height < 44 ||
            gallery.openButton.width > Math.min(gallery.stage.width * 0.62, 180) ||
            gallery.openButton.left < gallery.stage.left - 1 ||
            gallery.openButton.right > gallery.stage.right + 1 ||
            gallery.openButton.top < gallery.stage.top - 1 ||
            gallery.openButton.bottom > gallery.stage.bottom + 1
          )) {
            failures.push(`${route} @ ${width}px: gallery full-screen control is too small, stretched, or outside the image: ${JSON.stringify(gallery.openButton)}`);
          }
          const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          if (gallery.openButton && gallery.navButtons.some((button) => intersects(gallery.openButton, button))) {
            failures.push(`${route} @ ${width}px: fullscreen and previous/next gallery controls overlap`);
          }
          if (gallery.navButtons.some((button) =>
            button.width < 44 || button.height < 44 ||
            button.left < (gallery.main?.left ?? gallery.stage.left) - 1 ||
            button.right > (gallery.main?.right ?? gallery.stage.right) + 1 ||
            button.top < (gallery.main?.top ?? gallery.stage.top) - 1 ||
            button.bottom > (gallery.main?.bottom ?? gallery.stage.bottom) + 1
          )) {
            failures.push(`${route} @ ${width}px: gallery navigation buttons are too small or overlap the viewport edge: ${JSON.stringify(gallery.navButtons)}`);
          }
          if (gallery.videoControls.some((button) => button.width < 44 || button.height < 44)) {
            failures.push(`${route} @ ${width}px: video controls are below 40px touch targets: ${JSON.stringify(gallery.videoControls)}`);
          }
        }

        if ((screenshotRoutes.has(route) || route.startsWith("/properties/") || route.startsWith("/file/")) && screenshotWidths.has(width)) {
          const fileName = `${routeFileName(route)}-${width}.png`;
          await page.screenshot({
            path: path.join(outputDir, fileName),
            fullPage: true,
            animations: "disabled",
            timeout: 20_000,
          }).catch((error) => {
            summaries.push({ route, width, screenshotWarning: error.message });
          });
        }
      }

      if (pageErrors.length) {
        summaries.push({ route, pageErrors: pageErrors.slice(0, 3) });
      }
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const smallTargetWarnings = summaries.filter((entry) => entry.smallTargets?.length);
console.log(`[responsive-smoke] ${routes.length} routes × ${viewportWidths.length} widths = ${routes.length * viewportWidths.length} responsive checks`);
console.log(`[responsive-smoke] target widths: ${viewportWidths.join(", ")}`);
console.log(`[responsive-smoke] screenshots directory: ${outputDir}`);
if (smallTargetWarnings.length) {
  console.warn(`[responsive-smoke] small interactive targets found in ${smallTargetWarnings.length} route/width checks (examples follow):`);
  for (const warning of smallTargetWarnings.slice(0, 20)) {
    console.warn(`  ${warning.route} @ ${warning.viewport}px: ${JSON.stringify(warning.smallTargets)}`);
  }
}

if (failures.length) {
  console.error(`[responsive-smoke] FAILED with ${failures.length} issue(s)`);
  failures.slice(0, 100).forEach((failure) => console.error(failure));
  process.exitCode = 1;
} else {
  console.log("[responsive-smoke] PASS");
}
