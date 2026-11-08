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

async function openAndExpectFixture(url, label) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const mapButton = page.getByRole("button", { name: "نمایش فایل‌ها روی نقشه" });
  await mapButton.waitFor({ state: "visible", timeout: timeoutMs });
  // `domcontentloaded` can precede React hydration on a cold CI runner. Wait
  // for the actual click handler instead of allowing a pre-hydration click to
  // be swallowed by the server-rendered button.
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="نمایش فایل‌ها روی نقشه"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
    return Boolean(propsKey && typeof button[propsKey]?.onClick === "function");
  }, null, { timeout: timeoutMs });
  await mapButton.click();
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="نمایش فایل‌ها روی نقشه"]')?.getAttribute("aria-pressed") === "true",
    null,
    { timeout: timeoutMs },
  );
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
  const invalidMapButton = invalid.getByRole("button", { name: "نمایش فایل‌ها روی نقشه" });
  await invalidMapButton.waitFor({ state: "visible", timeout: timeoutMs });
  await invalid.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="نمایش فایل‌ها روی نقشه"]');
    const propsKey = button ? Object.keys(button).find((key) => key.startsWith("__reactProps$")) : undefined;
    return Boolean(propsKey && typeof button[propsKey]?.onClick === "function");
  }, null, { timeout: timeoutMs });
  await invalidMapButton.click();
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
  const emptyMapButton = empty.getByRole("button", { name: "نمایش فایل‌ها روی نقشه" });
  await emptyMapButton.waitFor({ state: "visible", timeout: timeoutMs });
  await empty.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="نمایش فایل‌ها روی نقشه"]');
    const propsKey = button ? Object.keys(button).find((key) => key.startsWith("__reactProps$")) : undefined;
    return Boolean(propsKey && typeof button[propsKey]?.onClick === "function");
  }, null, { timeout: timeoutMs });
  await emptyMapButton.click();
  await empty.waitForFunction(() => {
    const status = document.querySelector(".pf-map-list-empty");
    return Boolean(status && /پیدا نشد/.test(status.textContent || ""));
  }, null, { timeout: timeoutMs });
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
