#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl =
  process.env.PROPERTY_CARD_BROWSER_BASE_URL || "https://hirmandrealestate.ir";
const timeoutMs = Number(
  process.env.PROPERTY_CARD_BROWSER_TIMEOUT_MS || 30_000,
);
const builtAssets = await readdir(new URL("../.output/public/assets/", import.meta.url));
const builtCssName = builtAssets.find((name) => /^properties-mobile-reference-.*\.css$/.test(name));
assert.ok(builtCssName, "run the production build before browser QA so the test uses the current compiled card stylesheet");
const compiledCardCss = await readFile(new URL(`../.output/public/assets/${builtCssName}`, import.meta.url), "utf8");
console.log(`[property-card-browser] app=${baseUrl}; card CSS=local production build; app/data source=${new URL(baseUrl).origin}`);

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
        window.__propertyActionCalls.shares.push(payload);
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
  await page.route("**/assets/properties-mobile-reference-*.css", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: compiledCardCss });
  });
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
  // The listing defaults to list mode on narrow screens, where the eight
  // operations intentionally live in each card footer. Switch to grid mode
  // before asserting the mobile grid contract (no action subtree).
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => !document.querySelector(".pf-grid")?.classList.contains("is-list-view"),
    null,
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(800);

  // Mobile: check the actual hydrated DOM, not computed CSS visibility.
  assert.equal(
    (await cards.count()) > 0,
    true,
    "the page should render property cards for the browser test",
  );
  assert.equal(
    await page.locator("article.pcard .pcard-actions").count(),
    0,
    "mobile property cards must not render an operation rail",
  );
  assert.equal(
    await page.locator("article.pcard .property-action").count(),
    0,
    "mobile property cards must not retain any of the eight action buttons in the DOM",
  );
  assert.equal(
    await page.locator("article.pcard .property-actions-compact").count(),
    0,
    "mobile property cards must not mount PropertyActions in compact mode",
  );
  console.log(
    `[property-card-browser] mobile 390px: ${await cards.count()} cards; zero action rails/buttons in DOM`,
  );

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
  await page.evaluate(() => { window.__propertyActionCalls.allowNativeShare = false; });
  await actionButtons.nth(1).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.clipboard.length === 1,
    null,
    { timeout: timeoutMs },
  );
  await page.evaluate(() => { window.__propertyActionCalls.allowNativeShare = true; });

  await actionButtons.nth(2).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.shares.length === 2,
    null,
    { timeout: timeoutMs },
  );

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
  await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await qrImage.elementHandle(), { timeout: timeoutMs });
  await page.locator(".property-qr-dialog button[aria-label]").first().click();

  await actionButtons.nth(4).click();
  await page
    .locator(".property-brief-dialog[role='dialog']")
    .waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator(".property-brief-dialog .property-brief-close").click();

  await actionButtons.nth(5).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.clipboard.length === 2,
    null,
    { timeout: timeoutMs },
  );

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
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hirmand-favorite-properties") || "[]")
          .length > 0,
    ),
    true,
    "favorite action should persist to localStorage",
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
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hirmand-compare-properties") || "[]")
          .length > 0,
    ),
    true,
    "compare action should persist to localStorage",
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
  console.log(
    "[property-card-browser] desktop actions work: favorite add/remove, share with clipboard fallback, intro card, QR, intro sheet, copy, print, compare add/remove",
  );

  // Resizing back to mobile must unmount the whole action subtree; resizing up
  // again must remount it and restore persisted favorite/compare state.
  await page.setViewportSize({ width: 767, height: 844 });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        "article.pcard .pcard-actions, article.pcard .property-action",
      ).length === 0,
    null,
    { timeout: timeoutMs },
  );
  assert.equal(
    await page.locator("article.pcard .property-actions-compact").count(),
    0,
    "resizing below 768px must remove the action component from every card",
  );

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
  console.log(
    "[property-card-browser] resize 1280 → 767 → 768px: subtree unmounts/remounts and saved state restores",
  );

  // A fresh desktop navigation covers SSR-to-hydration independently of the
  // resize path above: the server omits viewport-dependent controls and React
  // mounts them after matchMedia is read on the client.
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
        card.querySelector(":scope > .pcard-footer-with-actions")?.querySelectorAll(".property-action").length === 8,
      );
    },
    null,
    { timeout: timeoutMs },
  );
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      return footer?.querySelectorAll(".property-action").length === 8;
    })),
    true,
    "mobile list mode should render all eight operations in each card footer",
  );
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      if (!footer) return false;
      const cardBox = card.getBoundingClientRect();
      const footerBox = footer.getBoundingClientRect();
      const buttons = [...footer.querySelectorAll(".property-action")];
      return footerBox.top >= cardBox.top && footerBox.bottom <= cardBox.bottom + 1 &&
        buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.width >= 1 && box.height >= 1 && box.top >= footerBox.top && box.bottom <= footerBox.bottom + 1;
        });
    })),
    true,
    "mobile list footers and all action hit areas must fit inside the card without clipping",
  );
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => document.querySelectorAll("article.pcard .pcard-actions, article.pcard .property-action").length === 0,
    null,
    { timeout: timeoutMs },
  );
  await page.locator(".pf-views button").nth(0).click();
  const listFooterActions = page.locator(
    "article.pcard > .pcard-footer-with-actions .property-action",
  );
  await listFooterActions.first().waitFor({ state: "visible", timeout: timeoutMs });
  assert.equal(
    await listingCards.evaluateAll((items) => items.every((card) => {
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      return footer?.querySelectorAll(".property-action").length === 8 &&
        footer.querySelector(".pcard-location") &&
        footer.querySelector(".pcard-details-link");
    })),
    true,
    "mobile list view should place all eight operations beside location/details in every card footer",
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const layout = await listingCards.evaluateAll((items) => items.map((card) => {
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      const location = footer?.querySelector(".pcard-location");
      const details = footer?.querySelector(".pcard-details-link");
      const buttons = [...(footer?.querySelectorAll(".property-action") ?? [])];
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
      };
      return {
        footer: footer ? rect(footer) : null,
        location: location ? rect(location) : null,
        details: details ? rect(details) : null,
        buttons: buttons.map(rect),
      };
    }));
    assert.equal(layout.length > 0, true, `listing should keep cards at ${width}px`);
    for (const [index, item] of layout.entries()) {
      assert.ok(item.footer, `card ${index + 1} should have its own footer at ${width}px`);
      assert.equal(item.buttons.length, 8, `card ${index + 1} should show eight actions at ${width}px`);
      for (const button of item.buttons) {
        assert.ok(button.left >= item.footer.left - 1 && button.right <= item.footer.right + 1,
          `action should stay within the footer at ${width}px`);
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
    console.log(`[property-card-browser] list footer ${width}px: eight actions bounded, location/details separated`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const footerFavorite = page.locator("article.pcard > .pcard-footer-with-actions .property-action").first();
  const favoriteBefore = await footerFavorite.getAttribute("aria-pressed");
  const listingUrlBeforeAction = page.url();
  await footerFavorite.click();
  await page.waitForFunction(
    (previous) => document.querySelector("article.pcard > .pcard-footer-with-actions .property-action")?.getAttribute("aria-pressed") !== previous,
    favoriteBefore,
    { timeout: timeoutMs },
  );
  assert.notEqual(await footerFavorite.getAttribute("aria-pressed"), favoriteBefore,
    "footer favorite action should update its pressed state");
  assert.equal(page.url(), listingUrlBeforeAction,
    "clicking a footer action must not navigate through the property link");
  assert.equal(
    await page.locator("article.pcard > .pcard-link .property-action").count(),
    0,
    "operation buttons must remain outside the property navigation link",
  );
  await page.locator(".pf-views button").nth(1).click();
  await page.waitForFunction(
    () => document.querySelectorAll("article.pcard .pcard-actions, article.pcard .property-action").length === 0,
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
    `[property-card-browser] /properties route: ${await listingCards.count()} cards obey mobile removal and desktop eight-action contract`,
  );

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
