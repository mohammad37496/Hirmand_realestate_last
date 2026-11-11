#!/usr/bin/env node

import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.PROPERTY_LIST_FOOTER_SMOKE_URL ?? "http://127.0.0.1:8081";
const cssOverridePath = process.env.PROPERTY_LIST_FOOTER_CSS_OVERRIDE;
const cssOverride = cssOverridePath ? fs.readFileSync(cssOverridePath, "utf8") : null;
const viewports = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const failures = [];
const results = [];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(12_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
      const response = await page.goto(new URL("/properties?sort=price_asc", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response || response.status() >= 400) {
        failures.push(`${viewport.width}x${viewport.height}: /properties returned ${response?.status() ?? "no response"}`);
        continue;
      }
      // Optional local-only override lets maintainers validate a candidate
      // stylesheet against real read-only production listings before CI runs
      // the same browser assertions against the built PR preview.
      if (cssOverride) await page.addStyleTag({ content: cssOverride });

      const listButton = page.locator('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]').first();
      await listButton.waitFor({ state: "visible" });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
      await page.waitForFunction(() => {
        const grid = document.querySelector(".pf-grid");
        const button = document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]');
        return grid?.classList.contains("is-list-view") && button?.getAttribute("aria-pressed") === "true";
      });

      const cards = page.locator(".pf-grid.is-list-view > .pcard.pcard-mobile-list");
      await cards.first().waitFor({ state: "visible" });
      const cardMetrics = await cards.evaluateAll((items) => items.map((card) => {
        const rect = card.getBoundingClientRect();
        const media = card.querySelector(".pcard-media > .pcard-image-link");
        const image = media?.querySelector("img");
        const mediaRect = media?.getBoundingClientRect();
        const body = card.querySelector(".pcard-body");
        const bodyRect = body?.getBoundingClientRect();
        const title = card.querySelector(".pcard-title");
        const titleRange = title ? document.createRange() : null;
        titleRange?.selectNodeContents(title);
        const titleRect = titleRange?.getBoundingClientRect();
        const overlaps = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
        return {
          height: rect.height,
          width: rect.width,
          imageWidth: mediaRect?.width ?? 0,
          imageHeight: mediaRect?.height ?? 0,
          bodyHeight: bodyRect?.height ?? 0,
          imageObjectFit: image ? getComputedStyle(image).objectFit : "",
          hasTitle: Boolean(titleRect && titleRect.width > 0 && titleRect.height > 0),
          imageInsideCard: Boolean(mediaRect && mediaRect.left >= rect.left - 1 && mediaRect.right <= rect.right + 1 && mediaRect.top >= rect.top - 1 && mediaRect.bottom <= rect.bottom + 1),
          bodyInsideCard: Boolean(bodyRect && bodyRect.left >= rect.left - 1 && bodyRect.right <= rect.right + 1 && bodyRect.top >= rect.top - 1 && bodyRect.bottom <= rect.bottom + 1),
          imageBodyOverlap: overlaps(mediaRect, bodyRect),
          imageTitleOverlap: overlaps(mediaRect, titleRect),
        };
      }));

      if (!cardMetrics.length) {
        failures.push(`${viewport.width}x${viewport.height}: list view rendered no property cards`);
        continue;
      }

      const expectedImageWidth = Math.min(112, Math.max(92, viewport.width * 0.28));
      const reference = cardMetrics[0];
      const invalidFrames = cardMetrics.filter((frame) =>
        Math.abs(frame.height - 132) > 1 ||
        Math.abs(frame.imageHeight - 132) > 1 ||
        Math.abs(frame.bodyHeight - 132) > 1 ||
        Math.abs(frame.imageWidth - expectedImageWidth) > 1 ||
        Math.abs(frame.height - reference.height) > 0.5 ||
        Math.abs(frame.width - reference.width) > 0.5 ||
        Math.abs(frame.imageWidth - reference.imageWidth) > 0.5 ||
        !frame.imageInsideCard ||
        !frame.bodyInsideCard ||
        !frame.hasTitle ||
        frame.imageBodyOverlap ||
        frame.imageTitleOverlap ||
        frame.imageObjectFit !== "cover"
      );
      if (invalidFrames.length) {
        failures.push(`${viewport.width}x${viewport.height}: inconsistent, non-compact, or internally overlapping list-card frames: ${JSON.stringify(invalidFrames)}`);
      }

      const footer = page.locator(".quick-actions").first();
      const footerState = await footer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          position: style.position,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      });
      if (footerState.position !== "fixed" || footerState.display === "none" || footerState.visibility === "hidden" || footerState.opacity <= 0 || footerState.height <= 0) {
        failures.push(`${viewport.width}x${viewport.height}: the fixed bottom action bar is not visibly rendered: ${JSON.stringify(footerState)}`);
      }

      // Exercise the worst-case list-card position next to the fixed dock. The
      // assertion below compares real rendered rectangles; scrolling alone is
      // not considered a pass.
      const lastCard = cards.last();
      // The assertion measures final layout, not the progress of CSS smooth
      // scrolling. Disable smooth scrolling so a busy CI runner cannot leave
      // scrollIntoView halfway through its animation when geometry is sampled.
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        document.body.style.scrollBehavior = "auto";
      });
      await lastCard.evaluate((card) => card.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" }));
      // Chromium can honor the page's smooth-scroll policy even when the
      // caller requests an instant scroll. Wait for the actual safe geometry
      // instead of sampling a partially completed scroll after a fixed delay.
      await page.waitForFunction(() => {
        const card = document.querySelector(".pf-grid.is-list-view > .pcard.pcard-mobile-list:last-child");
        const footerElement = document.querySelector(".quick-actions");
        if (!card || !footerElement) return false;
        const cardRect = card.getBoundingClientRect();
        const footerRect = footerElement.getBoundingClientRect();
        return cardRect.bottom <= footerRect.top - 4;
      }, null, { timeout: 3_000 });
      const bottomGeometry = await lastCard.evaluate((card) => {
        const footerElement = document.querySelector(".quick-actions");
        const mediaElement = card.querySelector(".pcard-media > .pcard-image-link");
        const bodyElement = card.querySelector(".pcard-body");
        const rect = (element) => {
          const value = element?.getBoundingClientRect();
          return value ? { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height } : null;
        };
        const cardRect = rect(card);
        const footerRect = rect(footerElement);
        const imageRect = rect(mediaElement);
        const bodyRect = rect(bodyElement);
        const intersects = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
        return {
          cardRect,
          footerRect,
          imageRect,
          bodyRect,
          cardOverlapsFooter: intersects(cardRect, footerRect),
          imageOverlapsFooter: intersects(imageRect, footerRect),
          bodyOverlapsFooter: intersects(bodyRect, footerRect),
          cardFooterGap: footerRect && cardRect ? footerRect.top - cardRect.bottom : null,
          imageFooterGap: footerRect && imageRect ? footerRect.top - imageRect.bottom : null,
          bodyFooterGap: footerRect && bodyRect ? footerRect.top - bodyRect.bottom : null,
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          documentScrollHeight: document.documentElement.scrollHeight,
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        };
      });
      if (bottomGeometry.cardOverlapsFooter || bottomGeometry.imageOverlapsFooter || bottomGeometry.bodyOverlapsFooter || bottomGeometry.cardFooterGap < 4) {
        failures.push(`${viewport.width}x${viewport.height}: the fixed bottom action bar occludes the last list card, its image, or its details: ${JSON.stringify(bottomGeometry)}`);
      }

      results.push({ viewport, cardCount: cardMetrics.length, expectedImageWidth, footer: footerState, bottomGeometry });
    } catch (error) {
      const state = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 500) ?? "",
        gridClass: document.querySelector(".pf-grid")?.className ?? null,
        listPressed: document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]')?.getAttribute("aria-pressed") ?? null,
        cardCount: document.querySelectorAll(".pf-grid .pcard-mobile-list").length,
      })).catch(() => null);
      failures.push(`${viewport.width}x${viewport.height}: ${error instanceof Error ? error.message : String(error)}; state=${JSON.stringify(state)}`);
    } finally {
      if (pageErrors.length) failures.push(`${viewport.width}x${viewport.height}: browser page errors: ${pageErrors.join(" | ")}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, viewports: results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
