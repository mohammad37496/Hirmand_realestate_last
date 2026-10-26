#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl =
  process.env.PROPERTY_CARD_BROWSER_BASE_URL || "http://127.0.0.1:8081";
const timeoutMs = Number(
  process.env.PROPERTY_CARD_BROWSER_TIMEOUT_MS || 30_000,
);

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
    new URL("/", baseUrl).toString(),
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
    window.__propertyActionCalls = { shares: [], clipboard: [], prints: 0 };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        window.__propertyActionCalls.shares.push(payload);
      },
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

  const response = await page.goto(new URL("/", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  assert.equal(response?.status(), 200, "home page should load successfully");
  const cards = page.locator("article.pcard");
  await cards.first().waitFor({ state: "visible", timeout: timeoutMs });
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

  await actionButtons.nth(2).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.shares.length === 2,
    null,
    { timeout: timeoutMs },
  );

  await actionButtons.nth(3).click();
  await page
    .locator(".property-qr-dialog[role='dialog']")
    .waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator(".property-qr-dialog button[aria-label]").first().click();

  await actionButtons.nth(4).click();
  await page
    .locator(".property-brief-dialog[role='dialog']")
    .waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator(".property-brief-dialog .property-brief-close").click();

  await actionButtons.nth(5).click();
  await page.waitForFunction(
    () => window.__propertyActionCalls.clipboard.length === 1,
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
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hirmand-compare-properties") || "[]")
          .length > 0,
    ),
    true,
    "compare action should persist to localStorage",
  );
  console.log(
    "[property-card-browser] desktop actions work: favorite, share, intro card, QR, intro sheet, copy, print, compare",
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
  await page.goto(new URL("/", baseUrl).toString(), {
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
  assert.equal(
    await page
      .locator("article.pcard .pcard-actions, article.pcard .property-action")
      .count(),
    0,
    "public listing cards must not render any action controls at 390px",
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
