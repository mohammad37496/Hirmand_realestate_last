#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";
import { computeBrandWarnings } from "./brand-check.mjs";
import {
  authInvariantWarnings,
  buildAuthEnabled,
  compareAuthInvariant,
  probeDevAuthEnabled,
} from "./check-auth-invariant.mjs";
import {
  baselineComparison,
  bodyTextPrefix,
  derivedPaths,
  exitCodeFor,
  normalizeBodyText,
  normalizedBodyTextHash,
  parseSmokeArgs,
} from "./browser-smoke-verdict.mjs";

const args = parseSmokeArgs(process.argv.slice(2), process.env);
if (args.error) {
  console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
  process.exit(1);
}

const url = checkedUrl(args.url);
const outPng = checkedOutputPath(args.outPng, ["/workspace"]);
const derived = derivedPaths(outPng);
const mobilePng = checkedOutputPath(derived.mobilePng, ["/workspace"]);
const outJson = checkedOutputPath(derived.verdictJson, ["/workspace"], "verdict JSON");

const MAX_BASELINE_BYTES = 1024 * 1024;
const baselineRequested = Boolean(args.baseline);
let baselinePath = null;
let baselineResolveError = null;
if (baselineRequested) {
  try {
    baselinePath = checkedOutputPath(realpathSync(args.baseline), ["/workspace"], "baseline");
  } catch (err) {
    baselineResolveError = err?.code ?? "unresolvable path";
  }
  if (baselinePath === outJson) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            `--baseline ${args.baseline} is this run's own verdict output; ` +
            "pass a distinct output PNG (e.g. app-builder-built.png) so the baseline is not overwritten",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

const timeoutMs = Number(process.env.BROWSER_SMOKE_TIMEOUT_MS || 45000);

const screenshotFor = (name, fallback) =>
  name === "desktop-1280"
    ? outPng
    : name === "mobile-390"
      ? fallback
      : checkedOutputPath(
          outPng.replace(/\.png$/i, "-" + name + ".png"),
          ["/workspace"],
          name + " screenshot",
        );

const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 900, screenshot: screenshotFor("desktop-1920", mobilePng) },
  { name: "desktop-1280", width: 1280, height: 800, screenshot: outPng },
  { name: "tablet-1024", width: 1024, height: 820, screenshot: screenshotFor("tablet-1024", mobilePng) },
  { name: "mobile-430", width: 430, height: 900, screenshot: screenshotFor("mobile-430", mobilePng) },
  { name: "mobile-390", width: 390, height: 844, screenshot: mobilePng },
  { name: "mobile-375", width: 375, height: 812, screenshot: screenshotFor("mobile-375", mobilePng) },
];

mkdirSync(dirname(outPng), { recursive: true });

function compareAgainstBaseline(verdict) {
  if (!baselinePath) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${baselineResolveError ?? "unresolvable path"}`],
    };
  }
  try {
    if (statSync(baselinePath).size > MAX_BASELINE_BYTES) {
      return { divergesFromBaseline: true, reasons: ["baseline unreadable: too large"] };
    }
    return baselineComparison(verdict, readFileSync(baselinePath, "utf8"));
  } catch (err) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${err?.code ?? "read error"}`],
    };
  }
}

let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const viewports = {};
  for (const vp of VIEWPORTS) {
    const errors = { consoleErrors: [], pageErrors: [], httpErrors: [] };
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.pageErrors.push(String(err?.message || err)));
    // Chromium's generic "Failed to load resource: 404" console message omits
    // the requested URL. Capture same-origin failing responses so CI reports
    // the actual missing asset/API instead of only a browser exit code.
    const appOrigin = new URL(url).origin;
    page.on("response", (response) => {
      if (response.status() < 400) return;
      try {
        if (new URL(response.url()).origin === appOrigin) {
          errors.httpErrors.push(`http ${response.status()}: ${response.url()}`);
        }
      } catch {
        // Ignore non-URL response entries; the browser console still records them.
      }
    });
    // `domcontentloaded`, not `networkidle`: Vite keeps an HMR websocket open, so
    // networkidle never settles and would burn the whole timeout.
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = resp?.status() ?? 0;
    await page.waitForTimeout(1000);

    const title = await page.title();
    const hasCanvas = (await page.locator("canvas").count()) > 0;
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const horizontalOverflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });
    await page.screenshot({ path: vp.screenshot, fullPage: false });

    // Isolate the finance tools section for a focused visual regression check.
    const financeTools = page.locator(".tools-wrap").first();
    if (await financeTools.count()) {
      await financeTools.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(250);
      const financePath = vp.screenshot.replace(/\.png$/i, "-finance.png");
      await page.screenshot({ path: financePath, fullPage: false });
    }

    await page.close();

    viewports[vp.name] = {
      width: vp.width,
      height: vp.height,
      status,
      title,
      hasCanvas,
      bodyTextLen: normalizeBodyText(bodyText).length,
      bodyTextHash: normalizedBodyTextHash(bodyText),
      bodyTextPrefix: bodyTextPrefix(bodyText),
      horizontalOverflow,
      consoleErrors: errors.consoleErrors,
      pageErrors: errors.pageErrors,
      httpErrors: errors.httpErrors,
      screenshot: vp.screenshot,
    };
  }


  // Exercise the key public routes as part of the same Chromium session.
  // This catches client-side navigation regressions that a homepage-only smoke
  // test cannot see, especially the property-detail route reported by users.
  const routeChecks = [];
  const publicRoutes = [
    "/",
    "/properties",
    "/favorites",
    "/compare",
    "/tracking",
    "/consultants",
    "/budget-match",
    "/tools",
    "/tools/commission",
    "/tools/deposit",
    "/tools/loan",
    "/tools/rahn-rent",
  ].map((path) => new URL(path, url).toString());
  for (const routeUrl of publicRoutes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const routeErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") routeErrors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => routeErrors.push(`page: ${String(err?.message || err)}`));
    // A 404 shows up in the console as "Failed to load resource" with no URL, so
    // record the responses too — otherwise the report cannot say what broke.
    page.on("response", (response) => {
      if (response.status() < 400) return;
      routeErrors.push(`http ${response.status()}: ${response.url()}`);
    });
    let routeStatus = 0;
    let routeBodyTextLen = 0;
    let routeHorizontalOverflow = false;
    try {
      const response = await page.goto(routeUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      routeStatus = response?.status() ?? 0;
      await page.waitForTimeout(500);
      routeBodyTextLen = normalizeBodyText(await page.locator("body").innerText().catch(() => "")).length;
      routeHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    } finally {
      await page.close();
    }
    routeChecks.push({
      url: routeUrl,
      status: routeStatus,
      bodyTextLen: routeBodyTextLen,
      consoleErrors: routeErrors.filter((item) => item.startsWith("console:") || item.startsWith("http ")),
      pageErrors: routeErrors.filter((item) => item.startsWith("page:")),
      horizontalOverflow: routeHorizontalOverflow,
      ok:
        routeStatus >= 200 &&
        routeStatus < 400 &&
        routeBodyTextLen > 0 &&
        !routeHorizontalOverflow &&
        routeErrors.length === 0,
    });
  }

  // Dedicated map regression: URL bounds survive restore/reload, and the real
  // property query composes bbox, transaction, price, area and exact neighborhood.
  const mapInteractionCheck = {
    attempted: true,
    ok: true,
    initialBoundsRestored: false,
    refreshPreservedBounds: false,
    spatialFilterComposition: false,
    zoomPreservedOtherFilters: false,
    resetClearedBounds: false,
    neighborhoodSelection: false,
    neighborhoodTap: false,
    mobileRefreshAndPan: false,
    mobileDetails: null,
    zoomCanvasChanged: false,
    zoomBoundsChanged: false,
    propertyMarkerSelection: false,
    invalidBoundsFailClosed: false,
    emptySpatialFilterHandled: false,
    spatialFilterDetails: null,
    urlAfterZoomClick: null,
    browserErrors: [],
    errors: [],
  };
  // A broad custom viewport includes both inside fixtures while excluding the
  // outside fixture, and fits below max zoom so the zoom control must change it.
  const expectedMapBounds = [51.64, 32.73, 51.68, 32.745];
  const selectedNeighborhoodBounds = (() => {
    const catalog = JSON.parse(readFileSync(new URL("../data/divar-isfahan-neighborhoods.json", import.meta.url), "utf8"));
    const key = (value) => String(value ?? "").normalize("NFKC").replace(/[\s\u200c\u200d]+/g, "");
    const district = catalog.districts.find((item) => key(item.name) === key("شهرک ولی‌عصر"));
    return Array.isArray(district?.bbox) && district.bbox.length === 4 ? district.bbox : null;
  })();
  const mapTimeoutMs = Math.min(timeoutMs, 10_000);
  const closeBounds = (left, right, tolerance = 1e-6) =>
    Array.isArray(left) && Array.isArray(right) && left.length === 4 && right.length === 4 &&
    left.every((value, index) => Number.isFinite(value) && Math.abs(value - right[index]) <= tolerance);
  const boundsContain = (outer, inner, tolerance = 1e-7) =>
    Array.isArray(outer) && Array.isArray(inner) && outer.length === 4 && inner.length === 4 &&
    outer.every(Number.isFinite) && inner.every(Number.isFinite) &&
    outer[0] <= inner[0] + tolerance &&
    outer[1] <= inner[1] + tolerance &&
    outer[2] >= inner[2] - tolerance &&
    outer[3] >= inner[3] - tolerance;
  const parseBoundsAttribute = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const bounds = value.split(",").map((part) => Number(part.trim()));
    return bounds.length === 4 && bounds.every(Number.isFinite) ? bounds : null;
  };
  const readMapState = (page) => page.evaluate(() => {
    const current = new URL(window.location.href);
    const params = current.searchParams;
    const rawBounds = params.get("map_bbox") || params.get("bbox");
    const bounds = rawBounds ? rawBounds.split(",").map((value) => Number(value.trim())) : null;
    return {
      href: current.href,
      bounds: bounds && bounds.length === 4 && bounds.every(Number.isFinite) ? bounds : null,
      mapBbox: params.get("map_bbox"),
      bbox: params.get("bbox"),
      neighborhood: params.get("neighborhood"),
      transaction: params.get("transaction"),
      minPrice: params.get("minPrice"),
      maxArea: params.get("maxArea"),
      mapListText: document.querySelector(".pf-map-list")?.innerText ?? "",
      mapCanvas: (() => {
        const element = document.querySelector(".pf-map-canvas");
        return element ? {
          zoom: Number(element.getAttribute("data-map-zoom")),
          centerLatitude: Number(element.getAttribute("data-map-center-latitude")),
          centerLongitude: Number(element.getAttribute("data-map-center-longitude")),
          viewportBounds: element.getAttribute("data-map-viewport-bounds"),
        } : null;
      })(),
      listingState: (() => {
        const element = document.querySelector(".pf-page");
        return element ? {
          bounds: element.getAttribute("data-active-map-bounds"),
          neighborhood: element.getAttribute("data-active-neighborhood"),
          loading: element.getAttribute("data-list-loading"),
          resultCount: element.getAttribute("data-list-result-count"),
        } : null;
      })(),
      filterErrorVisible: document.body.innerText.includes("جستجوی فایل‌ها انجام نشد"),
      mapLinkHref: document.querySelector(".pf-map-floating-head a")?.href ?? "",
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  let mapPage = null;
  let mobileMapPage = null;
  let invalidBoundsPage = null;
  let emptyBoundsPage = null;
  try {
    mapPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    mapPage.on("console", (message) => {
      if (message.type() === "error") mapInteractionCheck.browserErrors.push("console: " + message.text());
    });
    mapPage.on("pageerror", (error) => mapInteractionCheck.browserErrors.push("page: " + String(error?.message || error)));
    mapPage.on("requestfailed", (request) => {
      try {
        if (new URL(request.url()).origin === new URL(url).origin) {
          mapInteractionCheck.browserErrors.push("request failed: " + request.url() + " (" + (request.failure()?.errorText ?? "unknown") + ")");
        }
      } catch { /* Ignore non-URL request entries. */ }
    });
    mapPage.on("response", (response) => {
      if (response.status() < 400) return;
      try {
        if (new URL(response.url()).origin === new URL(url).origin) {
          mapInteractionCheck.browserErrors.push("http " + response.status() + ": " + response.url());
        }
      } catch { /* Ignore non-URL responses. */ }
    });
    const boundsString = expectedMapBounds.join(",");
    const filteredMapUrl = new URL("/properties", url);
    filteredMapUrl.search = new URLSearchParams({
      map_bbox: boundsString,
      bbox: boundsString,
      transaction: "sell",
      minPrice: "5000000000",
      maxArea: "120",
    }).toString();
    await mapPage.goto(filteredMapUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await mapPage.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: timeoutMs });
    // Let the debounced listing request settle, but keep the individual fixture
    // assertions below diagnostic: a missing fixture should not erase all later
    // observations about URL sync, reset, neighborhood selection and mobile.
    // In the disposable database, exactly two records should survive the
    // combined bbox + sale + minimum price + maximum area query.
    await mapPage.waitForFunction(
      () => {
        const root = document.querySelector(".pf-page");
        return root?.getAttribute("data-list-result-count") === "2" ||
          document.body.innerText.includes("جستجوی فایل‌ها انجام نشد");
      },
      null,
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);

    let mapState = await readMapState(mapPage);
    mapInteractionCheck.initialBoundsRestored =
      closeBounds(mapState.bounds, expectedMapBounds) &&
      mapState.transaction === "sell" &&
      mapState.minPrice === "5000000000" &&
      mapState.maxArea === "120";
    const insideShown = mapState.mapListText.includes("فایل تست نقشه داخل محدوده");
    const otherNeighborhoodShownBeforeAreaFilter = mapState.mapListText.includes("فایل تست نقشه محله دیگر");
    const outsideBboxHidden = !mapState.mapListText.includes("فایل تست نقشه خارج محدوده");
    const noCoordinatesHidden = !mapState.mapListText.includes("فایل تست نقشه بدون مختصات");
    mapInteractionCheck.spatialFilterComposition =
      insideShown && otherNeighborhoodShownBeforeAreaFilter && outsideBboxHidden && noCoordinatesHidden &&
      mapState.listingState?.resultCount === "2" && mapState.listingState?.loading === "false";
    mapInteractionCheck.spatialFilterDetails = {
      insideShown,
      otherNeighborhoodShownBeforeAreaFilter,
      outsideBboxHidden,
      noCoordinatesHidden,
      titles: ["فایل تست نقشه داخل محدوده", "فایل تست نقشه خارج محدوده", "فایل تست نقشه محله دیگر", "فایل تست نقشه بدون مختصات"]
        .filter((title) => mapState.mapListText.includes(title)),
      listingState: mapState.listingState,
      filterErrorVisible: mapState.filterErrorVisible,
      browserErrors: mapInteractionCheck.browserErrors,
    };

    await mapPage.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await mapPage.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: timeoutMs });
    await mapPage.waitForFunction(
      () => document.querySelector(".pf-page")?.getAttribute("data-list-result-count") === "2" ||
        document.body.innerText.includes("جستجوی فایل‌ها انجام نشد"),
      null,
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);
    mapState = await readMapState(mapPage);
    mapInteractionCheck.refreshPreservedBounds =
      closeBounds(mapState.bounds, expectedMapBounds) &&
      mapState.transaction === "sell" &&
      mapState.minPrice === "5000000000" &&
      mapState.maxArea === "120";

    const beforeZoom = mapState.bounds;
    const beforeCanvasZoom = mapState.mapCanvas?.zoom;
    await mapPage.locator('.pf-map-controls button[aria-label="بزرگ‌نمایی نقشه"]').click();
    await mapPage.waitForFunction(
      (previousZoom) => {
        const element = document.querySelector(".pf-map-canvas");
        return Boolean(element) && Number(element.getAttribute("data-map-zoom")) !== previousZoom;
      },
      beforeCanvasZoom,
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);
    mapState = await readMapState(mapPage);
    mapInteractionCheck.zoomCanvasChanged = mapState.mapCanvas?.zoom !== beforeCanvasZoom;
    mapInteractionCheck.zoomBoundsChanged =
      Array.isArray(beforeZoom) && Array.isArray(mapState.bounds) && !closeBounds(mapState.bounds, beforeZoom, 1e-5);
    mapInteractionCheck.urlAfterZoomClick = mapState;
    mapInteractionCheck.zoomPreservedOtherFilters =
      mapInteractionCheck.zoomCanvasChanged &&
      mapInteractionCheck.zoomBoundsChanged &&
      mapState.transaction === "sell" &&
      mapState.minPrice === "5000000000" &&
      mapState.maxArea === "120";

    await mapPage.getByRole("button", { name: "پاک‌کردن همه", exact: true }).first().click();
    await mapPage.waitForFunction(() => {
      const params = new URLSearchParams(window.location.search);
      return !params.has("map_bbox") && !params.has("bbox") &&
        !params.has("transaction") && !params.has("minPrice") && !params.has("maxArea");
    }, null, { timeout: mapTimeoutMs }).catch(() => undefined);
    mapState = await readMapState(mapPage);
    mapInteractionCheck.resetClearedBounds =
      !mapState.mapBbox && !mapState.bbox &&
      !mapState.transaction && !mapState.minPrice && !mapState.maxArea;

    await mapPage.locator(".pf-neighborhood-trigger").click();
    const neighborhoodDialog = mapPage.getByRole("dialog");
    await neighborhoodDialog.getByRole("searchbox", { name: "جست‌وجوی محله‌ها" }).fill("شهرک ولی‌عصر");
    await neighborhoodDialog.getByRole("button", { name: /شهرک ولی.?عصر/ }).first().click();
    await mapPage.waitForFunction(
      (name) => new URLSearchParams(window.location.search).get("neighborhood") === name,
      "شهرک ولی‌عصر",
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);
    if (!selectedNeighborhoodBounds) {
      throw new Error("Divar catalog has no validated bbox for the selected neighborhood.");
    }
    await mapPage.waitForFunction(
      (expected) => {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("map_bbox") || params.get("bbox");
        if (!raw) return false;
        const bounds = raw.split(",").map((value) => Number(value.trim()));
        return bounds.length === 4 && bounds.every(Number.isFinite) &&
          bounds.every((value, index) => Math.abs(value - expected[index]) <= 1e-6);
      },
      selectedNeighborhoodBounds,
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);
    await mapPage.waitForTimeout(600);
    mapState = await readMapState(mapPage);
    mapInteractionCheck.neighborhoodSelection =
      mapState.neighborhood === "شهرک ولی‌عصر" &&
      mapState.mapListText.includes("فایل تست نقشه داخل محدوده") &&
      !mapState.mapListText.includes("فایل تست نقشه خارج محدوده") &&
      !mapState.mapListText.includes("فایل تست نقشه محله دیگر") &&
      !mapState.mapListText.includes("فایل تست نقشه بدون مختصات");

    // Selecting a marker opens a compact details popup, with a working route to the listing.
    const propertyMarker = mapPage.locator(".pf-map-marker").first();
    if (await propertyMarker.count()) {
      await propertyMarker.click();
      await mapPage.locator(".pf-map-marker.is-active").first().waitFor({ state: "visible", timeout: mapTimeoutMs }).catch(() => undefined);
      const propertyPopup = mapPage.locator(".pf-map-property-popup");
      await propertyPopup.waitFor({ state: "visible", timeout: mapTimeoutMs }).catch(() => undefined);
      const popupVisible = await propertyPopup.isVisible().catch(() => false);
      const detailLinkVisible = await propertyPopup.locator('a[href^="/properties/"]').count() > 0;
      const popupWithinCanvas = await mapPage.evaluate(() => {
        const canvas = document.querySelector(".pf-map-canvas")?.getBoundingClientRect();
        const popup = document.querySelector(".pf-map-property-popup")?.getBoundingClientRect();
        return Boolean(canvas && popup) &&
          popup.left >= canvas.left - 1 && popup.top >= canvas.top - 1 &&
          popup.right <= canvas.right + 1 && popup.bottom <= canvas.bottom + 1;
      });
      await propertyPopup.getByRole("button", { name: "بستن جزئیات فایل انتخاب‌شده" }).click().catch(() => undefined);
      const popupClosed = await propertyPopup.count() === 0;
      mapInteractionCheck.propertyMarkerSelection =
        await mapPage.locator(".pf-map-marker.is-active").count() > 0 &&
        popupVisible && detailLinkVisible && popupWithinCanvas && popupClosed;
    }

    // Tap a visible neighborhood extent away from the selected bbox. The
    // overlay is pointer-transparent so this exercises the map's hit-test path,
    // not a click handler attached to a blocking rectangle.
    const mapBoxTapTarget = await mapPage.evaluate(() => {
      const active = document.querySelector(".pf-map-neighborhood-box.is-active")?.getBoundingClientRect();
      const candidates = [...document.querySelectorAll(".pf-map-neighborhood-box:not(.is-active)")].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("data-neighborhood-name") ?? "",
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        };
      }).filter((candidate) =>
        candidate.name && candidate.width > 10 && candidate.height > 10 &&
        (!active || candidate.x < active.left || candidate.x > active.right || candidate.y < active.top || candidate.y > active.bottom),
      ).sort((a, b) => a.width * a.height - b.width * b.height);
      return candidates[0] ?? null;
    });
    const priorTapNeighborhood = mapState.neighborhood;
    if (mapBoxTapTarget) {
      await mapPage.mouse.click(mapBoxTapTarget.x, mapBoxTapTarget.y);
      await mapPage.waitForFunction(
        (previous) => {
          const selected = new URLSearchParams(window.location.search).get("neighborhood");
          return Boolean(selected) && selected !== previous;
        },
        priorTapNeighborhood,
        { timeout: mapTimeoutMs },
      ).catch(() => undefined);
      mapState = await readMapState(mapPage);
      mapInteractionCheck.neighborhoodTap =
        Boolean(mapState.neighborhood) && mapState.neighborhood !== priorTapNeighborhood;
    }

    mobileMapPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobileUrl = new URL("/properties", url);
    mobileUrl.search = new URLSearchParams({
      map_bbox: boundsString,
      bbox: boundsString,
      neighborhood: "شهرک ولی‌عصر",
    }).toString();
    await mobileMapPage.goto(mobileUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await mobileMapPage.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: timeoutMs });
    await mobileMapPage.waitForTimeout(300);
    await mobileMapPage.waitForFunction(
      (expected) => {
        const raw = document.querySelector(".pf-map-canvas")?.getAttribute("data-map-viewport-bounds");
        if (!raw) return false;
        const values = raw.split(",").map((part) => Number(part.trim()));
        return values.length === 4 && values.every(Number.isFinite) &&
          values[0] <= expected[0] + 1e-7 && values[1] <= expected[1] + 1e-7 &&
          values[2] >= expected[2] - 1e-7 && values[3] >= expected[3] - 1e-7;
      },
      expectedMapBounds,
      { timeout: mapTimeoutMs },
    ).catch(() => undefined);
    let mobileState = await readMapState(mobileMapPage);
    const mobileNoOverflow = !mobileState.horizontalOverflow;
    const mobileBboxSaved = closeBounds(mobileState.bounds, expectedMapBounds);
    const mobileViewportContainsSavedBounds = boundsContain(
      parseBoundsAttribute(mobileState.mapCanvas?.viewportBounds),
      expectedMapBounds,
    );
    await mobileMapPage.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await mobileMapPage.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: timeoutMs });
    await mobileMapPage.waitForTimeout(300);
    mobileState = await readMapState(mobileMapPage);
    const mobileRefreshPreserved = closeBounds(mobileState.bounds, expectedMapBounds) && !mobileState.horizontalOverflow;
    let mobilePopupInteraction = false;
    const mobileMarker = mobileMapPage.locator(".pf-map-marker").first();
    if (await mobileMarker.count()) {
      await mobileMarker.tap().catch(() => undefined);
      const mobilePopup = mobileMapPage.locator(".pf-map-property-popup");
      await mobilePopup.waitFor({ state: "visible", timeout: mapTimeoutMs }).catch(() => undefined);
      const popupVisible = await mobilePopup.isVisible().catch(() => false);
      const detailLinkVisible = await mobilePopup.locator('a[href^="/properties/"]').count() > 0;
      const popupWithinCanvas = await mobileMapPage.evaluate(() => {
        const canvas = document.querySelector(".pf-map-canvas")?.getBoundingClientRect();
        const popup = document.querySelector(".pf-map-property-popup")?.getBoundingClientRect();
        return Boolean(canvas && popup) &&
          popup.left >= canvas.left - 1 && popup.top >= canvas.top - 1 &&
          popup.right <= canvas.right + 1 && popup.bottom <= canvas.bottom + 1;
      });
      await mobilePopup.getByRole("button", { name: "بستن جزئیات فایل انتخاب‌شده" }).tap().catch(() => undefined);
      const popupClosed = await mobilePopup.count() === 0;
      mobilePopupInteraction = popupVisible && detailLinkVisible && popupWithinCanvas && popupClosed;
    }
    const mobileCanvas = mobileMapPage.locator(".pf-map-canvas");
    await mobileCanvas.scrollIntoViewIfNeeded();
    const mobileRect = await mobileCanvas.boundingBox();
    let mobilePanChangedBounds = false;
    if (mobileRect && mobileRect.width > 100 && mobileRect.height > 100 && Array.isArray(mobileState.bounds)) {
      // Start away from the center marker and the floating map controls, so the
      // pointer sequence targets the map surface on both touch-sized layouts.
      const x = mobileRect.x + mobileRect.width * 0.25;
      const y = mobileRect.y + mobileRect.height * 0.72;
      const priorBounds = mobileState.bounds;
      const hitTarget = await mobileMapPage.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element ? {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          insideCanvas: Boolean(element.closest(".pf-map-canvas")),
        } : null;
      }, { x, y });

      // Dispatch a real Chromium touch gesture instead of a mouse drag on a
      // mobile-emulated page. This exercises the same pointer path as a finger.
      const touchSession = await mobileMapPage.context().newCDPSession(mobileMapPage);
      const touchPoint = (tx, ty) => ({
        id: 1,
        x: Math.round(tx),
        y: Math.round(ty),
        radiusX: 3,
        radiusY: 3,
        force: 1,
      });
      try {
        await touchSession.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [touchPoint(x, y)],
          modifiers: 0,
        });
        for (let step = 1; step <= 4; step += 1) {
          await touchSession.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [touchPoint(x + 40 * step / 4, y + 28 * step / 4)],
            modifiers: 0,
          });
          await mobileMapPage.waitForTimeout(35);
        }
        await touchSession.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
          modifiers: 0,
        });
      } finally {
        await touchSession.detach().catch(() => undefined);
      }

      await mobileMapPage.waitForFunction(
        (previous) => {
          const params = new URLSearchParams(window.location.search);
          const raw = params.get("map_bbox") || params.get("bbox");
          if (!raw) return false;
          const next = raw.split(",").map((value) => Number(value.trim()));
          return next.length === 4 && next.every(Number.isFinite) &&
            next.some((value, index) => Math.abs(value - previous[index]) > 1e-5);
        },
        priorBounds,
        { timeout: mapTimeoutMs },
      ).catch(() => undefined);
      const afterPan = await readMapState(mobileMapPage);
      mobilePanChangedBounds = !closeBounds(afterPan.bounds, priorBounds, 1e-10);
      let mobileResizeSync = false;
      const boundsBeforeResize = afterPan.bounds;
      await mobileMapPage.setViewportSize({ width: 430, height: 844 });
      await mobileMapPage.waitForFunction(
        (previous) => {
          const params = new URLSearchParams(window.location.search);
          const raw = params.get("map_bbox") || params.get("bbox");
          if (!raw) return false;
          const next = raw.split(",").map((part) => Number(part.trim()));
          return next.length === 4 && next.every(Number.isFinite) &&
            next.some((value, index) => Math.abs(value - previous[index]) > 1e-5);
        },
        boundsBeforeResize,
        { timeout: mapTimeoutMs },
      ).catch(() => undefined);
      const afterResize = await readMapState(mobileMapPage);
      mobileResizeSync =
        !closeBounds(afterResize.bounds, boundsBeforeResize, 1e-5) &&
        closeBounds(afterResize.bounds, parseBoundsAttribute(afterResize.mapCanvas?.viewportBounds), 1e-6) &&
        !afterResize.horizontalOverflow;

      mapInteractionCheck.mobileDetails = {
        mobileNoOverflow,
        mobileBboxSaved,
        mobileViewportContainsSavedBounds,
        mobileRefreshPreserved,
        mobilePopupInteraction,
        mobilePanChangedBounds,
        mobileResizeSync,
        rect: { x: mobileRect.x, y: mobileRect.y, width: mobileRect.width, height: mobileRect.height },
        hitTarget,
        beforeBounds: priorBounds,
        afterBounds: afterPan.bounds,
        afterResizeBounds: afterResize.bounds,
        afterCanvas: afterPan.mapCanvas,
        resizedCanvas: afterResize.mapCanvas,
      };
    }
    mapInteractionCheck.mobileRefreshAndPan =
      mobileNoOverflow &&
      mobileBboxSaved &&
      mobileViewportContainsSavedBounds &&
      mobileRefreshPreserved &&
      mobilePopupInteraction &&
      mobilePanChangedBounds &&
      mapInteractionCheck.mobileDetails?.mobileResizeSync === true;

    // Invalid URL bounds must fail closed, not silently become an unbounded query.
    invalidBoundsPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const invalidBoundsUrl = new URL("/properties", url);
    invalidBoundsUrl.search = new URLSearchParams({
      map_bbox: "51.7,32.7,51.6,32.8",
      bbox: "51.7,32.7,51.6,32.8",
      transaction: "sell",
    }).toString();
    await invalidBoundsPage.goto(invalidBoundsUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await invalidBoundsPage.locator('[data-map-bounds-error="invalid"]').waitFor({ state: "visible", timeout: mapTimeoutMs });
    await invalidBoundsPage.waitForFunction(
      () => document.querySelector(".pf-page")?.getAttribute("data-list-result-count") === "0",
      null,
      { timeout: mapTimeoutMs },
    );
    const invalidBoundsState = await invalidBoundsPage.evaluate(() => ({
      count: document.querySelector(".pf-page")?.getAttribute("data-list-result-count"),
      alert: Boolean(document.querySelector('[data-map-bounds-error="invalid"]')),
      text: document.querySelector(".pf-map-list")?.innerText ?? "",
    }));
    mapInteractionCheck.invalidBoundsFailClosed =
      invalidBoundsState.count === "0" &&
      invalidBoundsState.alert &&
      !invalidBoundsState.text.includes("فایل تست نقشه داخل محدوده") &&
      !invalidBoundsState.text.includes("فایل تست نقشه خارج محدوده");

    // A valid but empty viewport must return zero rows after the server query,
    // rather than leave the prior/unfiltered list rendered.
    emptyBoundsPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const emptyBoundsUrl = new URL("/properties", url);
    emptyBoundsUrl.search = new URLSearchParams({
      map_bbox: "49.1,29.1,49.2,29.2",
      bbox: "49.1,29.1,49.2,29.2",
      transaction: "sell",
    }).toString();
    await emptyBoundsPage.goto(emptyBoundsUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await emptyBoundsPage.waitForFunction(
      () => document.querySelector(".pf-page")?.getAttribute("data-list-loading") === "false" &&
        document.querySelector(".pf-page")?.getAttribute("data-list-result-count") === "0",
      null,
      { timeout: mapTimeoutMs },
    );
    const emptyBoundsState = await emptyBoundsPage.evaluate(() => ({
      count: document.querySelector(".pf-page")?.getAttribute("data-list-result-count"),
      text: document.querySelector(".pf-map-list")?.innerText ?? "",
      filterError: document.body.innerText.includes("جستجوی فایل‌ها انجام نشد"),
    }));
    mapInteractionCheck.emptySpatialFilterHandled =
      emptyBoundsState.count === "0" &&
      !emptyBoundsState.filterError &&
      !emptyBoundsState.text.includes("فایل تست نقشه داخل محدوده") &&
      !emptyBoundsState.text.includes("فایل تست نقشه خارج محدوده");
  } catch (error) {
    mapInteractionCheck.ok = false;
    mapInteractionCheck.errors.push(String(error?.message || error));
  } finally {
    await mapPage?.close().catch(() => undefined);
    await mobileMapPage?.close().catch(() => undefined);
    await invalidBoundsPage?.close().catch(() => undefined);
    await emptyBoundsPage?.close().catch(() => undefined);
  }
  mapInteractionCheck.ok =
    mapInteractionCheck.ok &&
    mapInteractionCheck.browserErrors.length === 0 &&
    mapInteractionCheck.initialBoundsRestored &&
    mapInteractionCheck.refreshPreservedBounds &&
    mapInteractionCheck.spatialFilterComposition &&
    mapInteractionCheck.zoomPreservedOtherFilters &&
    mapInteractionCheck.resetClearedBounds &&
    mapInteractionCheck.neighborhoodSelection &&
    mapInteractionCheck.propertyMarkerSelection &&
    mapInteractionCheck.neighborhoodTap &&
    mapInteractionCheck.mobileRefreshAndPan &&
    mapInteractionCheck.invalidBoundsFailClosed &&
    mapInteractionCheck.emptySpatialFilterHandled;

  const apiPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let musicApiCheck;
  try {
    const response = await apiPage.request.get(new URL("/api/music", url).toString(), { timeout: timeoutMs });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A non-JSON response should be reported through the structured smoke result below.
    }
    musicApiCheck = {
      status: response.status(),
      hasTracksArray: Array.isArray(payload?.tracks),
      ok: response.ok() && Array.isArray(payload?.tracks),
    };
  } catch (error) {
    musicApiCheck = { status: 0, hasTracksArray: false, ok: false, error: String(error?.message || error) };
  } finally {
    await apiPage.close();
  }

  // When published listings exist, exercise a real card-to-detail navigation.
  // This is the regression test for the recurring "clicking a file does nothing" bug.
  const requirePropertySmoke = process.env.REQUIRE_PROPERTY_SMOKE === "1";
  const expectedPropertyId = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim() || "";
  const expectedPropertySlug = process.env.BROWSER_SMOKE_PROPERTY_SLUG?.trim() || "";
  const expectedPropertyTitle = process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() || "";
  const propertyNavigationCheck = {
    attempted: false,
    ok: true,
    href: null,
    hrefDecodedSlug: null,
    hrefMatchesExpectedSlug: true,
    status: null,
    bodyTextLen: 0,
    bodyContainsExpectedTitle: true,
    detailRendered: false,
    detailHeading: null,
    error: null,
    secondNavigationTested: false,
    secondNavigationOk: true,
    secondDetailHeading: null,
    secondGalleryCounter: null,
  };
  const propertyPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  /**
   * The file page is the only place `PropertyDetailView` mounts, and the
   * listing never renders that class — so this is what separates "the file
   * opened" from "the URL changed but the listing stayed". The old check only
   * looked at the URL plus body text, and the card carrying the property title
   * satisfies the title assertion on the listing, which is how a section-wide
   * routing dead end stayed green.
   */
  const readDetailState = async () => {
    await propertyPage
      .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 10_000 })
      .catch(() => undefined);
    return propertyPage.evaluate(() => {
      const root = document.querySelector(".property-detail-page");
      return {
        rendered: Boolean(root) && !root.classList.contains("property-detail-skeleton"),
        heading: root?.querySelector("h1")?.textContent?.trim() ?? "",
      };
    });
  };
  try {
    const propertiesUrl = new URL("/properties", url).toString();
    await propertyPage.goto(propertiesUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await propertyPage.waitForTimeout(500);
    const cards = propertyPage.locator('[data-property-link="true"]');
    if (await cards.count()) {
      const expectedPropertyId = expectedPropertySlug
        ? await cards.evaluateAll((elements, wantedSlug) => {
            for (const element of elements) {
              const href = element.getAttribute("href");
              if (!href) continue;
              const pathname = new URL(href, window.location.href).pathname;
              const slug = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
              if (slug === wantedSlug) return element.getAttribute("data-property-id");
            }
            return null;
          }, expectedPropertySlug)
        : null;
      const link = expectedPropertyId
        ? propertyPage.locator(`[data-property-link="true"][data-property-id="${expectedPropertyId}"]`).first()
        : cards.first();
      const href = await link.getAttribute("href").catch(() => null);
      propertyNavigationCheck.href = href;

      if (href) {
        propertyNavigationCheck.attempted = true;
        const propertyId = await link.getAttribute("data-property-id").catch(() => null);
        const propertiesUrl = new URL("/properties", url).toString();
        const canonicalUrl = new URL(href, propertiesUrl);
        const pathParts = canonicalUrl.pathname.split("/").filter(Boolean);
        const canonicalSlug = pathParts[pathParts.length - 1]
          ? decodeURIComponent(pathParts[pathParts.length - 1])
          : "";
        propertyNavigationCheck.hrefDecodedSlug = canonicalSlug;
        propertyNavigationCheck.hrefMatchesExpectedSlug =
          !expectedPropertySlug || canonicalSlug === expectedPropertySlug;

        await link.click();
        await propertyPage.waitForLoadState("domcontentloaded").catch(() => undefined);
        await propertyPage.waitForTimeout(500);
        propertyNavigationCheck.status = await propertyPage.evaluate(() => window.location.pathname);
        const textValue = await propertyPage.locator("body").innerText().catch(() => "");
        const normalizedText = normalizeBodyText(textValue);
        propertyNavigationCheck.bodyTextLen = normalizedText.length;
        propertyNavigationCheck.bodyContainsExpectedTitle =
          !expectedPropertyTitle || normalizedText.includes(normalizeBodyText(expectedPropertyTitle));
        const clickedDetail = await readDetailState();
        propertyNavigationCheck.detailRendered = clickedDetail.rendered;
        propertyNavigationCheck.detailHeading = clickedDetail.heading || null;
        const initialGallery = await propertyPage.evaluate(() => ({
          thumbCount: document.querySelectorAll(".property-gallery-rail .property-gallery-thumb").length,
          counter: document.querySelector(".property-gallery-counter")?.textContent?.trim() ?? "",
        }));
        propertyNavigationCheck.ok =
          propertyNavigationCheck.status.startsWith("/properties/") &&
          propertyNavigationCheck.status !== "/properties/" &&
          propertyNavigationCheck.bodyTextLen > 80 &&
          propertyNavigationCheck.hrefMatchesExpectedSlug &&
          propertyNavigationCheck.bodyContainsExpectedTitle &&
          propertyNavigationCheck.detailRendered &&
          initialGallery.thumbCount > 0;
        if (!initialGallery.thumbCount && propertyNavigationCheck.ok === false) {
          propertyNavigationCheck.error = "property detail gallery rendered without thumbnails";
        }
        if (!propertyNavigationCheck.ok && !propertyNavigationCheck.detailRendered) {
          propertyNavigationCheck.error = `detail view never mounted for ${propertyNavigationCheck.status}`;
        }

        if (propertyNavigationCheck.ok && (await cards.count()) > 1) {
          propertyNavigationCheck.secondNavigationTested = true;
          await propertyPage.goto(propertiesUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
          await propertyPage.waitForTimeout(400);
          const secondCard = cards.nth(1);
          const secondHref = await secondCard.getAttribute("href").catch(() => null);
          await secondCard.click();
          await propertyPage.waitForLoadState("domcontentloaded").catch(() => undefined);
          await propertyPage.waitForTimeout(500);
          const secondState = await readDetailState();
          const secondCounter = await propertyPage.evaluate(() =>
            document.querySelector(".property-gallery-counter")?.textContent?.trim() ?? "",
          );
          propertyNavigationCheck.secondDetailHeading = secondState.heading || null;
          propertyNavigationCheck.secondGalleryCounter = secondCounter || null;
          propertyNavigationCheck.secondNavigationOk =
            Boolean(secondHref) &&
            secondState.rendered &&
            Boolean(secondState.heading) &&
            (!secondCounter || secondCounter.includes("تصویر ۱ از"));
          if (!propertyNavigationCheck.secondNavigationOk) {
            propertyNavigationCheck.ok = false;
            propertyNavigationCheck.error =
              "second property navigation or gallery state check failed";
          }
        }

        // The optional second-card check navigates away from the primary
        // fixture. Restore the original detail URL before testing hard refresh;
        // otherwise the smoke compares the second URL against the first URL.
        if (propertyNavigationCheck.ok) {
          const currentPath = await propertyPage.evaluate(() => window.location.pathname);
          if (currentPath !== propertyNavigationCheck.status) {
            await propertyPage.goto(new URL(propertyNavigationCheck.status, url).toString(), {
              waitUntil: "domcontentloaded",
              timeout: timeoutMs,
            });
            await propertyPage.waitForTimeout(400);
            const primaryDetail = await readDetailState();
            const primaryHeadingMatches = !expectedPropertyTitle ||
              normalizeBodyText(primaryDetail.heading) === normalizeBodyText(expectedPropertyTitle);
            if (!primaryDetail.rendered || !primaryHeadingMatches) {
              propertyNavigationCheck.ok = false;
              propertyNavigationCheck.error =
                "primary detail URL did not restore the expected fixture after the second-card navigation";
            } else {
              propertyNavigationCheck.detailHeading = primaryDetail.heading;
            }
          }
        }

        if (propertyNavigationCheck.ok) {
          await propertyPage.reload({ waitUntil: "domcontentloaded" });
          const refreshPath = await propertyPage.evaluate(() => window.location.pathname);
          const refreshBody = normalizeBodyText(
            await propertyPage.locator("body").innerText().catch(() => ""),
          );
          const refreshDetail = await readDetailState();
          propertyNavigationCheck.detailRendered = refreshDetail.rendered;
          propertyNavigationCheck.detailHeading = refreshDetail.heading || null;
          propertyNavigationCheck.ok =
            refreshPath === propertyNavigationCheck.status &&
            refreshBody.length > 80 &&
            refreshDetail.rendered &&
            (!expectedPropertyTitle ||
              refreshBody.includes(normalizeBodyText(expectedPropertyTitle)));
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = refreshDetail.rendered
              ? `detail URL changed after a direct refresh: ${refreshPath}`
              : `detail view never mounted after a direct refresh of ${refreshPath}`;
          }
        }

        if (propertyNavigationCheck.ok && propertyId) {
          await propertyPage.goto(
            new URL("/file/" + encodeURIComponent(propertyId), url).toString(),
            { waitUntil: "domcontentloaded", timeout: timeoutMs },
          );
          await propertyPage.waitForTimeout(300);
          const legacyPath = await propertyPage.evaluate(() => window.location.pathname);
          const legacyDetail = await readDetailState();
          propertyNavigationCheck.ok =
            legacyPath.startsWith("/properties/") &&
            legacyPath !== "/properties/" &&
            legacyDetail.rendered;
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = legacyDetail.rendered
              ? `/file/:id did not land on a file page: ${legacyPath}`
              : `/file/:id landed on ${legacyPath} without the detail view`;
          }
        }

        if (propertyNavigationCheck.ok && propertyId) {
          await propertyPage.goto(
            new URL(
              "/v/" + encodeURIComponent(canonicalSlug) + "/" + encodeURIComponent(propertyId),
              url,
            ).toString(),
            { waitUntil: "domcontentloaded", timeout: timeoutMs },
          );
          await propertyPage.waitForTimeout(300);
          const legacyVPath = await propertyPage.evaluate(() => window.location.pathname);
          const legacyVDetail = await readDetailState();
          propertyNavigationCheck.ok =
            legacyVPath.startsWith("/properties/") &&
            legacyVPath !== "/properties/" &&
            legacyVDetail.rendered;
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = legacyVDetail.rendered
              ? `/v/:slug/:id did not land on a file page: ${legacyVPath}`
              : `/v/:slug/:id landed on ${legacyVPath} without the detail view`;
          }
        }

        if (propertyNavigationCheck.ok && expectedPropertyId && propertyId !== expectedPropertyId) {
          propertyNavigationCheck.ok = false;
          propertyNavigationCheck.error = `unexpected property id ${propertyId}; expected ${expectedPropertyId}`;
        }
      }
    } else if (requirePropertySmoke) {
      propertyNavigationCheck.ok = false;
      propertyNavigationCheck.error = "no published property card available in required smoke environment";
    }
  } catch (error) {
    propertyNavigationCheck.error = String(error?.message || error);
    propertyNavigationCheck.ok = false;
  } finally {
    await propertyPage.close();
  }

  const routeFailures = routeChecks.filter((item) => !item.ok);
  if (routeFailures.length) {
    viewports["desktop-1280"].pageErrors.push(
      ...routeFailures.map((item) => `route smoke failed: ${item.url} [${item.status}]`),
    );
  }
  if (!mapInteractionCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(
      `map interaction smoke failed: ${mapInteractionCheck.errors.join("; ") || "one or more assertions failed"}`,
    );
  }
  if (!musicApiCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(`music API smoke failed: [${musicApiCheck.status}]`);
  }
  if (!propertyNavigationCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(
      propertyNavigationCheck.attempted
        ? `property detail navigation smoke failed: ${propertyNavigationCheck.status || propertyNavigationCheck.error || "unknown"}` +
          (propertyNavigationCheck.error ? ` (${propertyNavigationCheck.error})` : "")
        : `property detail navigation smoke skipped: ${propertyNavigationCheck.error || "no published property card is available in this environment"}`,
    );
  }

  const brandWarnings = computeBrandWarnings({
    hasCanvas: viewports["desktop-1280"].hasCanvas,
    workspaceRoot: process.env.GITHUB_WORKSPACE ?? process.cwd(),
  });
  // Only a dev server answers /__app-env, so smoking the built output reads as
  // indeterminate — report a divergence, never the absence of an observation.
  const authWarnings = authInvariantWarnings(
    compareAuthInvariant({
      devAuthEnabled: await probeDevAuthEnabled(url),
      buildAuthEnabled: buildAuthEnabled(),
    }),
  );
  const verdict = { url, viewports, routeChecks, mapInteractionCheck, propertyNavigationCheck, musicApiCheck, brandWarnings, authWarnings, verdictFile: outJson };
  if (baselineRequested) {
    const { divergesFromBaseline, reasons } = compareAgainstBaseline(verdict);
    verdict.divergesFromBaseline = divergesFromBaseline;
    verdict.baselineReasons = reasons;
  }

  writeFileSync(outJson, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  for (const w of [...brandWarnings, ...authWarnings]) console.error(w);
  // Set the code rather than aborting the process so the `finally` browser
  // teardown always runs (agents typically smoke twice per turn; leaking
  // Chromium accumulates across retries).
  process.exitCode = exitCodeFor(viewports);
} catch (err) {
  const failure = { ok: false, url, error: String(err?.message || err) };
  try {
    writeFileSync(outJson, JSON.stringify(failure, null, 2));
  } catch (writeErr) {
    failure.verdictWriteError = String(writeErr?.message || writeErr);
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}