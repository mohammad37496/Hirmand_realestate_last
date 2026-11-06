#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.RESPONSIVE_SMOKE_BASE_URL ?? "http://127.0.0.1:8081";
const viewportWidths = [320, 360, 375, 390, 430, 768, 1024, 1440];
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
const screenshotWidths = new Set([320, 360, 375, 390, 430, 768, 1024]);
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
    const consoleErrors = [];
    const networkWarnings = [];
    const criticalNetworkFailures = [];
    let targetOrigin = new URL(baseUrl).origin;
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      try {
        targetOrigin = new URL(frame.url()).origin;
      } catch {
        // Keep the configured origin until the main frame has a valid URL.
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      try {
        if (new URL(request.url()).origin !== targetOrigin) return;
      } catch {
        return;
      }
      const failure = request.failure();
      const failureText = failure?.errorText ?? "request failed";
      const detail = request.method() + " " + request.url() + " — " + failureText;
      networkWarnings.push(detail);
      if (["script", "stylesheet", "font"].includes(request.resourceType())) {
        criticalNetworkFailures.push(detail);
      }
    });
    page.on("response", (response) => {
      const request = response.request();
      try {
        if (new URL(response.url()).origin !== targetOrigin) return;
      } catch {
        return;
      }
      const isBrokenImage = response.status() === 404 && request.resourceType() === "image";
      if (response.status() >= 500 ||
          isBrokenImage ||
          (response.status() >= 400 && ["script", "stylesheet", "font"].includes(request.resourceType()))) {
        criticalNetworkFailures.push(response.status() + " " + request.resourceType() + " " + response.url());
      } else if (response.status() >= 400) {
        networkWarnings.push(response.status() + " " + request.resourceType() + " " + response.url());
      }
    });

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

      // Every route that renders shared property cards must preserve the RTL
      // mobile invariant: image on the right, property details on the left.
      const sharedMobileCard = page.locator(route === "/properties" ? ".pf-grid .pcard-mobile-list" : ".pcard-mobile-list").first();
      if (route === "/" || route === "/properties") {
        await sharedMobileCard.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        if (!(await sharedMobileCard.isVisible().catch(() => false))) {
          failures.push(route + " @ 320px: published property cards did not render before layout verification");
        }
      }
      if (await sharedMobileCard.isVisible().catch(() => false)) {
        const cardLayout = await sharedMobileCard.evaluate((card) => {
          const media = card.querySelector(".pcard-media")?.getBoundingClientRect();
          const body = card.querySelector(".pcard-body")?.getBoundingClientRect();
          return {
            imageOnRight: Boolean(media && body &&
              media.left + media.width / 2 > body.left + body.width / 2),
            hasImage: Boolean(media && media.width > 0 && media.height > 0),
            hasDetails: Boolean(body && body.width > 0 && body.height > 0),
          };
        });
        if (!cardLayout.hasImage || !cardLayout.hasDetails || !cardLayout.imageOnRight) {
          failures.push(route + " @ 320px: shared property card must show its image on the right and details on the left");
        }
        const sharedCardImage = sharedMobileCard.locator(".pcard-media img").first();
        await sharedCardImage.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForFunction(() => {
          const image = document.querySelector(".pcard-mobile-list .pcard-media img");
          return image instanceof HTMLImageElement && image.complete;
        }, null, { timeout: 10_000 }).catch(() => {});
        const sharedImageLoaded = await sharedCardImage.evaluate((image) => image.complete && image.naturalWidth > 0).catch(() => false);
        if (!sharedImageLoaded) failures.push(route + " @ 320px: first shared property-card image did not load or fall back successfully");
      }

      if (route === "/submit-property") {
        const uploadZone = page.locator(".customer-property-upload-zone").first();
        if (await uploadZone.isVisible().catch(() => false)) {
          await page.waitForFunction(() => {
            const zone = document.querySelector(".customer-property-upload-zone");
            if (!zone) return false;
            const reactPropsKey = Object.keys(zone).find((key) => key.startsWith("__reactProps$"));
            const props = reactPropsKey ? zone[reactPropsKey] : null;
            const input = zone.closest("form")?.querySelector('input[type="file"]');
            return zone instanceof HTMLButtonElement && zone.type === "button" && !zone.disabled && typeof props?.onClick === "function" && input instanceof HTMLInputElement && input.multiple;
          }, undefined, { timeout: 10_000 });
          for (const key of ["Enter", "Space"]) {
            const chooserPromise = page.waitForEvent("filechooser", { timeout: 4_000 });
            await uploadZone.press(key);
            const chooser = await chooserPromise;
            if (!chooser.isMultiple()) failures.push(`${route}: ${key} opened a single-file picker instead of the multiple-media picker`);
            // Close the native picker before checking the next keyboard key.
            // Chromium ignores a second programmatic click while the first picker is open.
            await chooser.setFiles([]);
          }
        } else {
          failures.push(`${route}: media upload zone was not visible for keyboard interaction`);
        }
      }

      // Exercise the mobile filter drawer and neighborhood picker at 320px.
      if (route === "/properties") { // mobile property view buttons preserve filters and URL parameters
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

          // Exercise actual filter state, not just the drawer's open/close behavior.
          await filterButton.click();
          const activeDrawer = page.locator(".pf-sidebar.is-open[role=dialog]").first();
          await activeDrawer.waitFor({ state: "visible", timeout: 3_000 });

          const transactionGroup = activeDrawer.locator(".pf-filter-primary .pf-group").filter({ hasText: "نوع معامله" }).first();
          const sellChip = transactionGroup.getByRole("button", { name: "فروش", exact: true });
          if (await sellChip.isVisible().catch(() => false)) {
            await sellChip.click();
            await page.waitForFunction(() => new URLSearchParams(location.search).get("transaction") === "sell");
          } else {
            failures.push("/properties @ 320px: sale transaction filter is unavailable");
          }

          const areaGroup = activeDrawer.locator(".pf-compact-ranges .pf-group").nth(0);
          await areaGroup.locator("input").nth(0).fill("80");
          await areaGroup.locator("input").nth(1).fill("160");
          const priceGroup = activeDrawer.locator(".pf-compact-ranges .pf-group").nth(1);
          await priceGroup.locator("input").nth(0).fill("1000000000");
          await priceGroup.locator("input").nth(1).fill("5000000000");
          await page.waitForFunction(() => {
            const params = new URLSearchParams(location.search);
            return params.get("minArea") === "80" &&
              params.get("maxArea") === "160" &&
              params.get("minPrice") === "1000000000" &&
              params.get("maxPrice") === "5000000000";
          });

          const openNeighborhoodPicker = activeDrawer.locator(".pf-neighborhood-trigger").first();
          await openNeighborhoodPicker.click();
          const neighborhoodDialog = page.locator(".pf-neighborhood-dialog[role=dialog]").first();
          await neighborhoodDialog.waitFor({ state: "visible", timeout: 8_000 });
          const neighborhoodSearch = neighborhoodDialog.getByLabel("جست‌وجوی محله‌ها");
          await neighborhoodSearch.fill("آبشار");
          const neighborhoodOption = neighborhoodDialog.locator(".pf-neighborhood-dialog-results button").first();
          await neighborhoodOption.waitFor({ state: "visible", timeout: 5_000 });
          const selectedNeighborhood = (await neighborhoodOption.innerText()).trim();
          await neighborhoodOption.click();
          await page.waitForFunction((name) => new URLSearchParams(location.search).get("neighborhood") === name, selectedNeighborhood);

          await page.getByLabel("جست‌وجوی فایل").fill("آپارتمان");
          await page.waitForFunction(() => new URLSearchParams(location.search).get("q") === "آپارتمان");
          const searchClear = page.locator('.pf-search button[aria-label="پاک کردن جست‌وجو"]').first();
          if (await searchClear.isVisible().catch(() => false)) {
            const searchClearSize = await searchClear.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { width: Math.round(rect.width), height: Math.round(rect.height) };
            });
            if (searchClearSize.width < 44 || searchClearSize.height < 44) {
              failures.push("/properties @ 320px: search clear action must be at least 44×44px; actual=" + JSON.stringify(searchClearSize));
            }
          } else {
            failures.push("/properties @ 320px: search clear action did not appear for a non-empty query");
          }
          await page.getByLabel("جست‌وجوی فایل").fill("");
          await page.waitForFunction(() => !new URLSearchParams(location.search).has("q"));

          const sortControl = page.getByLabel("مرتب‌سازی نتایج");
          await sortControl.selectOption("price_asc");
          await page.waitForFunction(() => new URLSearchParams(location.search).get("sort") === "price_asc");

          const resetButton = page.locator(".pf-sidebar.is-open[role=dialog] .pf-reset").first();
          if (!(await resetButton.isVisible().catch(() => false))) {
            await filterButton.click();
            await page.locator(".pf-sidebar.is-open[role=dialog]").waitFor({ state: "visible", timeout: 5_000 });
          }
          const overviewClear = page.locator(".pf-sidebar.is-open[role=dialog] .pf-filter-overview > button").first();
          if (await overviewClear.isVisible().catch(() => false)) {
            const overviewClearSize = await overviewClear.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { width: Math.round(rect.width), height: Math.round(rect.height) };
            });
            if (overviewClearSize.width < 44 || overviewClearSize.height < 44) {
              failures.push("/properties @ 320px: active-filter clear action must be at least 44×44px; actual=" + JSON.stringify(overviewClearSize));
            }
          } else {
            failures.push("/properties @ 320px: active-filter clear action was not visible in the open drawer");
          }
          await page.locator(".pf-sidebar.is-open[role=dialog] .pf-reset").first().click();
          await page.waitForFunction(() => {
            const params = new URLSearchParams(location.search);
            return !["transaction", "minArea", "maxArea", "minPrice", "maxPrice", "neighborhood", "q", "sort"].some((key) => params.has(key));
          });
          const closeAfterFilterTest = page.locator(".pf-close").first();
          if (await closeAfterFilterTest.isVisible().catch(() => false)) await closeAfterFilterTest.click();

          await page.locator(".pf-count em").waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
          const loadMore = page.locator(".pf-more button").first();
          if (await loadMore.isVisible().catch(() => false)) {
            const beforeCount = await page.locator(".pf-grid .pcard-mobile-list").count();
            await loadMore.click();
            await page.waitForFunction((before) => {
              return document.querySelectorAll(".pf-grid .pcard-mobile-list").length > before;
            }, beforeCount, { timeout: 15_000 });
          }
        }
      }


      if (route === "/properties") {
        const listButton = page.locator('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]').first();
        if (await listButton.getAttribute("aria-pressed") !== "true") {
          failures.push("/properties @ 320px: mobile did not start in list view");
        }

        // Keep the filtered view populated by the deterministic fixture so
        // the view-mode checks exercise real cards, not an intentionally empty result.
        await page.goto(new URL("/properties?sort=price_asc", baseUrl).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const filteredResultCard = page.locator(".pf-grid .pcard-mobile-list").first();
        const filteredResultReady = await filteredResultCard.waitFor({ state: "visible", timeout: 15_000 })
          .then(() => true).catch(() => false);
        if (!filteredResultReady) failures.push("/properties: the sorted query did not return a published property card");
        const firstCard = page.locator(".pf-grid .pcard-mobile-list").first();
        await firstCard.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        if (await firstCard.isVisible().catch(() => false)) {
          const firstCardImage = firstCard.locator(".pcard-media img").first();
          await firstCardImage.scrollIntoViewIfNeeded().catch(() => {});
          await firstCardImage.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
          const imageLoaded = await page.waitForFunction((selector) => {
            const image = document.querySelector(selector);
            return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
          }, ".pf-grid .pcard-mobile-list .pcard-media img", { timeout: 10_000 })
            .then(() => true).catch(() => false);
          if (!imageLoaded) {
            const imageState = await firstCardImage.evaluate((image) => ({
              src: image.getAttribute("src"),
              currentSrc: image.currentSrc,
              complete: image.complete,
              naturalWidth: image.naturalWidth,
            })).catch(() => null);
            failures.push("/properties @ 320px: first property image did not load successfully; state=" + JSON.stringify(imageState));
          }

          const geometry = await firstCard.evaluate((card) => {
            const media = card.querySelector(".pcard-media")?.getBoundingClientRect();
            const body = card.querySelector(".pcard-body")?.getBoundingClientRect();
            const rail = card.querySelector(".pcard-actions .property-actions, .pcard-actions .property-actions-compact");
            const railRect = rail?.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const railStyle = rail ? getComputedStyle(rail) : null;
            const buttons = Array.from(card.querySelectorAll(".pcard-actions .property-action"));
            return {
              imageOnRight: Boolean(media && body && media.left >= body.right - 2),
              actions: buttons.map((button) => button.getAttribute("aria-label") || ""),
              actionRailContained: Boolean(railRect &&
                railRect.left >= cardRect.left - 1 && railRect.right <= cardRect.right + 1),
              actionRailScrollable: Boolean(rail && railStyle &&
                ["auto", "scroll"].includes(railStyle.overflowX) && rail.scrollWidth > rail.clientWidth + 1),
              actionTargetsUsable: buttons.length > 0 && buttons.every((button) => {
                const buttonRect = button.getBoundingClientRect();
                return buttonRect.width >= 44 && buttonRect.height >= 44;
              }),
            };
          });
          if (!geometry.imageOnRight) failures.push("/properties @ 320px: property image is not on the right of the details");
          if (!geometry.actions.some((label) => label.includes("ذخیره")) || !geometry.actions.some((label) => label.includes("مقایسه"))) failures.push("/properties @ 320px: favorite or compare action is missing");
          if (!geometry.actionRailContained) failures.push("/properties @ 320px: property action rail exceeds the card bounds");
          if (!geometry.actionRailScrollable) failures.push("/properties @ 320px: compact property actions are not horizontally scrollable");
          if (!geometry.actionTargetsUsable) failures.push("/properties @ 320px: property action buttons must keep 44px touch targets");
          for (const edgeAction of [firstCard.locator(".pcard-actions .property-action").first(), firstCard.locator(".pcard-actions .property-action").last()]) {
            await edgeAction.evaluate((button) => button.scrollIntoView({ block: "nearest", inline: "nearest" }));
            const edgeActionVisible = await edgeAction.evaluate((button) => {
              const rail = button.closest(".property-actions, .property-actions-compact");
              if (!rail) return false;
              const buttonRect = button.getBoundingClientRect();
              const railRect = rail.getBoundingClientRect();
              return buttonRect.left >= railRect.left - 1 && buttonRect.right <= railRect.right + 1;
            });
            if (!edgeActionVisible) failures.push("/properties @ 320px: an edge property action cannot be reached by scrolling the action rail");
          }
          const detailsHref = await firstCard.locator(".pcard-link").getAttribute("href");
          if (!detailsHref || (!detailsHref.startsWith("/properties/") && !detailsHref.startsWith("/file/"))) failures.push("/properties @ 320px: property details link is missing or invalid");

          const verifyActionToggle = async (selector, label) => {
            const control = firstCard.locator(selector).first();
            if (!(await control.isVisible().catch(() => false))) {
              failures.push("/properties @ 320px: " + label + " action is not visible");
              return;
            }
            const before = (await control.getAttribute("aria-pressed")) === "true";
            await control.click();
            await page.waitForFunction(({ query, pressed }) => {
              return document.querySelector(query)?.getAttribute("aria-pressed") === String(pressed);
            }, { query: selector, pressed: !before });
            await firstCard.locator(selector).first().click();
            await page.waitForFunction(({ query, pressed }) => {
              return document.querySelector(query)?.getAttribute("aria-pressed") === String(pressed);
            }, { query: selector, pressed: before });
          };

          await verifyActionToggle(
            '.pcard-actions .property-action[aria-label="ذخیره فایل"], .pcard-actions .property-action[aria-label="حذف از ذخیره‌ها"]',
            "favorite",
          );
          await verifyActionToggle(
            '.pcard-actions .property-action[aria-label="افزودن به مقایسه"], .pcard-actions .property-action[aria-label="حذف از مقایسه"]',
            "compare",
          );
        } else {
          failures.push("/properties @ 320px: no published property card was available for layout verification");
        }
        await page.waitForFunction(() => document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]')?.getAttribute("aria-pressed") === "true",
          null, { timeout: 8_000 }).catch(() => {});
        const retainedKeys = ["q", "transaction", "sort", "minArea", "maxArea"];
        const expectedParams = await page.evaluate((keys) => Object.fromEntries(
          keys.map((key) => [key, new URLSearchParams(window.location.search).get(key)]),
        ), retainedKeys);

        for (const width of [320, 1024]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(120);
          for (const label of ["نمایش شبکه‌ای فایل‌ها", "نمایش فهرستی فایل‌ها", "نمایش فایل‌ها روی نقشه", "نمایش فهرستی فایل‌ها"]) {
            const selector = '.pf-views button[aria-label="' + label + '"]';
            const button = page.locator(selector).first();
            if (!(await button.isVisible().catch(() => false))) {
              failures.push("/properties @ " + width + "px: view control " + label + " is not visible");
              continue;
            }
            await button.click();
            const viewChanged = await page.waitForFunction(
              (query) => document.querySelector(query)?.getAttribute("aria-pressed") === "true",
              selector,
              { timeout: 5_000 },
            ).then(() => true).catch(() => false);
            if (!viewChanged) failures.push("/properties @ " + width + "px: view button did not activate " + label);
            if (label === "نمایش فایل‌ها روی نقشه") {
              const mapCanvas = page.locator(".pf-map-panel .pf-map-canvas").first();
              if (!(await mapCanvas.isVisible().catch(() => false))) {
                failures.push("/properties @ " + width + "px: selecting map view did not render the interactive map canvas");
              } else {
                const zoomControl = mapCanvas.getByRole("button", { name: "بزرگ‌نمایی نقشه" }).first();
                if (!(await zoomControl.isVisible().catch(() => false))) {
                  failures.push("/properties @ " + width + "px: interactive map controls are missing");
                }
              }
            }
            const actualParams = await page.evaluate((keys) => Object.fromEntries(
              keys.map((key) => [key, new URLSearchParams(window.location.search).get(key)]),
            ), retainedKeys);
            for (const key of retainedKeys) {
              if (actualParams[key] !== expectedParams[key]) {
                failures.push("/properties @ " + width + "px: switching to " + label + " changed URL parameter " + key);
              }
            }
          }
        }

        // Opening a real property and returning must retain every active URL filter.
        const retainedDetailLink = page.locator(".pf-grid .pcard-mobile-list .pcard-link").first();
        await retainedDetailLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        if (await retainedDetailLink.isVisible().catch(() => false)) {
          await retainedDetailLink.click();
          await page.waitForURL((url) => url.pathname.startsWith("/properties/") || url.pathname.startsWith("/file/"), { timeout: 15_000 });
          await page.goBack({ waitUntil: "domcontentloaded" });
          await page.waitForFunction((expected) => {
            const actual = new URLSearchParams(window.location.search);
            return window.location.pathname.replace(/\/+$/, "") === "/properties" &&
              Object.entries(expected).every(([key, value]) => actual.get(key) === value);
          }, expectedParams, { timeout: 15_000 });
        } else {
          failures.push("/properties: no real property link was available to verify browser-back filter restoration");
        }

        const desktopPage = await browser.newPage({ viewport: { width: 1024, height: 900 } });
        await desktopPage.goto(new URL("/properties", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await desktopPage.waitForTimeout(700);
        const desktopMapDefault = await desktopPage.locator('.pf-views button[aria-label="نمایش فایل‌ها روی نقشه"]').getAttribute("aria-pressed").catch(() => null);
        if (desktopMapDefault !== "true") failures.push("/properties @ 1024px: desktop map-first default changed unexpectedly");
        await desktopPage.setViewportSize({ width: 320, height: 900 });
        const resizedMobileDefaultReady = await desktopPage.waitForFunction(() => {
          const listButton = document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]');
          return window.matchMedia("(max-width: 720px)").matches &&
            listButton?.getAttribute("aria-pressed") === "true";
        }, null, { timeout: 5_000 }).then(() => true).catch(() => false);
        if (!resizedMobileDefaultReady) {
          const state = await desktopPage.evaluate(() => ({
            viewport: window.innerWidth,
            mediaMatches: window.matchMedia("(max-width: 720px)").matches,
            listPressed: document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]')?.getAttribute("aria-pressed"),
            mapPressed: document.querySelector('.pf-views button[aria-label="نمایش فایل‌ها روی نقشه"]')?.getAttribute("aria-pressed"),
            gridPressed: document.querySelector('.pf-views button[aria-label="نمایش شبکه‌ای فایل‌ها"]')?.getAttribute("aria-pressed"),
            listClass: document.querySelector(".pf-grid")?.className,
          }));
          failures.push("/properties: entering mobile without a manual choice did not switch to list view; state=" + JSON.stringify(state));
        }
        const desktopGridButton = desktopPage.locator('.pf-views button[aria-label="نمایش شبکه‌ای فایل‌ها"]').first();
        await desktopGridButton.click();
        await desktopPage.waitForFunction(() => document.querySelector('.pf-views button[aria-label="نمایش شبکه‌ای فایل‌ها"]')?.getAttribute("aria-pressed") === "true",
          null, { timeout: 5_000 });
        await desktopPage.setViewportSize({ width: 1024, height: 900 });
        await desktopPage.setViewportSize({ width: 320, height: 900 });
        const retainedGridChoiceReady = await desktopPage.waitForFunction(() => {
          const gridButton = document.querySelector('.pf-views button[aria-label="نمایش شبکه‌ای فایل‌ها"]');
          return window.matchMedia("(max-width: 720px)").matches &&
            gridButton?.getAttribute("aria-pressed") === "true";
        }, null, { timeout: 5_000 }).then(() => true).catch(() => false);
        if (!retainedGridChoiceReady) failures.push("/properties: a manually selected grid view was overwritten by viewport changes");
        await desktopPage.close();
      }

      for (const width of viewportWidths) {
        await page.setViewportSize({ width, height: 900 });
        if (route === "/properties" && screenshotRoutes.has(route)) {
          // Capture the real default listing at each width; the interaction
          // checks above intentionally finish on a filtered URL with no matches.
          // Use the explicit default sort to force a fresh document instead of
          // restoring the earlier filtered page from the browser back-forward cache.
          await page.goto(new URL("/properties?sort=newest", baseUrl).toString(), {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          await page.waitForFunction(() => !new URLSearchParams(window.location.search).has("sort"),
            null, { timeout: 5_000 }).catch(() => {});
          await page.waitForTimeout(500);
          const defaultViewLabel = width <= 720 ? "نمایش فهرستی فایل‌ها" : "نمایش شبکه‌ای فایل‌ها";
          const defaultView = page.locator('.pf-views button[aria-label="' + defaultViewLabel + '"]').first();
          await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-pressed") === "true",
            '.pf-views button[aria-label="' + defaultViewLabel + '"]', { timeout: 8_000 }).catch(() => {});
          if ((await defaultView.getAttribute("aria-pressed").catch(() => null)) !== "true") {
            failures.push("/properties @ " + width + "px: default view was not restored before responsive screenshot capture");
          }
          const filterDrawerState = await page.locator(".pf-sidebar").first().evaluate((drawer) => {
            const style = getComputedStyle(drawer);
            return {
              isOpen: drawer.classList.contains("is-open"),
              opacity: style.opacity,
              pointerEvents: style.pointerEvents,
              position: style.position,
            };
          }).catch(() => null);
          if (width <= 979 && filterDrawerState && (
            filterDrawerState.isOpen ||
            filterDrawerState.opacity !== "0" ||
            filterDrawerState.pointerEvents !== "none" ||
            filterDrawerState.position !== "fixed"
          )) {
            failures.push("/properties @ " + width + "px: filter drawer was not hidden on the default listing; state=" + JSON.stringify(filterDrawerState));
            if (filterDrawerState.isOpen) {
              const closeDrawer = page.locator(".pf-sidebar.is-open .pf-close").first();
              if (await closeDrawer.isVisible().catch(() => false)) await closeDrawer.click();
              await page.waitForFunction(() => !document.querySelector(".pf-sidebar.is-open"), null, { timeout: 5_000 }).catch(() => {});
            }
          }
        }
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
          if (viewport <= 430) {
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
        failures.push(route + ": uncaught browser errors=" + JSON.stringify(pageErrors.slice(0, 5)));
      }
      if (criticalNetworkFailures.length) {
        failures.push(route + ": critical same-origin network failures=" + JSON.stringify(criticalNetworkFailures.slice(0, 8)));
      }
      if (consoleErrors.length || networkWarnings.length) {
        summaries.push({
          route,
          consoleErrors: consoleErrors.slice(0, 5),
          networkWarnings: networkWarnings.slice(0, 8),
        });
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
const browserDiagnosticWarnings = summaries.filter((entry) => entry.consoleErrors?.length || entry.networkWarnings?.length);
if (browserDiagnosticWarnings.length) {
  console.warn(`[responsive-smoke] browser console/network warnings in ${browserDiagnosticWarnings.length} route(s):`);
  for (const warning of browserDiagnosticWarnings.slice(0, 30)) {
    console.warn(`  ${warning.route}: ${JSON.stringify({ consoleErrors: warning.consoleErrors, networkWarnings: warning.networkWarnings })}`);
  }
}
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
