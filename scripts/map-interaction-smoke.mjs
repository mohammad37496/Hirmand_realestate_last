#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { parseCoordinateBounds, isValidCoordinateBounds } from "../src/lib/map-geometry.ts";

const base = (process.argv[2] || "http://127.0.0.1:8081").replace(/\/+$/, "");
const expectedTitle = process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() || "فایل تست ناوبری جزئیات هیرمند";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const failures = [];
const checks = [];

function check(name, ok, details = undefined) {
  checks.push({ name, ok, ...(details === undefined ? {} : { details }) });
  if (!ok) failures.push(name);
}

async function waitForSearch(page) {
  await page.waitForTimeout(450);
  await page.waitForFunction(
    () => !document.querySelector(".pf-count em"),
    { timeout: 10_000 },
  );
}

async function selectNeighborhood(page, name) {
  await page.locator(".pf-neighborhood-trigger").click();
  const search = page.locator('input[aria-label="جست‌وجوی محله‌ها"]');
  await search.fill(name);
  const option = page.locator(".pf-neighborhood-dialog-results button").filter({ hasText: name }).first();
  await option.waitFor({ state: "visible", timeout: 8_000 });
  await option.click();
  await page.waitForFunction(
    () => new URLSearchParams(window.location.search).has("map_bbox") ||
      new URLSearchParams(window.location.search).has("bbox"),
    { timeout: 8_000 },
  );
  await waitForSearch(page);
}

async function readUrlState(page) {
  return page.evaluate(() => {
    const params = new URLSearchParams(window.location.search);
    const readNumber = (key) => {
      const value = params.get(key);
      if (value == null || value.trim() === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      href: window.location.href,
      neighborhood: params.get("neighborhood"),
      transaction: params.get("transaction"),
      type: params.get("type"),
      minArea: readNumber("minArea"),
      maxPrice: readNumber("maxPrice"),
      mapBounds: params.get("map_bbox") || params.get("bbox"),
    };
  });
}

async function fixtureVisible(page) {
  const row = page.locator(".pf-map-card-row").filter({ hasText: expectedTitle }).first();
  return row.isVisible().catch(() => false);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));

  let response = await page.goto(base + "/properties", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  check("desktop property map route returns 2xx", Boolean(response && response.status() >= 200 && response.status() < 300), response?.status());
  await page.locator(".pf-neighborhood-trigger").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: 15_000 });

  // 1. Select a real catalog neighborhood and confirm its matching, geocoded fixture.
  await selectNeighborhood(page, "مرداویج");
  let state = await readUrlState(page);
  let bounds = parseCoordinateBounds(state.mapBounds);
  check("choosing Mardavij restores neighborhood filter and valid map_bbox", state.neighborhood === "مرداویج" && isValidCoordinateBounds(bounds), state);
  check("property in selected neighborhood and viewport is shown", await fixtureVisible(page));

  // 2. Refresh must rebuild the same neighborhood and viewport from the URL.
  const beforeReloadBounds = bounds;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await waitForSearch(page);
  state = await readUrlState(page);
  bounds = parseCoordinateBounds(state.mapBounds);
  const restoredApproximately =
    isValidCoordinateBounds(bounds) &&
    beforeReloadBounds?.every((value, index) => Math.abs(value - bounds[index]) < 0.0002);
  check("refresh restores the same saved viewport within projection rounding", state.neighborhood === "مرداویج" && restoredApproximately, state);
  check("matching geocoded property remains visible after refresh", await fixtureVisible(page));

  // 3. Apply transaction, property type, area and price together with map bounds.
  const transactionGroup = page.locator(".pf-filter-primary .pf-group").filter({ hasText: "نوع معامله" });
  await transactionGroup.getByRole("button", { name: "فروش", exact: true }).click();
  const typeGroup = page.locator(".pf-filter-primary .pf-group").filter({ hasText: "نوع ملک" });
  await typeGroup.getByRole("button", { name: "آپارتمان", exact: true }).click();
  const ranges = page.locator(".pf-compact-ranges .pf-group");
  await ranges.filter({ hasText: "متراژ" }).locator("input").first().fill("100");
  await ranges.filter({ hasText: "قیمت" }).locator("input").last().fill("13000000000");
  await waitForSearch(page);
  state = await readUrlState(page);
  bounds = parseCoordinateBounds(state.mapBounds);
  check(
    "map bounds combine with sale, apartment, minimum area, and maximum price",
    state.neighborhood === "مرداویج" && state.transaction === "sell" && state.type === "apartment" &&
      state.minArea === 100 && state.maxPrice === 13_000_000_000 && isValidCoordinateBounds(bounds),
    state,
  );
  check("combined filters retain the matching property", await fixtureVisible(page));

  // A restrictive price ceiling must produce a legitimate empty result, not a stale cached row.
  await ranges.filter({ hasText: "قیمت" }).locator("input").last().fill("1000000000");
  await waitForSearch(page);
  const restrictiveRowVisible = await fixtureVisible(page);
  const emptyNoteVisible = await page.locator(".pf-map-list-empty").isVisible().catch(() => false);
  check("restrictive combined filter hides the non-matching property and shows empty-state feedback", !restrictiveRowVisible && emptyNoteVisible);

  // Restore the price and exercise zoom, which changes the viewport query.
  await ranges.filter({ hasText: "قیمت" }).locator("input").last().fill("13000000000");
  await waitForSearch(page);
  const beforeZoom = parseCoordinateBounds((await readUrlState(page)).mapBounds);
  await page.getByRole("button", { name: "بزرگ‌نمایی نقشه" }).click();
  await page.waitForFunction(() => Boolean(new URLSearchParams(window.location.search).get("map_bbox")), { timeout: 8_000 });
  await waitForSearch(page);
  const afterZoom = parseCoordinateBounds((await readUrlState(page)).mapBounds);
  check(
    "zoom updates valid URL viewport bounds",
    isValidCoordinateBounds(afterZoom) && isValidCoordinateBounds(beforeZoom) &&
      afterZoom.some((value, index) => Math.abs(value - beforeZoom[index]) > 0.000001),
  );

  // Marker selection should be keyboard/touch-operable and linked to the list row.
  const marker = page.locator(".pf-map-marker").first();
  const markerExists = await marker.count().then((count) => count > 0);
  if (markerExists) {
    await marker.click();
    await page.waitForTimeout(100);
    const activeRowCount = await page.locator(".pf-map-card-row.is-active").count();
    check("map marker selection activates the corresponding list row", activeRowCount > 0);
  } else {
    check("map marker selection activates the corresponding list row", false, "No valid map marker was rendered for the fixture.");
  }

  // Clear property filters deliberately preserves the current map viewport by design.
  const clearAll = page.getByRole("button", { name: "پاک‌کردن همه", exact: true });
  if (await clearAll.count()) await clearAll.click();
  await waitForSearch(page);
  state = await readUrlState(page);
  bounds = parseCoordinateBounds(state.mapBounds);
  check(
    "reset clears neighborhood and ordinary filters but preserves the current map viewport",
    !state.neighborhood && !state.transaction && !state.type && state.minArea == null && state.maxPrice == null &&
      isValidCoordinateBounds(bounds),
    state,
  );

  // All neighborhoods removes the exact district filter while retaining the chosen viewport.
  await page.locator(".pf-neighborhood-trigger").click();
  await page.locator(".pf-neighborhood-dialog-toolbar").getByRole("button", { name: "همهٔ محله‌ها", exact: true }).click();
  await waitForSearch(page);
  state = await readUrlState(page);
  bounds = parseCoordinateBounds(state.mapBounds);
  check("All neighborhoods clears the neighborhood filter without corrupting map bounds", !state.neighborhood && isValidCoordinateBounds(bounds), state);

  // 4. Invalid URL bounds must fail closed and never remain as bad query parameters.
  const invalidPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const invalidErrors = [];
  invalidPage.on("pageerror", (error) => invalidErrors.push(String(error?.message || error)));
  response = await invalidPage.goto(
    base + "/properties?map_bbox=999,999,1000,1000&bbox=51.8,32.7,51.6,32.5",
    { waitUntil: "domcontentloaded", timeout: 45_000 },
  );
  await invalidPage.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await waitForSearch(invalidPage);
  const invalidState = await readUrlState(invalidPage);
  const invalidBounds = parseCoordinateBounds(invalidState.mapBounds);
  check("invalid URL coordinates are rejected and app remains usable", Boolean(response && response.status() < 400) && isValidCoordinateBounds(invalidBounds) && invalidErrors.length === 0, { state: invalidState, errors: invalidErrors });
  await invalidPage.close();

  // 5. Responsive mobile check, including touch-style zoom control and URL round trip.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(String(error?.message || error)));
  response = await mobile.goto(base + "/properties?neighborhood=" + encodeURIComponent("مرداویج"), {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await mobile.locator(".pf-map-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await waitForSearch(mobile);
  const mobileLayout = await mobile.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check("mobile map displays without horizontal page overflow", Boolean(response && response.status() < 400) && mobileLayout.scrollWidth <= mobileLayout.clientWidth + 1, mobileLayout);
  const mobileBefore = parseCoordinateBounds((await readUrlState(mobile)).mapBounds);
  await mobile.getByRole("button", { name: "بزرگ‌نمایی نقشه" }).tap();
  await mobile.waitForTimeout(450);
  const mobileAfter = parseCoordinateBounds((await readUrlState(mobile)).mapBounds);
  check("mobile map zoom/tap updates a valid viewport", isValidCoordinateBounds(mobileBefore) && isValidCoordinateBounds(mobileAfter) && mobileAfter.some((value, index) => Math.abs(value - mobileBefore[index]) > 0.000001), { mobileBefore, mobileAfter });
  check("desktop and mobile map interactions raised no uncaught client errors", pageErrors.length === 0 && mobileErrors.length === 0, [...pageErrors, ...mobileErrors]);

  await mobile.close();
  await page.close();
} catch (error) {
  failures.push("unexpected map interaction smoke exception");
  checks.push({
    name: "unexpected map interaction smoke exception",
    ok: false,
    details: String(error?.stack || error?.message || error),
  });
} finally {
  await browser.close();
}

const result = { ok: failures.length === 0, checks, failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
