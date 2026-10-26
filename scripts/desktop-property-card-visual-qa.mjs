#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.PROPERTY_CARD_VISUAL_BASE_URL || "http://127.0.0.1:8080/properties";
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl).hostname),
  "visual QA must target the isolated local app; use npm run test:property-card-visual to start its PGlite fixtures",
);
const timeoutMs = Number(process.env.PROPERTY_CARD_BROWSER_TIMEOUT_MS || 30_000);
const screenshotDir = process.env.PROPERTY_CARD_VISUAL_SCREENSHOT_DIR || "screenshots/mission-card-visual-check-20261026";
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

  // The browser uses the real local component and controlled PGlite property
  // fixtures; only the compiled CSS asset is replaced at its normal import slot.
  // The directory now intentionally defaults to list view. Wait for the
  // hydrated view controls, then switch explicitly using their pressed state;
  // SSR markup alone is not proof that React has attached the click handler.
  const viewButtons = page.locator(".pf-views button");
  const gridButton = viewButtons.filter({ hasText: "شبکه‌ای" });
  await gridButton.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("شبکه‌ای"));
    return button?.getAttribute("aria-pressed") === "false" && document.querySelector(".pf-grid.is-list-view");
  }, null, { timeout: timeoutMs });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await gridButton.click();
    try {
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("شبکه‌ای"));
        return button?.getAttribute("aria-pressed") === "true" && !document.querySelector(".pf-grid")?.classList.contains("is-list-view");
      }, null, { timeout: 1500 });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.waitForTimeout(250);
    }
  }

  const desktopWidths = [1024, 1199, 1200, 1280, 1440, 1920];
  for (const width of desktopWidths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const cardsNow = [...document.querySelectorAll("article.pcard")];
      return cardsNow.length > 0 && cardsNow.every((card) =>
        card.querySelectorAll(":scope > .pcard-footer > .pcard-actions .property-action").length === 8,
      );
    }, null, { timeout: timeoutMs });
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
      assert.ok(item.footer.top >= item.image.rect.bottom - 1, `card ${index + 1} footer must remain below the property photo at ${width}px`);
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
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
  const initialCardStyle = await firstCard.evaluate((card) => ({ border: getComputedStyle(card).borderColor, shadow: getComputedStyle(card).boxShadow }));
  await favorite.focus();
  await page.waitForTimeout(260);
  const focusStyle = await firstCard.evaluate((card) => ({ border: getComputedStyle(card).borderColor, shadow: getComputedStyle(card).boxShadow, transform: getComputedStyle(card).transform }));
  assert.notEqual(focusStyle.border, initialCardStyle.border, "keyboard focus inside the card should change the focus-within border");
  assert.notEqual(focusStyle.shadow, initialCardStyle.shadow, "keyboard focus inside the card should strengthen the card shadow");
  await favorite.click();
  await page.waitForTimeout(100);
  const after = await favorite.getAttribute("aria-pressed");
  assert.notEqual(after, before, "favorite action must toggle its real pressed state");
  assert.equal(page.url(), initialUrl, "clicking a card action must not activate the parent property link");
  await firstCard.hover();
  const hover = await firstCard.evaluate((card) => ({ border: getComputedStyle(card).borderColor, shadow: getComputedStyle(card).boxShadow, transform: getComputedStyle(card).transform }));
  assert.notEqual(hover.border, initialCardStyle.border, "desktop hover should apply the Hirmand-gold border");
  assert.notEqual(hover.shadow, initialCardStyle.shadow, "desktop hover should strengthen the card shadow");
  await page.screenshot({ path: `${screenshotDir}/working-tree-1440-hover-focus.png`, fullPage: false });
  console.log(`[desktop-card-visual] focus/hover/click: focus=${JSON.stringify(focusStyle)}, hover=${JSON.stringify(hover)}, favorite ${before}→${after}, URL unchanged`);

  const listButton = viewButtons.filter({ hasText: "لیستی" });
  await listButton.click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("لیستی"));
    return button?.getAttribute("aria-pressed") === "true" && document.querySelector(".pf-grid.is-list-view");
  }, null, { timeout: timeoutMs });
  for (const width of desktopWidths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const listLayout = await cards.evaluateAll((nodes) => nodes.map((card) => {
      const rect = (element) => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        const s = getComputedStyle(element);
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible: s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 };
      };
      const footer = card.querySelector(":scope > .pcard-footer-with-actions");
      const rail = footer?.querySelector(":scope > .pcard-actions-footer");
      const location = footer?.querySelector(".pcard-location");
      const details = footer?.querySelector(".pcard-details-link");
      const image = card.querySelector(".pcard-media img");
      return {
        title: card.querySelector(".pcard-title")?.textContent?.trim(),
        card: rect(card), footer: rect(footer), rail: rect(rail), location: rect(location), details: rect(details), image: rect(image),
        buttons: [...(rail?.querySelectorAll(".property-action") ?? [])].map((button) => ({ ...rect(button), label: button.getAttribute("aria-label") })),
        scrollWidth: card.scrollWidth, clientWidth: card.clientWidth,
      };
    }));
    assert.ok(listLayout.length > 0, `list mode must keep real cards visible at ${width}px`);
    for (const [index, item] of listLayout.entries()) {
      assert.ok(item.title, `list card ${index + 1} must retain its title at ${width}px`);
      assert.ok(item.image?.visible && item.image.width > 0 && item.image.height >= 180, `list card ${index + 1} must keep a controlled landscape photo at ${width}px`);
      assert.ok(item.footer?.height > 0 && item.rail?.height > 0, `list card ${index + 1} footer/action rail must be visible at ${width}px`);
      assert.ok(item.footer.top >= item.image.bottom - 1, `list card ${index + 1} footer must remain below the image at ${width}px`);
      assert.equal(item.buttons.length, 8, `list card ${index + 1} must retain all eight actions at ${width}px`);
      assert.ok(item.scrollWidth <= item.clientWidth + 1, `list card ${index + 1} must not overflow horizontally at ${width}px`);
      assert.ok(item.location?.visible && item.details?.visible, `list card ${index + 1} location/details must remain visible at ${width}px`);
      assert.ok(item.rail.top >= Math.max(item.location.bottom, item.details.bottom) - 1, `list card ${index + 1} action rail must sit below location/details at ${width}px`);
      const overlap = item.location.left < item.details.right && item.location.right > item.details.left && item.location.top < item.details.bottom && item.location.bottom > item.details.top;
      assert.equal(overlap, false, `list card ${index + 1} location and details must not overlap at ${width}px`);
      for (const button of item.buttons) {
        assert.ok(button.visible && button.width >= 34 && button.height >= 34, `list action ${button.label} must keep a usable target at ${width}px`);
        assert.ok(button.left >= item.rail.left - 1 && button.right <= item.rail.right + 1, `list action ${button.label} must stay within its rail at ${width}px`);
      }
    }
    await page.screenshot({ path: `${screenshotDir}/working-tree-${width}-list.png`, fullPage: false });
    console.log(`[desktop-card-visual] ${width}px list mode: ${listLayout.length} cards, loaded landscape layout, eight usable actions, footer geometry valid`);
  }

  // The new 220–290px image split is intentionally desktop-only. Existing
  // tablet list-card geometry must remain in control below 1024px.
  for (const width of [768, 820, 1023]) {
    await page.setViewportSize({ width, height: 1000 });
    const tabletLayout = await firstCard.evaluate((card) => ({
      columns: getComputedStyle(card).gridTemplateColumns,
      width: card.clientWidth,
      scrollWidth: card.scrollWidth,
      actionCount: card.querySelectorAll(":scope > .pcard-footer-with-actions .property-action").length,
    }));
    assert.ok(!tabletLayout.columns.includes("clamp(220px"), `tablet ${width}px must not receive the desktop-only image split`);
    assert.ok(tabletLayout.width > 0 && tabletLayout.scrollWidth <= tabletLayout.width + 1, `tablet ${width}px list card must remain bounded`);
    assert.equal(tabletLayout.actionCount, 8, `tablet ${width}px list card must retain all eight actions`);
    console.log(`[desktop-card-visual] ${width}px tablet guard: existing card columns retained, eight actions bounded`);
  }

  await gridButton.click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("شبکه‌ای"));
    return button?.getAttribute("aria-pressed") === "true" && !document.querySelector(".pf-grid")?.classList.contains("is-list-view");
  }, null, { timeout: timeoutMs });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    // Reload at each mobile width so the check covers the real SSR/hydration
    // path at that viewport, rather than relying only on a desktop resize event.
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await cards.first().waitFor({ state: "visible", timeout: timeoutMs });
    const mobileGridButton = page.locator(".pf-views button").filter({ hasText: "شبکه‌ای" });
    await mobileGridButton.waitFor({ state: "visible", timeout: timeoutMs });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("شبکه‌ای"));
      return button?.getAttribute("aria-pressed") === "false" && document.querySelector(".pf-grid.is-list-view");
    }, null, { timeout: timeoutMs });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await mobileGridButton.click();
      try {
        await page.waitForFunction(() => {
          const button = [...document.querySelectorAll(".pf-views button")].find((item) => item.textContent?.includes("شبکه‌ای"));
          return button?.getAttribute("aria-pressed") === "true" && !document.querySelector(".pf-grid")?.classList.contains("is-list-view");
        }, null, { timeout: 1500 });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await page.waitForTimeout(250);
      }
    }
    await page.waitForFunction(() => {
      const controls = [...document.querySelectorAll("article.pcard .pcard-actions, article.pcard .property-action")];
      return controls.every((element) => {
        const style = getComputedStyle(element);
        return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
      });
    }, null, { timeout: timeoutMs });
    await page.waitForTimeout(150);
    const mobileLayout = await cards.evaluateAll((nodes) => nodes.map((card) => ({
      title: card.querySelector(".pcard-title")?.textContent?.trim(),
      width: card.clientWidth,
      scrollWidth: card.scrollWidth,
      footer: card.querySelector(":scope > .pcard-footer")?.getBoundingClientRect().toJSON(),
    })));
    assert.ok(mobileLayout.length > 0, `mobile cards must remain visible at ${width}px`);
    for (const [index, card] of mobileLayout.entries()) {
      assert.ok(card.title, `mobile card ${index + 1} must retain its title at ${width}px`);
      assert.ok(card.width > 0 && card.scrollWidth <= card.width + 1, `mobile card ${index + 1} must not overflow horizontally at ${width}px`);
      assert.ok(card.footer?.height > 0, `mobile card ${index + 1} footer must remain visible at ${width}px`);
    }
    await page.screenshot({ path: `${screenshotDir}/working-tree-mobile-${width}.png`, fullPage: false });
    console.log(`[desktop-card-visual] ${width}px mobile: ${mobileLayout.length} cards visible, action rail not visible, footer bounded`);
  }
  assert.match(css, /@media\s*\((?:min-width:\s*1024px|width\s*>=\s*1024px)\)/, "desktop refinements must stay behind the desktop breakpoint and leave tablet widths untouched");
  console.log("[desktop-card-visual] 390px mobile screenshot captured; new layout rules are scoped to min-width 1024px");

  assert.deepEqual(pageErrors, [], "browser QA must not produce uncaught runtime errors");
  console.log("[desktop-card-visual] PASS");
} catch (error) {
  console.error("[desktop-card-visual] FAIL");
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
