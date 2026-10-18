#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.RESPONSIVE_SMOKE_BASE_URL ?? "http://127.0.0.1:8081";
const viewportWidths = [320, 360, 375, 390, 414, 768, 1024, 1440, 1920];
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
const screenshotWidths = new Set([320, 390, 768, 1024, 1440, 1920]);
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

          return {
            viewport,
            rootWidth,
            overflow,
            offenders: offenders.slice(0, 8),
            brokenWords: brokenWords.slice(0, 8),
            smallTargets: smallTargets.slice(0, 8),
            title: document.title,
          };
        });

        summaries.push({ route, ...metrics });
        if (metrics.overflow > 1) {
          failures.push(`${route} @ ${width}px: horizontal overflow ${metrics.overflow}px; elements=${JSON.stringify(metrics.offenders)}`);
        }
        if (metrics.brokenWords.length) {
          failures.push(`${route} @ ${width}px: text appears split letter-by-letter; elements=${JSON.stringify(metrics.brokenWords)}`);
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
