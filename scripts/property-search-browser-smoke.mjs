#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.PROPERTY_SEARCH_SMOKE_BASE_URL ?? "http://127.0.0.1:8081";
const title = process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() || "فایل تست ناوبری جزئیات هیرمند";
const timeoutMs = Number(process.env.PROPERTY_SEARCH_SMOKE_TIMEOUT_MS || 25_000);
const expectedFilterKeys = [
  "transaction", "type", "neighborhood", "q", "minArea", "maxArea",
  "minPrice", "maxPrice", "bedrooms",
];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const problems = [];
const pageErrors = [];

function searchUrl() {
  const url = new URL("/properties", baseUrl);
  url.search = new URLSearchParams({
    transaction: "sell",
    type: "apartment",
    neighborhood: "مرکز شهر",
    q: "خیابان تست",
    minArea: "120",
    maxArea: "130",
    minPrice: "12000000000",
    maxPrice: "13000000000",
    bedrooms: "2",
  }).toString();
  return url.toString();
}

async function openMapView(page) {
  const mapButton = page.locator(".pf-views button").nth(2);
  await mapButton.waitFor({ state: "visible", timeout: timeoutMs });
  await mapButton.click();
  const map = page.locator(".pf-map-divar-layout");
  try {
    await map.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    // A server-rendered button can appear before its React handler is attached.
    // Clicking the already-selected map button again is safe and avoids a
    // timing-dependent failure on cold CI browsers.
    await mapButton.click();
    await map.waitFor({ state: "visible", timeout: timeoutMs });
  }
}

async function openAndExpectFixture(url, label) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openMapView(page);
  const itemTitle = page.locator(".pf-map-item-copy strong").filter({ hasText: title }).first();
  await itemTitle.waitFor({ state: "visible", timeout: timeoutMs });
  assert.equal((await itemTitle.innerText()).trim(), title, `${label}: expected the controlled fixture to match`);
  return page;
}

try {
  // A full deep link applies several independent filters at first load, not only
  // after clicking controls in a previously hydrated page.
  const firstUrl = searchUrl();
  const first = await openAndExpectFixture(firstUrl, "filtered deep link");
  const canonicalUrl = new URL(first.url());
  for (const key of expectedFilterKeys) {
    assert.equal(canonicalUrl.searchParams.get(key), new URL(firstUrl).searchParams.get(key), `URL should preserve ${key}`);
  }
  console.log("[property-search-smoke] combined filters matched controlled fixture");

  // Opening the current shared URL in a separate tab must reconstruct the same
  // filter state and result set.
  const second = await openAndExpectFixture(first.url(), "reopened shared URL");
  console.log("[property-search-smoke] shared URL restored filters in a fresh page");

  // Clearing filter chips must drop the textual, transaction, property, price,
  // area and room filters from the query string and stop constraining by them.
  const clearAll = first.locator(".pf-filter-overview").getByRole("button", { name: /پاک.?کردن همه/ }).first();
  await clearAll.waitFor({ state: "visible", timeout: timeoutMs });
  await clearAll.click();
  await first.waitForFunction(() => {
    const params = new URLSearchParams(window.location.search);
    return !["transaction", "type", "neighborhood", "q", "minArea", "maxArea", "minPrice", "maxPrice", "bedrooms"].some((key) => params.has(key));
  }, null, { timeout: timeoutMs });
  await first.locator(".pf-map-item-copy strong").filter({ hasText: title }).first().waitFor({ state: "visible", timeout: timeoutMs });
  console.log("[property-search-smoke] clear-all removed the active non-map filters");

  // Invalid bounds must show validation feedback and not leak a stale match.
  const invalid = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await invalid.goto(new URL("/properties?minArea=-1", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openMapView(invalid);
  const validation = invalid.locator(".pf-filter-validation-error");
  await validation.waitFor({ state: "visible", timeout: timeoutMs });
  assert.match(await validation.innerText(), /حداقل متراژ/);
  assert.equal(await invalid.locator(".pf-map-item-copy strong").filter({ hasText: title }).count(), 0);
  console.log("[property-search-smoke] invalid numeric input was rejected without stale results");

  // Controlled no-match query should reach the explicit empty-results state.
  const empty = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const emptyUrl = new URL("/properties", baseUrl);
  emptyUrl.searchParams.set("q", "عبارت-آزمایشی-بدون-نتیجه-۷۸۹۱۲۳");
  await empty.goto(emptyUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openMapView(empty);
  await empty.locator(".pf-map-list-empty").waitFor({ state: "visible", timeout: timeoutMs });
  assert.match(await empty.locator(".pf-map-list-empty").innerText(), /پیدا نشد/);
  assert.equal(await empty.locator(".pf-map-item-copy strong").filter({ hasText: title }).count(), 0);
  console.log("[property-search-smoke] no-match query rendered the empty-results state");

  if (pageErrors.length) problems.push(...pageErrors);
  await Promise.all([first.close(), second.close(), invalid.close(), empty.close()]);
} catch (error) {
  problems.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
}

if (problems.length) {
  console.error("[property-search-smoke] FAILED");
  problems.forEach((problem) => console.error(problem));
  process.exitCode = 1;
} else {
  console.log("[property-search-smoke] PASS");
}
