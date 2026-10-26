#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.PROPERTY_CARD_VISUAL_BASE_URL || "https://hirmandrealestate.ir/properties";
const timeoutMs = Number(process.env.PROPERTY_CARD_BROWSER_TIMEOUT_MS || 30_000);
const screenshotDir = "screenshots/mission-card-visual-check-20261026";
const builtAssets = await readdir(new URL("../.output/public/assets/", import.meta.url));
const builtCssName = builtAssets.find((name) => /^properties-mobile-reference-.*\.css$/.test(name));
assert.ok(builtCssName, "run the production build before desktop visual QA so the browser tests the compiled stylesheet");
const css = await readFile(new URL(`../.output/public/assets/${builtCssName}`, import.meta.url), "utf8");
await mkdir(screenshotDir, { recursive: true });

let browser;
const pageErrors = [];
try {
  const launch = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  try {
    browser = await chromium.launch(launch);
  } catch {
    browser = await chromium.launch({ ...launch, channel: "chrome" });
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/assets/properties-mobile-reference-*.css", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: css });
  });
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  assert.equal(response?.status(), 200, "property listing must load successfully");
  const cards = page.locator("article.pcard");
  await cards.first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(() => [...document.querySelectorAll("article.pcard img")].some((img) => img.complete && img.naturalWidth > 0), null, { timeout: timeoutMs });

  // The browser keeps the real deployed component, property data and images;
  // the matching CSS request is fulfilled with this checkout's compiled asset
  // at its normal position in the stylesheet order.
  await page.waitForTimeout(250);
  if (await page.locator(".pf-grid").evaluate((grid) => grid.classList.contains("is-list-view"))) {
    await page.locator(".pf-views button").filter({ hasText: "شبکه‌ای" }).click();
    await page.waitForFunction(() => !document.querySelector(".pf-grid")?.classList.contains("is-list-view"), null, { timeout: timeoutMs });
  }

  const desktopWidths = [1024, 1280, 1440, 1920];
  for (const width of desktopWidths) {
    await page.setViewportSize({ width, height: 1000 });
    for (let index = 0; index < await cards.count(); index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await card.locator(".pcard-media img").waitFor({ state: "visible", timeout: timeoutMs });
      await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await card.locator(".pcard-media img").elementHandle(), { timeout: timeoutMs });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(180);
    const layout = await cards.evaluateAll((nodes) => nodes.map((card) => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 };
      };
      const footer = card.querySelector(":scope > .pcard-footer");
      const rail = footer?.querySelector(":scope > .pcard-actions");
      const dock = document.querySelector(".music-player-float:not(.music-player-float-empty)");
      const actions = [...(rail?.querySelectorAll(".property-action") ?? [])];
      const image = card.querySelector(".pcard-media img");
      return {
        title: card.querySelector(".pcard-title")?.textContent?.trim(),
        card: rect(card), footer: rect(footer), rail: rect(rail), dock: rect(dock),
        location: rect(footer?.querySelector(".pcard-location")),
        details: rect(footer?.querySelector(".pcard-details-link")),
        image: image ? { rect: rect(image), loaded: image.complete && image.naturalWidth > 0, naturalWidth: image.naturalWidth } : null,
        buttons: actions.map((button) => ({ ...rect(button), label: button.getAttribute("aria-label"), visible: getComputedStyle(button).visibility !== "hidden" && getComputedStyle(button).display !== "none" })),
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
      };
    }));

    assert.ok(layout.length > 0, `property cards must remain visible at ${width}px`);
    for (const [index, item] of layout.entries()) {
      assert.ok(item.title, `card ${index + 1} must have a title at ${width}px`);
      assert.ok(item.image?.loaded && item.image.naturalWidth > 0, `card ${index + 1} must display a loaded property image at ${width}px`);
      assert.ok(item.footer?.height > 0 && item.rail?.height > 0, `card ${index + 1} footer and action rail must be visible at ${width}px`);
      assert.equal(item.buttons.length, 8, `card ${index + 1} must have all eight actions at ${width}px`);
      assert.ok(item.scrollWidth <= item.clientWidth + 1, `card ${index + 1} must not have horizontal overflow at ${width}px`);
      for (const button of item.buttons) {
        assert.ok(button.visible && button.width >= 28 && button.height >= 28, `action ${button.label} must remain visible and usable at ${width}px`);
        assert.ok(button.left >= item.rail.left - 1 && button.right <= item.rail.right + 1, `action ${button.label} must stay within the rail at ${width}px`);
      }
      for (let leftIndex = 0; leftIndex < item.buttons.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < item.buttons.length; rightIndex += 1) {
          const left = item.buttons[leftIndex];
          const right = item.buttons[rightIndex];
          const overlap = left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
          assert.equal(overlap, false, `actions ${left.label} and ${right.label} must not overlap at ${width}px`);
        }
      }
      for (const [name, region] of [["location", item.location], ["details", item.details]]) {
        assert.ok(region?.visible && region.width > 0 && region.height > 0, `${name} must be visible at ${width}px`);
        assert.ok(region.left >= item.footer.left - 1 && region.right <= item.footer.right + 1, `${name} must remain within footer at ${width}px`);
      }
      const overlaps = item.location.left < item.details.right && item.location.right > item.details.left && item.location.top < item.details.bottom && item.location.bottom > item.details.top;
      assert.equal(overlaps, false, `location and details must not overlap at ${width}px`);
      assert.ok(item.rail.top >= Math.max(item.location.bottom, item.details.bottom) - 1, `action rail must sit below location/details at ${width}px`);
      if (item.dock && item.dock.width > 0 && item.dock.height > 0) {
        const dockOverlap = item.dock.left < item.footer.right && item.dock.right > item.footer.left && item.dock.top < item.footer.bottom && item.dock.bottom > item.footer.top;
        assert.equal(dockOverlap, false, `global music dock must not cover card ${index + 1} footer at ${width}px`);
      }
    }

    await page.screenshot({ path: `${screenshotDir}/working-tree-${width}.png`, fullPage: false });
    await cards.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${screenshotDir}/working-tree-${width}-card-footer.png`, fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 0));
    console.log(`[desktop-card-visual] ${width}px: ${layout.length} real cards, loaded images, 8 bounded actions, footer/link geometry valid`);
  }

  // Hover/focus should surface the Hirmand highlight without clipping the card.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const firstCard = cards.first();
  const favorite = firstCard.locator(":scope > .pcard-footer .property-action").first();
  await firstCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/working-tree-1440-grid-card-footer.png`, fullPage: false });
  const initialUrl = page.url();
  const before = await favorite.getAttribute("aria-pressed");
  await favorite.focus();
  await page.waitForTimeout(260);
  const focusStyle = await firstCard.evaluate((card) => ({ border: getComputedStyle(card).borderColor, transform: getComputedStyle(card).transform }));
  assert.notEqual(focusStyle.transform, "none", "keyboard focus inside the card should surface the focus-within state");
  await favorite.click();
  await page.waitForTimeout(100);
  const after = await favorite.getAttribute("aria-pressed");
  assert.notEqual(after, before, "favorite action must toggle its real pressed state");
  assert.equal(page.url(), initialUrl, "clicking a card action must not activate the parent property link");
  await firstCard.hover();
  const hover = await firstCard.evaluate((card) => ({ border: getComputedStyle(card).borderColor, transform: getComputedStyle(card).transform }));
  assert.notEqual(hover.transform, "none", "desktop hover should visibly lift the card");
  await page.screenshot({ path: `${screenshotDir}/working-tree-1440-hover-focus.png`, fullPage: false });
  console.log(`[desktop-card-visual] focus/hover/click: focus=${JSON.stringify(focusStyle)}, hover=${JSON.stringify(hover)}, favorite ${before}→${after}, URL unchanged`);

  await page.locator(".pf-views button").filter({ hasText: "لیستی" }).click();
  await page.waitForFunction(() => document.querySelector(".pf-grid")?.classList.contains("is-list-view"), null, { timeout: timeoutMs });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await firstCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const listFooter = await firstCard.evaluate((card) => {
    const footer = card.querySelector(":scope > .pcard-footer-with-actions");
    const rail = footer?.querySelector(":scope > .pcard-actions-footer");
    const location = footer?.querySelector(".pcard-location");
    const details = footer?.querySelector(".pcard-details-link");
    const rect = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      const s = getComputedStyle(element);
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible: s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 };
    };
    const buttons = [...(rail?.querySelectorAll(".property-action") ?? [])].map(rect);
    return { footer: rect(footer), rail: rect(rail), location: rect(location), details: rect(details), buttons, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth };
  });
  assert.ok(listFooter.footer?.height > 0 && listFooter.rail?.height > 0, "list-view footer and action row must be visible");
  assert.equal(listFooter.buttons.length, 8, "list-view card must keep all eight actions");
  assert.ok(listFooter.scrollWidth <= listFooter.clientWidth + 1, "list-view card must not overflow horizontally");
  assert.ok(listFooter.location?.visible && listFooter.details?.visible, "list-view location and details link must both remain visible");
  assert.ok(listFooter.rail.top >= Math.max(listFooter.location.bottom, listFooter.details.bottom) - 1, "list-view action rail must remain below the location and details link");
  for (const button of listFooter.buttons) {
    assert.ok(button.width > 0 && button.height > 0 && button.left >= listFooter.rail.left - 1 && button.right <= listFooter.rail.right + 1, "list-view actions must stay inside their rail");
  }
  await page.screenshot({ path: `${screenshotDir}/working-tree-1440-list-card-footer.png`, fullPage: false });
  console.log("[desktop-card-visual] 1440px list mode: visible location/details, eight bounded actions, no horizontal overflow");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(3500);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${screenshotDir}/working-tree-mobile-390.png`, fullPage: false });
  assert.match(css, /@media\s*\((?:min-width:\s*768px|width\s*>=\s*768px)\)/, "desktop refinements must stay behind the desktop breakpoint");
  console.log("[desktop-card-visual] 390px mobile screenshot captured; new layout rules are scoped to min-width 768px");

  assert.deepEqual(pageErrors, [], "browser QA must not produce uncaught runtime errors");
  console.log("[desktop-card-visual] PASS");
} catch (error) {
  console.error("[desktop-card-visual] FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
