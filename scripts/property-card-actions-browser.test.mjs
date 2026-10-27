#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl =
  process.env.PROPERTY_CARD_BROWSER_BASE_URL || "http://127.0.0.1:8080";
const isLocalApp = ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
assert.ok(
  isLocalApp,
  "property-card action QA must target the isolated local app; use npm run test:property-card-browser to start its PGlite fixtures",
);
const timeoutMs = Number(
  process.env.PROPERTY_CARD_BROWSER_TIMEOUT_MS || 30_000,
);
const screenshotDir = process.env.PROPERTY_CARD_BROWSER_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
let compiledCardCss;
if (!isLocalApp) {
  const builtAssets = await readdir(new URL("../.output/public/assets/", import.meta.url));
  const builtCssName = builtAssets.find((name) => /^properties-mobile-reference-.*\.css$/.test(name));
  assert.ok(builtCssName, "run the production build before remote-site CSS QA");
  compiledCardCss = await readFile(new URL(`../.output/public/assets/${builtCssName}`, import.meta.url), "utf8");
}
console.log(`[property-card-browser] app=${baseUrl}; app/data=${isLocalApp ? "local Vite app + isolated PGlite fixture" : new URL(baseUrl).origin}; card CSS=${isLocalApp ? "served by local app" : "local production build injected into live app"}`);

let browser;
const pageErrors = [];
const hydrationErrors = [];

try {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  try {
    browser = await chromium.launch(launchOptions);
  } catch {
    // Prefer Playwright's pinned Chromium when provisioned; use installed Chrome
    // as the local fallback without adding another browser dependency.
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const serverResponse = await context.request.get(
    new URL("/properties", baseUrl).toString(),
    { timeout: timeoutMs },
  );
  assert.equal(
    serverResponse.status(),
    200,
    "SSR request should load the home page",
  );
  const serverHtml = await serverResponse.text();
  assert.doesNotMatch(
    serverHtml,
    /class="pcard-actions"/,
    "server HTML must not emit operation controls before viewport detection",
  );
  await context.addInitScript(() => {
    window.__propertyActionCalls = {
      shares: [], clipboard: [], prints: 0,
      allowNativeShare: true,
    };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      get: () => window.__propertyActionCalls.allowNativeShare ? async (payload) => {
        const files = await Promise.all((payload.files ?? []).map(async (file) => {
          const signature = [...new Uint8Array(await file.slice(0, 8).arrayBuffer())];
          const bitmap = await createImageBitmap(file);
          const width = bitmap.width;
          const height = bitmap.height;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let inkPixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0 && (pixels[index] < 235 || pixels[index + 1] < 235 || pixels[index + 2] < 235)) inkPixels += 1;
          }
          return { name: file.name, type: file.type, size: file.size, signature, width, height, inkPixels };
        }));
        window.__propertyActionCalls.shares.push({
          title: payload.title,
          text: payload.text,
          url: payload.url,
          files,
        });
      } : undefined,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__propertyActionCalls.clipboard.push(value);
        },
      },
    });
    window.print = () => {
      window.__propertyActionCalls.prints += 1;
    };
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Keep QR image assertions deterministic and independent of the external QR
  // provider's uptime; the test still verifies the real URL and encoded data.
  await page.route("https://api.qrserver.com/v1/create-qr-code/**", async (route) => {
    const size = new URL(route.request().url()).searchParams.get("size") === "1200x1200" ? 1200 : 360;
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/><path d="M10 10h${Math.max(10, size - 20)}v${Math.max(10, size - 20)}H10Z" fill="black"/></svg>`,
    });
  });
  if (!isLocalApp) {
    await page.route("**/assets/properties-mobile-reference-*.css", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: compiledCardCss });
    });
  }
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|server rendered html|did not match/i.test(
        message.text(),
      )
    ) {
      hydrationErrors.push(message.text());
    }
  });

  const response = await page.goto(new URL("/properties", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  assert.equal(response?.status(), 200, "home page should load successfully");
  const cards = page.locator("article.pcard");
  await cards.first().waitFor({ state: "visible", timeout: timeoutMs });
  // The listing defaults to list mode on narrow screens. Verify that switching
  // to grid preserves the full action set rather than removing tools from DOM.
  await page.waitForFunction(
    () => document.querySelector(".pf-grid")?.classList.contains("is-list-view") === true,
    null,
    { timeout: timeoutMs },
  );
  const mobileGridToggle = page.locator(".pf-views button").nth(1);
  // The initial HTML is server-rendered in list mode; the first click can land
  // before React has hydrated. Retry briefly against the real pressed state
  // instead of waiting 30 seconds for a click that could not be handled.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await mobileGridToggle.click();
    try {
      await page.waitForFunction(
        () => document.querySelector(".pf-grid")?.classList.contains("is-list-view") === false &&
          document.querySelectorAll(".pf-views button")[1]?.getAttribute("aria-pressed") === "true",
        null,
        { timeout: 1500 },
      );
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.waitForTimeout(250);
    }
  }
  await page.waitForTimeout(800);

  // Mobile: check the actual hydrated DOM and the touch geometry, not just CSS visibility.
  assert.equal(
    (await cards.count()) > 0,
    true,
    "the page should render property cards for the browser test",
  );
  const fixturePaths = await cards.locator(".pcard-link").evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
  for (const fixtureSlug of ["qa-apartment-long-title", "qa-rent-villa", "qa-office"]) {
    assert.ok(fixturePaths.some((path) => path.endsWith(`/properties/${fixtureSlug}`)), `local app must render the controlled PGlite fixture ${fixtureSlug}, not arbitrary site data`);
  }
  const fixtureTitles = await cards.locator(".pcard-title").allInnerTexts();
  assert.ok(fixtureTitles.some((title) => title.includes("آپارتمان")), "the long Persian RTL fixture title must survive database seeding and app rendering");
  assert.equal(await page.locator("article.pcard .pcard-actions").count(), await cards.count(),
    "every mobile grid card must render an action rail");
  assert.equal(await page.locator("article.pcard .property-action").count(), await cards.count() * 8,
    "every mobile grid card must retain all eight operations in the DOM");
  assert.equal(await page.locator("article.pcard .property-actions-compact").count(), await cards.count(),
    "every mobile grid card must mount the compact action component");
  const mobileActionGeometry = await cards.first().locator(".pcard-actions .property-action").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { label: button.getAttribute("aria-label"), width: rect.width, height: rect.height };
  }));
  assert.equal(mobileActionGeometry.length, 8, "mobile grid must expose all eight operations");
  assert.ok(mobileActionGeometry.every((button) => button.width >= 44 && button.height >= 44),
    `mobile grid actions must have 44px touch targets: ${JSON.stringify(mobileActionGeometry)}`);
  const mobileFavorite = cards.first().locator(".pcard-actions .property-action").first();
  await mobileFavorite.click();
  await page.waitForFunction((button) => button.getAttribute("aria-pressed") === "true", await mobileFavorite.elementHandle(), { timeout: timeoutMs });
  await mobileFavorite.click();
  await page.waitForFunction((button) => button.getAttribute("aria-pressed") === "false", await mobileFavorite.elementHandle(), { timeout: timeoutMs });
  console.log(`[property-card-browser] mobile 390px grid: ${await cards.count()} cards; 8 actions/card; all targets >=44px; favorite toggles`);

  // Merely opening the map must not make its default viewport an implicit
  // location filter. Switching back to the list restores the unfiltered cards.
  const mapUrlBefore = new URL(page.url());
  assert.equal(mapUrlBefore.searchParams.has("bbox") || mapUrlBefore.searchParams.has("map_bbox"), false,
    "the initial listing URL must not contain a map viewport filter");
  await page.locator(".pf-views button").nth(2).click();
  const mapWorkspace = page.locator(".pf-map-divar-layout");
  await mapWorkspace.waitFor({ state: "attached", timeout: timeoutMs });
  await page.locator(".pf-views button").nth(0).click();
  await mapWorkspace.waitFor({ state: "detached", timeout: timeoutMs });
  await page.waitForFunction(() => document.querySelectorAll(".pf-grid > .pcard").length === 3, null, { timeout: timeoutMs });
  const mapUrlAfter = new URL(page.url());
  assert.equal(mapUrlAfter.searchParams.has("bbox") || mapUrlAfter.searchParams.has("map_bbox"), false,
    "opening and closing the default map must not leave an accidental bbox filter in the URL");
  console.log("[property-card-browser] map → list: default map viewport does not filter or hide the three published cards");

  // Cross the exact breakpoint and wait for the effect-driven mount.
  await page.setViewportSize({ width: 1280, height: 800 });
  const rails = page.locator("article.pcard .pcard-actions");
  await rails.first().waitFor({ state: "attached", timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const cardsNow = [...document.querySelectorAll("article.pcard")];
      return (
        cardsNow.length > 0 &&
        cardsNow.every(
          (card) =>
            card.querySelectorAll(".pcard-actions .property-action").length ===
            8,
        )
      );
    },
    null,
    { timeout: timeoutMs },
  );

  const firstCard = cards.first();
  // Each card intentionally has separate media and copy links. Select the
  // media link for the property identity instead of asking Playwright to
  // resolve the shared `.pcard-link` class as if it were unique.
  const firstPropertyPath = new URL(await firstCard.locator(":scope > .pcard-visual > .pcard-media-link").getAttribute("href"), baseUrl).pathname;
  const firstPropertySlug = decodeURIComponent(firstPropertyPath.split("/").pop() || "");
  const firstPropertyNeighborhood = await firstCard.locator(".pcard-location").innerText();
  const actionButtons = firstCard.locator(".pcard-actions .property-action");
  assert.equal(
    await actionButtons.count(),
    8,
    "desktop card should expose all eight actions",
  );
  for (let index = 0; index < 8; index += 1) {
    assert.ok(
      (await actionButtons.nth(index).getAttribute("aria-label"))?.trim(),
      `desktop action ${index + 1} should have an accessible name`,
    );
  }
  await actionButtons.nth(0).focus();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), await actionButtons.nth(0).getAttribute("aria-label"), "keyboard focus must reach the first action in the footer");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), await actionButtons.nth(1).getAttribute("aria-label"), "Tab order must follow the visual action order without jumping into the property link");
  console.log(
    `[property-card-browser] desktop 1280px: all ${await cards.count()} cards expose eight named actions`,
  );

  // Exercise the action handlers, including stateful actions and portal dialogs.
  const favorite = actionButtons.nth(0);
  await favorite.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "true",
    await favorite.elementHandle(),
    { timeout: timeoutMs },
  );

  await actionButtons.nth(1).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.shares.length === 1,
    null,
    { timeout: timeoutMs },
  );
  const nativeShare = await page.evaluate(() => window.__propertyActionCalls.shares[0]);
  assert.equal(nativeShare.title, await firstCard.locator(".pcard-title").innerText(), "share payload title must match the selected property");
  assert.ok(nativeShare.text.includes(nativeShare.title), "native share text must describe the selected property");
  assert.ok(nativeShare.url.endsWith(firstPropertyPath), "native share payload must link to the selected property's actual detail route");
  await page.evaluate(() => { window.__propertyActionCalls.allowNativeShare = false; });
  await actionButtons.nth(1).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.clipboard.length === 1,
    null,
    { timeout: timeoutMs },
  );
  assert.equal(await page.evaluate(() => window.__propertyActionCalls.clipboard[0]), nativeShare.url, "share fallback must copy the exact property URL");
  await page.evaluate(() => { window.__propertyActionCalls.allowNativeShare = true; });

  await actionButtons.nth(2).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.shares.length === 2,
    null,
    { timeout: timeoutMs },
  );
  const shareCardPayload = await page.evaluate(() => window.__propertyActionCalls.shares[1]);
  assert.equal(shareCardPayload.title, nativeShare.title, "intro-card share title must match the property");
  assert.ok(Array.isArray(shareCardPayload.files) && shareCardPayload.files.length === 1, "intro-card action must generate a shareable file");
  assert.equal(shareCardPayload.files[0].type, "image/png", "intro-card output must be a PNG image");
  assert.ok(shareCardPayload.files[0].size > 100, "intro-card output must contain actual image bytes");
  assert.equal(shareCardPayload.files[0].name, "hirmand-property-card.png", "intro-card output must use the intended downloadable filename");
  assert.deepEqual(shareCardPayload.files[0].signature, [137, 80, 78, 71, 13, 10, 26, 10], "intro-card bytes must have a valid PNG signature");
  assert.ok(shareCardPayload.files[0].width >= 600 && shareCardPayload.files[0].height >= 300, "intro-card PNG must have usable dimensions");
  assert.ok(shareCardPayload.files[0].inkPixels > 100, "intro-card PNG must contain rendered artwork/text, not a blank image");

  await actionButtons.nth(3).click();
  const qrDialog = page.locator(".property-qr-dialog[role='dialog']");
  await qrDialog.waitFor({ state: "visible", timeout: timeoutMs });
  const qrImage = qrDialog.locator("img");
  await qrImage.waitFor({ state: "visible", timeout: timeoutMs });
  const qrImageUrl = new URL(await qrImage.getAttribute("src"));
  assert.equal(qrImageUrl.origin, "https://api.qrserver.com", "QR image should use the configured QR generation service");
  assert.equal(qrImageUrl.pathname, "/v1/create-qr-code/", "QR image should use the QR generation endpoint");
  assert.match(qrImageUrl.searchParams.get("data") || "", /^https?:\/\//, "QR code payload must encode an absolute property URL");
  const qrDownload = qrDialog.locator("a[href*='api.qrserver.com']");
  assert.equal(await qrDownload.count(), 1, "QR dialog should provide a high-resolution QR download");
  assert.equal(new URL(await qrDownload.getAttribute("href")).searchParams.get("data"), qrImageUrl.searchParams.get("data"), "QR download and preview must encode the same property URL");
  assert.equal(new URL(await qrDownload.getAttribute("href")).searchParams.get("size"), "1200x1200", "QR download must request the high-resolution output");
  assert.equal(await page.locator(".property-qr-target").innerText(), qrImageUrl.searchParams.get("data"), "QR dialog must show the exact URL encoded in the QR image");
  assert.ok(qrImageUrl.searchParams.get("data").endsWith(firstPropertyPath), "QR payload must target the fixture property's real detail route");
  await page.waitForFunction((image) => image.complete && image.naturalWidth >= 360 && image.naturalHeight >= 360, await qrImage.elementHandle(), { timeout: timeoutMs });
  await page.locator(".property-qr-dialog button[aria-label]").first().click();

  await actionButtons.nth(4).click();
  await page
    .locator(".property-brief-dialog[role='dialog']")
    .waitFor({ state: "visible", timeout: timeoutMs });
  assert.equal(await page.locator(".property-brief-dialog h2").innerText(), nativeShare.title, "intro sheet must display the selected property's actual title");
  assert.ok(await page.locator(".property-brief-dialog .property-brief-price").innerText(), "intro sheet must render a price summary");
  await page.locator(".property-brief-dialog .property-brief-close").click();

  await actionButtons.nth(5).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.clipboard.length === 2,
    null,
    { timeout: timeoutMs },
  );
  const copiedAdText = await page.evaluate(() => window.__propertyActionCalls.clipboard[1]);
  assert.ok(copiedAdText.includes(nativeShare.title), "copied ad text must contain the property title");
  assert.ok(copiedAdText.includes(firstPropertyNeighborhood.trim()), "copied ad text must contain the property's actual neighborhood");
  assert.ok(copiedAdText.includes(nativeShare.url), "copied ad text must contain the canonical property detail URL");

  await actionButtons.nth(6).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.prints === 1,
    null,
    { timeout: timeoutMs },
  );

  const compare = actionButtons.nth(7);
  await compare.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "true",
    await compare.elementHandle(),
    { timeout: timeoutMs },
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("hirmand-favorite-properties") || "[]")),
    [firstPropertySlug],
    "favorite action should persist the selected property's slug to localStorage",
  );
  await favorite.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "false",
    await favorite.elementHandle(),
    { timeout: timeoutMs },
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("hirmand-favorite-properties") || "[]").length),
    0,
    "favorite action should remove the saved property when toggled off",
  );
  await favorite.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "true",
    await favorite.elementHandle(),
    { timeout: timeoutMs },
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("hirmand-compare-properties") || "[]")),
    [firstPropertySlug],
    "compare action should persist the selected property's slug to localStorage",
  );
  await compare.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "false",
    await compare.elementHandle(),
    { timeout: timeoutMs },
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("hirmand-compare-properties") || "[]").length),
    0,
    "compare action should remove the property when toggled off",
  );
  await compare.click();
  await page.waitForFunction(
    (button) => button.getAttribute("aria-pressed") === "true",
    await compare.elementHandle(),
    { timeout: timeoutMs },
  );

  // Verify the actual three-item comparison limit: the handler must reject a
  // fourth property without changing the stored list or claiming it was added.
  await page.evaluate(() => localStorage.setItem("hirmand-compare-properties", JSON.stringify(["existing-a", "existing-b", "existing-c"])));
  await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForFunction(() => document.querySelector("article.pcard")?.querySelectorAll(".pcard-actions .property-action").length === 8, null, { timeout: timeoutMs });
  const compareAtLimit = page.locator("article.pcard").first().locator(".pcard-actions .property-action").nth(7);
  assert.equal(await compareAtLimit.getAttribute("aria-pressed"), "false", "a property outside a full comparison set must not appear selected");
  await compareAtLimit.click();
  await page.waitForTimeout(150);
  assert.equal(await compareAtLimit.getAttribute("aria-pressed"), "false", "the comparison limit must not mark a fourth property active");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("hirmand-compare-properties") || "[]")), ["existing-a", "existing-b", "existing-c"], "the comparison limit must preserve the existing three-item list");
  await page.evaluate((slug) => localStorage.setItem("hirmand-compare-properties", JSON.stringify([slug])), firstPropertySlug);
  await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForFunction(() => document.querySelector("article.pcard")?.querySelectorAll(".pcard-actions .property-action").length === 8, null, { timeout: timeoutMs });
  await page.waitForFunction(() => document.querySelector("article.pcard .pcard-actions .property-action:nth-child(8)")?.getAttribute("aria-pressed") === "true", null, { timeout: timeoutMs });
  // Reload resets the route to list mode. Switch views while retaining the
  // same eight operations so a layout preference never removes functionality.
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => document.querySelector(".pf-grid")?.classList.contains("is-list-view") === false &&
      document.querySelectorAll(".pf-views button")[1]?.getAttribute("aria-pressed") === "true",
    null,
    { timeout: timeoutMs },
  );
  console.log(
    "[property-card-browser] desktop actions work: favorite add/remove, native share and fallback, valid PNG intro card, QR preview/download, intro sheet, ad copy, print, compare add/remove and full-list guard",
  );

  // Resizing across the tablet breakpoint must keep actions mounted and usable;
  // state remains consistent instead of being lost with a viewport-dependent subtree.
  await page.setViewportSize({ width: 767, height: 844 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("article.pcard")].length > 0 &&
      [...document.querySelectorAll("article.pcard")].every((card) => card.querySelectorAll(".pcard-actions .property-action").length === 8),
    null,
    { timeout: timeoutMs },
  );
  const tabletButtons = await page.locator("article.pcard .property-action").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect(); return { width: box.width, height: box.height };
  }));
  assert.ok(tabletButtons.every((button) => button.width >= 30 && button.height >= 30),
    `tablet grid action controls must retain the existing compact 30px targets at 767px: ${JSON.stringify(tabletButtons)}`);

  await page.setViewportSize({ width: 768, height: 844 });
  await rails.first().waitFor({ state: "attached", timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const card = document.querySelector("article.pcard");
      const buttons = card?.querySelectorAll(".pcard-actions .property-action");
      return (
        buttons?.length === 8 &&
        buttons[0]?.getAttribute("aria-pressed") === "true" &&
        buttons[7]?.getAttribute("aria-pressed") === "true"
      );
    },
    null,
    { timeout: timeoutMs },
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  const tablet1024Buttons = await page.locator("article.pcard .property-action").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect(); return { width: box.width, height: box.height };
  }));
  assert.ok(tablet1024Buttons.every((button) => button.width >= 30 && button.height >= 30),
    `tablet grid action controls must retain the existing compact 30px targets at 1024px: ${JSON.stringify(tablet1024Buttons)}`);
  console.log(
    "[property-card-browser] resize 1280 → 767 → 768 → 1024px: all actions remain mounted, tablet targets stay 44px, and saved state restores",
  );

  // A fresh desktop navigation covers SSR-to-hydration independently of the
  // resize path above; actions must be present after hydration at every width.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(new URL("/properties", baseUrl).toString(), {
    waitUntil: "commit",
    timeout: timeoutMs,
  });
  await page.waitForFunction(
    () => {
      const card = document.querySelector("article.pcard");
      return Boolean(
        card &&
        card.querySelectorAll(".pcard-actions .property-action").length === 8,
      );
    },
    null,
    { timeout: timeoutMs },
  );
  assert.equal(
    (await page.locator("article.pcard .pcard-actions").count()) > 0,
    true,
    "fresh desktop navigation must mount actions after hydration",
  );
  console.log(
    "[property-card-browser] fresh desktop SSR → hydration: action controls mount without hydration errors",
  );

  // The public listing is a separate route and one of the main PropertyCard
  // consumers; verify it follows the same DOM contract, not only the homepage.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/properties", baseUrl).toString(), {
    waitUntil: "commit",
    timeout: timeoutMs,
  });
  const listingCards = page.locator("article.pcard");
  await listingCards.first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForTimeout(500);
  assert.equal(
    (await listingCards.count()) > 0,
    true,
    "public property listing should render cards",
  );
  // Select list mode explicitly: the route can restore a prior view or still
  // be hydrating when the first card appears, so viewport width alone is not
  // proof that its list-footer DOM has mounted.
  await page.locator(".pf-views button").nth(0).click();
  await page.waitForFunction(
    () => {
      const cardsNow = [...document.querySelectorAll(".pf-grid.is-list-view > article.pcard")];
      return cardsNow.length > 0 && cardsNow.every((card) =>
        card.querySelector(":scope > .pcard-visual .pcard-actions-list-overlay")?.querySelectorAll(".property-action").length === 8,
      );
    },
    null,
    { timeout: timeoutMs },
  );
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const rail = card.querySelector(":scope > .pcard-visual .pcard-actions-list-overlay");
      return rail?.querySelectorAll(".property-action").length === 8;
    })),
    true,
    "mobile list mode should render all eight operations in the image action rail",
  );
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const rail = card.querySelector(":scope > .pcard-visual .pcard-actions-list-overlay");
      if (!rail) return false;
      const railBox = rail.getBoundingClientRect();
      const buttons = [...rail.querySelectorAll(".property-action")];
      const visibleButtons = buttons.every((button) => {
        const box = button.getBoundingClientRect();
        return box.width >= 1 && box.height >= 1;
      });
      return railBox.width > 0 && railBox.height > 0 && visibleButtons;
    })),
    true,
    "mobile list image rail and all action hit areas must fit inside the image without clipping",
  );
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("article.pcard")].length > 0 &&
      [...document.querySelectorAll("article.pcard")].every((card) => card.querySelectorAll(".pcard-actions .property-action").length === 8),
    null,
    { timeout: timeoutMs },
  );
  await page.locator(".pf-views button").nth(0).click();
  const listActionRail = page.locator(
    ".pf-grid.is-list-view > article.pcard > .pcard-visual > .pcard-actions-list-overlay .property-action",
  );
  await listActionRail.first().waitFor({ state: "visible", timeout: timeoutMs });
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const rail = card.querySelector(":scope > .pcard-visual > .pcard-actions-list-overlay");
      return rail?.querySelectorAll(".property-action").length === 8 &&
        card.querySelector(":scope > .pcard-footer-with-actions .pcard-location") &&
        card.querySelector(":scope > .pcard-footer-with-actions .pcard-details-link");
    })),
    true,
    "list mode should keep all eight operations over the image and retain location/details in the footer",
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const layout = await listingCards.evaluateAll((items) => items.map((card) => {
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      const image = card.querySelector(":scope > .pcard-visual");
      const rail = image?.querySelector(":scope > .pcard-actions-list-overlay");
      const location = footer?.querySelector(".pcard-location");
      const details = footer?.querySelector(".pcard-details-link");
      const buttons = [...(rail?.querySelectorAll(".property-action") ?? [])];
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
      };
      const imageElement = image?.querySelector(".pcard-media img");
      return {
        card: rect(card),
        footer: footer ? rect(footer) : null,
        image: image ? rect(image) : null,
        imageFrame: imageElement ? rect(imageElement) : null,
        imageLayout: imageElement ? { width: imageElement.offsetWidth, height: imageElement.offsetHeight } : null,
        imageFit: imageElement ? getComputedStyle(imageElement).objectFit : "missing",
        rail: rail ? rect(rail) : null,
        railClientWidth: rail?.clientWidth ?? 0,
        railScrollWidth: rail?.scrollWidth ?? 0,
        railOverflowX: rail ? getComputedStyle(rail).overflowX : "missing",
        location: location ? rect(location) : null,
        details: details ? rect(details) : null,
        buttons: buttons.map(rect),
      };
    }));
    assert.equal(layout.length > 0, true, `listing should keep cards at ${width}px`);
    if (width >= 721) {
      const expectedImageWidth = width <= 980 ? 236 : 272;
      const cardHeights = layout.map((item) => item.card?.height ?? 0);
      assert.ok(cardHeights.every((height) => height === cardHeights[0]),
        `all desktop list cards must have the same height at ${width}px: ${JSON.stringify(cardHeights)}`);
      for (const [index, item] of layout.entries()) {
        assert.ok(Math.abs((item.image?.width ?? 0) - expectedImageWidth) <= 1,
          `desktop list card ${index + 1} image frame must be ${expectedImageWidth}px wide at ${width}px: ${JSON.stringify(item.image)}`);
        assert.ok(Math.abs((item.image?.height ?? 0) - 236) <= 1 && Math.abs((item.imageLayout?.height ?? 0) - 236) <= 1,
          `desktop list card ${index + 1} image frame and image layout must share the fixed 236px height at ${width}px: ${JSON.stringify({ frame: item.image, imageLayout: item.imageLayout, imageRect: item.imageFrame })}`);
        assert.equal(item.imageFit, "cover", `desktop list card ${index + 1} image must use object-fit: cover at ${width}px`);
      }
    }
    for (const [index, item] of layout.entries()) {
      assert.ok(item.footer, `card ${index + 1} should have its own footer at ${width}px`);
      assert.equal(item.buttons.length, 8, `card ${index + 1} should show eight actions at ${width}px`);
      assert.ok(item.rail && item.image && item.rail.bottom > item.image.top && item.rail.top < item.image.bottom,
        `the image action rail must remain over the image at ${width}px: ${JSON.stringify(item)}`);
      if (width >= 721) {
        assert.ok(item.rail.left >= item.image.left - 1 && item.rail.right <= item.image.right + 1,
          `the desktop image action rail must stay within the image width at ${width}px: ${JSON.stringify(item)}`);
      }
      assert.ok(item.buttons.every((button) => button.bottom > button.top), `all action targets must have visible geometry at ${width}px`);
      if (width <= 430) {
        assert.ok(item.buttons.every((button) => button.bottom - button.top >= 28), `mobile list image actions must retain their compact 28px controls at ${width}px`);
      }
      assert.ok(item.location && item.details, `location and details should remain visible at ${width}px`);
      assert.ok(item.location.right > item.location.left && item.location.bottom > item.location.top,
        `location must have a visible box at ${width}px`);
      assert.ok(item.details.right > item.details.left && item.details.bottom > item.details.top,
        `details link must have a visible box at ${width}px`);
      const overlaps = item.location.left < item.details.right && item.location.right > item.details.left &&
        item.location.top < item.details.bottom && item.location.bottom > item.details.top;
      assert.equal(overlaps, false, `location and details must not overlap at ${width}px`);
    }
    if (screenshotDir && width >= 721) {
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      await page.screenshot({ path: join(screenshotDir, `desktop-list-${width}.png`), fullPage: false });
    }
    console.log(`[property-card-browser] list view ${width}px: eight image actions bounded, location/details separated`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const listFavorite = page.locator("article.pcard > .pcard-visual > .pcard-actions-list-overlay .property-action").first();
  const favoriteBefore = await listFavorite.getAttribute("aria-pressed");
  const listingUrlBeforeAction = page.url();
  await listFavorite.click();
  await page.waitForFunction(
    (previous) => document.querySelector("article.pcard > .pcard-visual > .pcard-actions-list-overlay .property-action")?.getAttribute("aria-pressed") !== previous,
    favoriteBefore,
    { timeout: timeoutMs },
  );
  assert.notEqual(await listFavorite.getAttribute("aria-pressed"), favoriteBefore,
    "list image favorite action should update its pressed state");
  assert.equal(page.url(), listingUrlBeforeAction,
    "clicking a footer action must not navigate through the property link");
  assert.equal(
    await page.locator("article.pcard > .pcard-media-link .property-action, article.pcard > .pcard-copy-link .property-action").count(),
    0,
    "operation buttons must remain outside the property navigation link",
  );
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("article.pcard")].length > 0 &&
      [...document.querySelectorAll("article.pcard")].every((card) => card.querySelectorAll(".pcard-actions .property-action").length === 8),
    null,
    { timeout: timeoutMs },
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(
    () => {
      const cardsNow = [...document.querySelectorAll("article.pcard")];
      return (
        cardsNow.length > 0 &&
        cardsNow.every(
          (card) =>
            card.querySelectorAll(".pcard-actions .property-action").length ===
            8,
        )
      );
    },
    null,
    { timeout: timeoutMs },
  );
  console.log(
    `[property-card-browser] /properties route: ${await listingCards.count()} cards retain all eight actions in list and grid layouts`,
  );

  const detailCard = page.locator("article.pcard").first();
  const detailTitle = await detailCard.locator(".pcard-title").innerText();
  const detailHref = await detailCard.locator(".pcard-details-link").getAttribute("href");
  assert.ok(detailHref?.startsWith("/properties/"), "details link must point to the real property detail route");
  await detailCard.locator(".pcard-details-link").click();
  await page.waitForURL((url) => url.pathname === new URL(detailHref, baseUrl).pathname, { timeout: timeoutMs });
  const detailPage = page.locator(".property-detail-page");
  await detailPage.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(
    ({ title }) => {
      const page = document.querySelector(".property-detail-page");
      return Boolean(
        page &&
        page.getAttribute("aria-busy") !== "true" &&
        page.innerText.includes(title),
      );
    },
    { title: detailTitle },
    { timeout: timeoutMs },
  );
  assert.ok((await detailPage.innerText()).includes(detailTitle), "details page must render the selected property's actual title");
  const detailActions = detailPage.locator(".hd-actions-wrap > .pcard-actions");
  const detailActionButtons = detailActions.locator(".property-action");
  await detailActions.waitFor({ state: "visible", timeout: timeoutMs });
  assert.equal(await detailActionButtons.count(), 8, "property detail tools must expose all eight compact actions");
  assert.equal(await detailActions.locator(".property-actions-compact").count(), 1,
    "detail tools must reuse the shared compact PropertyActions renderer");
  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const geometry = await detailActions.evaluate((rail) => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const buttons = [...rail.querySelectorAll(".property-action")];
      return {
        rail: bounds(rail),
        clientWidth: rail.clientWidth,
        scrollWidth: rail.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        buttons: buttons.map((button) => ({ ...bounds(button), label: button.getAttribute("aria-label"), title: button.getAttribute("title"), pressed: button.getAttribute("aria-pressed") })),
      };
    });
    assert.equal(geometry.buttons.length, 8, `detail tools must keep all eight actions at ${width}px`);
    assert.ok(geometry.rail.left >= -1 && geometry.rail.right <= width + 1,
      `detail action container must remain inside the viewport at ${width}px: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1,
      `detail action container must not overflow horizontally at ${width}px: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.buttons.every((button) => button.label && button.title),
      `all detail action buttons must retain accessible labels and titles at ${width}px`);
    assert.ok(geometry.buttons[0].pressed === "true" || geometry.buttons[0].pressed === "false",
      `favorite must expose its toggle state through aria-pressed at ${width}px`);
    assert.ok(geometry.buttons[7].pressed === "true" || geometry.buttons[7].pressed === "false",
      `compare must expose its toggle state through aria-pressed at ${width}px`);
    assert.ok(geometry.buttons.slice(1, 7).every((button) => button.pressed === null),
      `momentary detail actions must not be exposed as pressed toggles at ${width}px`);
    assert.ok(geometry.buttons.every((button) => button.width > 0 && button.height > 0),
      `all detail action buttons must have visible hit areas at ${width}px`);
    if (width <= 430) {
      assert.ok(geometry.buttons.every((button) => button.width >= 44 && button.height >= 44),
        `detail action targets must remain at least 44px on mobile at ${width}px: ${JSON.stringify(geometry.buttons)}`);
    } else {
      assert.ok(geometry.buttons.every((button) => Math.abs(button.width - geometry.buttons[0].width) < 1 && Math.abs(button.height - geometry.buttons[0].height) < 1),
        `desktop/tablet detail action buttons must have consistent dimensions at ${width}px`);
    }
    console.log(`[property-card-browser] detail actions ${width}px: eight accessible targets, bounded layout, no horizontal overflow`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const detailFavorite = detailActionButtons.first();
  const detailFavoriteBefore = await detailFavorite.getAttribute("aria-pressed");
  await detailFavorite.click();
  await page.waitForFunction(
    (previous) => document.querySelector(".hd-actions-wrap > .pcard-actions .property-action")?.getAttribute("aria-pressed") !== previous,
    detailFavoriteBefore,
    { timeout: timeoutMs },
  );
  assert.notEqual(await detailFavorite.getAttribute("aria-pressed"), detailFavoriteBefore,
    "detail favorite action must update aria-pressed when activated");
  const detailFavoriteAfterClick = await detailFavorite.getAttribute("aria-pressed");
  await detailFavorite.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (previous) => document.querySelector(".hd-actions-wrap > .pcard-actions .property-action")?.getAttribute("aria-pressed") !== previous,
    detailFavoriteAfterClick,
    { timeout: timeoutMs },
  );
  assert.equal(await detailFavorite.getAttribute("aria-pressed"), detailFavoriteBefore,
    "detail favorite action must remain operable by keyboard and restore its pressed state");

  // Exercise every shared operation from the detail-page instance as well as
  // from listing cards; the compact renderer must not leave any handler wired
  // only in the card context.
  await detailActionButtons.nth(1).click();
  await page.waitForFunction(() => window.__propertyActionCalls.shares.length === 1, null, { timeout: timeoutMs });
  const detailShare = await page.evaluate(() => window.__propertyActionCalls.shares[0]);
  assert.ok(detailShare.title.includes(detailTitle), "detail share must describe the current property");
  assert.ok(detailShare.url.endsWith(new URL(detailHref, baseUrl).pathname), "detail share must target the current detail URL");

  await detailActionButtons.nth(2).click();
  await page.waitForFunction(() => window.__propertyActionCalls.shares.length === 2, null, { timeout: timeoutMs });
  const detailCardPayload = await page.evaluate(() => window.__propertyActionCalls.shares[1]);
  assert.equal(detailCardPayload.files?.[0]?.type, "image/png", "detail intro-card action must generate a shareable PNG");
  assert.ok(detailCardPayload.files[0].size > 100, "detail intro-card PNG must contain image bytes");

  await detailActionButtons.nth(3).click();
  const detailQrDialog = page.locator(".property-qr-dialog[role='dialog']");
  await detailQrDialog.waitFor({ state: "visible", timeout: timeoutMs });
  const detailQrImage = detailQrDialog.locator("img");
  await detailQrImage.waitFor({ state: "visible", timeout: timeoutMs });
  const detailQrUrl = new URL(await detailQrImage.getAttribute("src"));
  assert.ok(detailQrUrl.searchParams.get("data")?.endsWith(new URL(detailHref, baseUrl).pathname), "detail QR must encode the current property URL");
  await detailQrDialog.locator("button[aria-label]").first().click();

  await detailActionButtons.nth(4).click();
  const detailBrief = page.locator(".property-brief-dialog[role='dialog']");
  await detailBrief.waitFor({ state: "visible", timeout: timeoutMs });
  assert.ok((await detailBrief.innerText()).includes(detailTitle), "detail brief sheet must describe the current property");
  await detailBrief.locator(".property-brief-close").click();

  await detailActionButtons.nth(5).click();
  await page.waitForFunction(() => window.__propertyActionCalls.clipboard.length === 1, null, { timeout: timeoutMs });
  const detailAdText = await page.evaluate(() => window.__propertyActionCalls.clipboard[0]);
  assert.ok(detailAdText.includes(detailTitle), "detail copy-ad action must include the current property title");
  assert.ok(detailAdText.includes(new URL(detailHref, baseUrl).pathname), "detail copy-ad action must include the canonical detail URL");

  await detailActionButtons.nth(6).click();
  await page.waitForFunction(() => window.__propertyActionCalls.prints === 1, null, { timeout: timeoutMs });

  const detailCompare = detailActionButtons.nth(7);
  const detailCompareBefore = await detailCompare.getAttribute("aria-pressed");
  await detailCompare.click();
  await page.waitForFunction((previous) => document.querySelector(".hd-actions-wrap > .pcard-actions .property-action:nth-child(8)")?.getAttribute("aria-pressed") !== previous, detailCompareBefore, { timeout: timeoutMs });
  assert.notEqual(await detailCompare.getAttribute("aria-pressed"), detailCompareBefore, "detail compare action must toggle its accessible state");
  await detailCompare.click();
  await page.waitForFunction((previous) => document.querySelector(".hd-actions-wrap > .pcard-actions .property-action:nth-child(8)")?.getAttribute("aria-pressed") === previous, detailCompareBefore, { timeout: timeoutMs });
  console.log("[property-card-browser] detail route executes all eight operations: favorite keyboard toggle, share, PNG card, QR, brief sheet, ad copy, print, and compare toggle");

  assert.deepEqual(
    pageErrors,
    [],
    "browser run must not produce uncaught React/runtime errors",
  );
  assert.deepEqual(
    hydrationErrors,
    [],
    "browser run must not produce hydration mismatch errors",
  );
  console.log(
    "[property-card-browser] PASS: no uncaught page errors or hydration mismatch warnings",
  );
  await context.close();
} catch (error) {
  console.error("[property-card-browser] FAIL");
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
