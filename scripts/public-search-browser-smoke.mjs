import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? process.argv[2];
assert.ok(baseUrl, "QA_BASE_URL is required; run through test:public-search-browser");

function readPersianCount(value) {
  const digits = String(value).replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  return Number(digits.match(/\d+/)?.[0] ?? NaN);
}

async function visibleCardCount(page) {
  return page.locator(".property-grid .pcard").count();
}

async function collectUniqueCardLinks(page) {
  return page.locator(".property-grid .pcard").evaluateAll((cards) => cards.map((card) => card.querySelector("a[href*='/properties/']")?.getAttribute("href") ?? ""));
}

const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch {
  browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
}
try {
  const context = await browser.newContext({ locale: "fa-IR" });
  await context.grantPermissions(["geolocation"], { origin: baseUrl });
  await context.setGeolocation({ latitude: 32.65, longitude: 51.67 });

  const searchPage = await context.newPage();
  const searchErrors = [];
  searchPage.on("pageerror", (error) => searchErrors.push(error.message));
  await searchPage.goto(new URL("/smart-search", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await searchPage.getByRole("textbox", { name: "جستجوی فارسی ملک" }).fill("آپارتمان");
  await searchPage.getByRole("button", { name: "جستجوی هوشمند" }).click();
  const searchHeading = searchPage.locator(".smart-search-result-head h2").first();
  await searchHeading.waitFor({ state: "visible" });
  await searchPage.waitForFunction(() => document.querySelector(".smart-search-result-head h2")?.textContent?.includes("۴۸"));
  assert.equal(readPersianCount(await searchHeading.textContent()), 48, "smart search must show the first 48 results");
  assert.equal(await visibleCardCount(searchPage), 48, "the first smart-search page must render 48 real property cards");
  assert.equal(await searchPage.getByRole("button", { name: "نمایش فایل‌های بیشتر" }).count(), 1, "smart search must expose a next-page action");
  await searchPage.getByRole("button", { name: "نمایش فایل‌های بیشتر" }).click();
  await searchPage.waitForFunction(() => document.querySelector(".smart-search-result-head h2")?.textContent?.includes("۵۰"));
  assert.equal(readPersianCount(await searchHeading.textContent()), 50, "smart search must append the final two results");
  assert.equal(await visibleCardCount(searchPage), 50, "smart search must render all 50 matching fixture cards");
  assert.equal(await searchPage.getByRole("button", { name: "نمایش فایل‌های بیشتر" }).count(), 0, "the next-page action must disappear after the final page");
  const searchLinks = await collectUniqueCardLinks(searchPage);
  assert.equal(new Set(searchLinks).size, 50, "smart-search pagination must not duplicate property cards");

  const nearbyPage = await context.newPage();
  const nearbyErrors = [];
  nearbyPage.on("pageerror", (error) => nearbyErrors.push(error.message));
  await nearbyPage.goto(new URL("/nearby", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await nearbyPage.getByRole("button", { name: "پیدا کردن موقعیت من" }).click();
  await nearbyPage.getByRole("status").filter({ hasText: "موقعیت فعال شد" }).waitFor({ state: "visible" });
  const nearbyHeading = nearbyPage.locator(".smart-search-result-head h2").first();
  await nearbyHeading.waitFor({ state: "visible" });
  assert.equal(await visibleCardCount(nearbyPage), 48, "nearby must render its first 48 coordinate-backed property cards");
  assert.equal(await nearbyPage.getByRole("button", { name: "بارگذاری فایل‌های بیشتر" }).count(), 1, "nearby must expose incremental loading beyond the first page");

  let pagesLoaded = 1;
  while (await nearbyPage.getByRole("button", { name: /بارگذاری فایل‌های بیشتر|تلاش دوباره برای بارگذاری/ }).count()) {
    assert.ok(pagesLoaded < 8, "nearby pagination must finish within the fixture's five pages");
    await nearbyPage.getByRole("button", { name: /بارگذاری فایل‌های بیشتر|تلاش دوباره برای بارگذاری/ }).click();
    pagesLoaded += 1;
    await nearbyPage.waitForFunction((expected) => document.querySelectorAll(".property-grid .pcard").length === expected, pagesLoaded * 48 > 205 ? 205 : pagesLoaded * 48);
  }
  assert.equal(await visibleCardCount(nearbyPage), 205, "nearby must load all 205 coordinate-backed properties");
  assert.equal(readPersianCount(await nearbyHeading.textContent()), 205, "nearby count must reflect the loaded property set");
  const nearbyLinks = await collectUniqueCardLinks(nearbyPage);
  assert.equal(new Set(nearbyLinks).size, 205, "nearby pagination must not duplicate property cards");
  assert.equal(await nearbyPage.getByRole("status").filter({ hasText: "موقعیت فعال شد" }).count(), 1, "geolocation success must be announced accessibly");

  assert.deepEqual(searchErrors, [], "smart-search browser workflow must not produce page errors");
  assert.deepEqual(nearbyErrors, [], "nearby browser workflow must not produce page errors");
  console.log("[public-search-browser] PASS: smart search loaded 50/50 unique results; nearby loaded 205/205 unique geolocated results across real pages.");
} finally {
  await browser.close();
}
