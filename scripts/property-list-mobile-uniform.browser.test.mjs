#!/usr/bin/env node

import { chromium } from "playwright";
import fs from "node:fs";

const baseUrl = process.argv[2] ?? process.env.PROPERTY_LIST_UNIFORM_SMOKE_URL ?? "http://127.0.0.1:8081";
const cssOverridePath = process.env.PROPERTY_LIST_UNIFORM_CSS_OVERRIDE;
const cssSource = cssOverridePath ? fs.readFileSync(cssOverridePath, "utf8") : null;
const cssMarker = "/* One fixed, compact geometry for every marketplace mobile list card.";
const cssOverride = cssSource ? cssSource.slice(cssSource.lastIndexOf(cssMarker)) : null;
if (cssOverridePath && (!cssOverride || !cssOverride.includes(cssMarker))) {
  throw new Error(`Could not find the mobile list-card override marker in ${cssOverridePath}`);
}
const viewports = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 640, height: 900 },
  { width: 641, height: 900 },
  { width: 720, height: 900 },
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
        failures.push(`${viewport.width}px: /properties returned ${response?.status() ?? "no response"}`);
        continue;
      }
      // Allows the exact candidate block to be tested against read-only live
      // property data before it is merged; the page itself is never mutated.
      if (cssOverride) await page.addStyleTag({ content: cssOverride });

      const listButton = page.locator('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]').first();
      await listButton.waitFor({ state: "visible" });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
      await page.waitForFunction(() => {
        const grid = document.querySelector(".pf-grid");
        const button = document.querySelector('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]');
        return grid?.classList.contains("is-list-view") && button?.getAttribute("aria-pressed") === "true";
      });

      const fixture = await page.evaluate(() => {
        const grid = document.querySelector(".pf-grid.is-list-view");
        if (!grid) throw new Error("the mobile list grid is missing");
        let source = grid.querySelector(":scope > .pcard.pcard-mobile-list");
        let usedSyntheticSource = false;

        if (!source) {
          usedSyntheticSource = true;
          const wrapper = document.createElement("article");
          wrapper.className = "pcard pcard-mobile-list";
          wrapper.innerHTML = `
            <div class="pcard-media">
              <a class="pcard-image-link" href="#" aria-label="تصویر فایل آزمایشی">
                <picture><img alt="تصویر فایل آزمایشی" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23d8ddd8'/%3E%3C/svg%3E"></picture>
              </a>
              <div class="pcard-badges"><span class="pcard-badge">فروش</span></div>
            </div>
            <a class="pcard-link" href="#" aria-label="جزئیات فایل آزمایشی">
              <div class="pcard-body">
                <div class="pcard-topline"><div class="pcard-meta"><span>فروش</span><span>آپارتمان</span></div><span class="pcard-code">کد ۱۲۳۴۵۶</span></div>
                <h3 class="pcard-title">آپارتمان دوخوابه نورگیر با پارکینگ</h3>
                <div class="pcard-price-row"><p class="pcard-price">۱۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان</p></div>
                <div class="pcard-specs"><span>۱۲۰ متر</span><span>۲ خواب</span></div>
                <div class="pcard-footer"><span class="pcard-location">مرکز شهر</span><span class="pcard-details-link">مشاهده جزئیات</span></div>
              </div>
            </a>`;
          source = wrapper;
          grid.appendChild(source);
        }

        const variants = ["baseline", "long-title", "missing-image", "no-price-or-specs", "two-price-lines-many-specs", "long-metadata", "long-code", "featured-unavailable"];
        for (const variant of variants.slice(1)) {
          const clone = source.cloneNode(true);
          clone.dataset.uniformRegressionVariant = variant;
          const title = clone.querySelector(".pcard-title");
          const priceRow = clone.querySelector(".pcard-price-row");
          const specs = clone.querySelector(".pcard-specs");
          const location = clone.querySelector(".pcard-location");
          const imageLink = clone.querySelector(".pcard-media > .pcard-image-link");
          const meta = clone.querySelector(".pcard-meta");
          const code = clone.querySelector(".pcard-code");
          const badges = clone.querySelector(".pcard-badges");

          if (variant === "long-title" && title) title.textContent = "آپارتمان بسیار خوش‌نقشه و نورگیر با تراس بزرگ و دسترسی عالی به مراکز خرید و حمل‌ونقل عمومی در محله‌ای آرام و خوش‌دسترسی با امکانات کامل و بازسازی بسیار باکیفیت";
          if (variant === "missing-image" && imageLink) imageLink.innerHTML = '<span class="property-image-fallback" role="img" aria-label="تصویر فایل موجود نیست">بدون تصویر</span>';
          if (variant === "no-price-or-specs") {
            priceRow?.replaceChildren();
            specs?.replaceChildren();
          }
          if (variant === "two-price-lines-many-specs") {
            if (priceRow) priceRow.innerHTML = '<p class="pcard-price-line"><span class="pcard-price-label">رهن</span><span class="pcard-price-value">۱٬۲۰۰٬۰۰۰٬۰۰۰ تومان</span></p><p class="pcard-price-line"><span class="pcard-price-label">اجاره</span><span class="pcard-price-value">۴۵٬۰۰۰٬۰۰۰ تومان</span></p>';
            if (specs) specs.innerHTML = '<span>۱۸۵ متر</span><span>۳ خواب</span><span>ساخت ۱۴۰۵</span><span>پارکینگ</span><span>آسانسور</span><span>انباری</span>';
          }
          if (variant === "long-metadata") {
            if (meta) meta.innerHTML = "<span>معاوضه و مشارکت ویژه</span><span>ملک تجاری بزرگ‌مقیاس</span>";
            if (location) location.textContent = "محله بسیار طولانی و پرتراکم با دسترسی عالی به چندین مسیر اصلی شهر";
          }
          if (variant === "long-code" && code) code.textContent = "کد ۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶";
          if (variant === "featured-unavailable" && badges) {
            badges.innerHTML = '<span class="pcard-badge pcard-badge-featured">ویژه</span><span class="pcard-badge">ناموجود</span>';
          }
          clone.dataset.uniformRegressionVariant = variant;
          grid.appendChild(clone);
        }
        source.dataset.uniformRegressionVariant = "baseline";
        const variantCards = [...grid.querySelectorAll(":scope > .pcard.pcard-mobile-list")];
        for (let index = variantCards.length; index < 24; index += 1) {
          const clone = variantCards[index % variantCards.length].cloneNode(true);
          clone.dataset.uniformRegressionVariant = "repeat-" + (index % variants.length);
          grid.appendChild(clone);
        }
        return { usedSyntheticSource, sourceCount: grid.querySelectorAll(":scope > .pcard.pcard-mobile-list").length };
      });

      const cards = page.locator(".pf-grid.is-list-view > .pcard.pcard-mobile-list");
      const metrics = await cards.evaluateAll((items) => items.map((card) => {
        const rect = card.getBoundingClientRect();
        const imageLink = card.querySelector(".pcard-media > .pcard-image-link");
        const imageRect = imageLink?.getBoundingClientRect();
        const bodyLink = card.querySelector(":scope > .pcard-link");
        const imageVisual = imageLink?.querySelector("img, .property-image-fallback");
        const body = card.querySelector(".pcard-body");
        const bodyRect = body?.getBoundingClientRect();
        const toplineRect = card.querySelector(".pcard-topline")?.getBoundingClientRect();
        const title = card.querySelector(".pcard-title");
        const titleRect = title?.getBoundingClientRect();
        const titleStyle = title ? getComputedStyle(title) : null;
        const footer = card.querySelector(".pcard-footer");
        const footerRect = footer?.getBoundingClientRect();
        const specs = card.querySelector(".pcard-specs");
        const specsRect = specs?.getBoundingClientRect();
        const price = card.querySelector(".pcard-price-row");
        const priceRect = price?.getBoundingClientRect();
        const priceLabelCount = [...(price?.querySelectorAll(".pcard-price-label") ?? [])]
          .filter((label) => getComputedStyle(label).display !== "none").length;
        const intersects = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
        return {
          variant: card.dataset.uniformRegressionVariant ?? "live",
          card: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          image: imageRect ? { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height } : null,
          body: bodyRect ? { x: bodyRect.x, y: bodyRect.y, width: bodyRect.width, height: bodyRect.height } : null,
          topline: toplineRect ? { x: toplineRect.x, y: toplineRect.y, width: toplineRect.width, height: toplineRect.height } : null,
          title: titleRect ? { x: titleRect.x, y: titleRect.y, width: titleRect.width, height: titleRect.height, lineClamp: titleStyle?.webkitLineClamp, lineHeight: titleStyle?.lineHeight } : null,
          specs: specsRect ? { x: specsRect.x, y: specsRect.y, width: specsRect.width, height: specsRect.height } : null,
          price: priceRect ? { x: priceRect.x, y: priceRect.y, width: priceRect.width, height: priceRect.height } : null,
          priceLabelCount,
          footer: footerRect ? { x: footerRect.x, y: footerRect.y, width: footerRect.width, height: footerRect.height } : null,
          hasImageVisual: Boolean(imageVisual),
          imageLinkAccessible: imageLink?.tagName === "A" && Boolean(imageLink.getAttribute("aria-label")),
          bodyLinkAccessible: bodyLink?.tagName === "A" && Boolean(bodyLink.getAttribute("aria-label")),
          imageBodyOverlap: intersects(imageRect, bodyRect),
          titleOutsideBody: Boolean(titleRect && bodyRect && (titleRect.left < bodyRect.left - 1 || titleRect.right > bodyRect.right + 1 || titleRect.top < bodyRect.top - 1 || titleRect.bottom > bodyRect.bottom + 1)),
        };
      }));

      if (metrics.length < 24) failures.push(`${viewport.width}px: expected at least 24 DOM cards, received ${metrics.length}`);
      const baseline = metrics[0];
      const expectedImageWidth = Math.min(112, Math.max(92, viewport.width * 0.28));
      const invalid = metrics.filter((item) =>
        Math.abs(item.card.height - 132) > 0.5 ||
        Math.abs(item.card.width - baseline.card.width) > 0.5 ||
        Math.abs(item.image?.width - expectedImageWidth) > 0.75 ||
        Math.abs(item.image?.height - 132) > 0.5 ||
        Math.abs(item.body?.height - 132) > 0.5 ||
        Math.abs(item.body?.width - (item.card.width - expectedImageWidth - 2)) > 1.5 ||
        Math.abs(item.body?.x - (item.card.x + 1)) > 1.5 ||
        Math.abs(item.image?.x - (item.card.x + item.card.width - expectedImageWidth - 1)) > 1.5 ||
        [item.topline, item.title, item.price, item.specs, item.footer].some((row) =>
          !row ||
          Math.abs(row.x - (item.body.x + 7)) > 1.5 ||
          Math.abs(row.width - (item.body.width - 14)) > 1.5
        ) ||
        ["topline", "price", "specs", "footer"].some((key) =>
          Math.abs(item[key]?.y - item.body.y - (baseline[key]?.y - baseline.body.y)) > 1
        ) ||
        Math.abs((item.title?.y + item.title?.height / 2) - item.body.y - ((baseline.title?.y + baseline.title?.height / 2) - baseline.body.y)) > 1 ||
        Math.abs(item.specs?.height - 18) > 0.5 ||
        Math.abs(item.price?.height - 22) > 0.5 ||
        Math.abs(item.footer?.height - 16) > 0.5 ||
        (item.variant === "two-price-lines-many-specs" && item.priceLabelCount !== 2) ||
        !item.hasImageVisual ||
        !item.imageLinkAccessible ||
        !item.bodyLinkAccessible ||
        item.imageBodyOverlap ||
        item.titleOutsideBody ||
        !item.title ||
        Number.parseFloat(item.title.height) > 31 ||
        Number(item.title.lineClamp) !== 2
      );
      if (invalid.length) failures.push(`${viewport.width}px: list-card variants do not share the compact 132px geometry: ${JSON.stringify(invalid)}`);

      const footer = page.locator(".quick-actions").first();
      let footerGeometry = null;
      if (await footer.count()) {
        await cards.last().evaluate((card) => card.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" }));
        footerGeometry = await cards.last().evaluate((card) => {
          const footerElement = document.querySelector(".quick-actions");
          const pageRoot = document.querySelector(".pf-page");
          const rect = (element) => {
            const value = element?.getBoundingClientRect();
            return value ? { top: value.top, bottom: value.bottom, left: value.left, right: value.right } : null;
          };
          const cardRect = rect(card);
          const footerRect = rect(footerElement);
          const pageStyle = pageRoot ? getComputedStyle(pageRoot) : null;
          const cardStyle = getComputedStyle(card);
          return {
            cardRect,
            footerRect,
            pagePaddingBottom: pageStyle?.paddingBottom ?? null,
            pageHasList: pageRoot?.matches(":has(.pf-grid.is-list-view)") ?? false,
            pageScrollHeight: pageRoot?.scrollHeight ?? null,
            pageClientHeight: pageRoot?.clientHeight ?? null,
            cardScrollMarginEnd: cardStyle.scrollMarginBlockEnd,
            overlap: Boolean(cardRect && footerRect && cardRect.left < footerRect.right - 1 && cardRect.right > footerRect.left + 1 && cardRect.top < footerRect.bottom - 1 && cardRect.bottom > footerRect.top + 1),
            gap: cardRect && footerRect ? footerRect.top - cardRect.bottom : null,
          };
        });
        if (footerGeometry.overlap || footerGeometry.gap < 4) failures.push(`${viewport.width}px: last card intersects or approaches the fixed footer unsafely: ${JSON.stringify(footerGeometry)}`);
      }

      const range = (key, nested) => {
        const values = metrics.map((item) => nested ? item[nested]?.[key] : item[key]).filter(Number.isFinite);
        return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
      };
      results.push({
        viewport,
        ...fixture,
        cardCount: metrics.length,
        expectedImageWidth,
        geometry: {
          cardWidth: range("width", "card"),
          cardHeight: range("height", "card"),
          imageWidth: range("width", "image"),
          imageHeight: range("height", "image"),
          bodyWidth: range("width", "body"),
          bodyHeight: range("height", "body"),
          titleHeight: range("height", "title"),
          priceHeight: range("height", "price"),
          specsHeight: range("height", "specs"),
          footerHeight: range("height", "footer"),
          variants: [...new Set(metrics.map((item) => item.variant))],
        },
        footerGeometry,
      });
    } catch (error) {
      failures.push(`${viewport.width}px: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (pageErrors.length) failures.push(`${viewport.width}px: browser page errors: ${pageErrors.join(" | ")}`);
      await page.close();
    }
  }

  // The compact rules must not leak into mobile grid or desktop list cards.
  const gridPage = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  try {
    gridPage.setDefaultTimeout(12_000);
    await gridPage.goto(new URL("/properties?sort=price_asc", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (cssOverride) await gridPage.addStyleTag({ content: cssOverride });
    await gridPage.waitForFunction(() => document.querySelector(".pf-grid")?.children.length > 0);
    await gridPage.waitForTimeout(500);
    const gridButton = gridPage.locator('.pf-views button[aria-label="نمایش شبکه‌ای فایل‌ها"]').first();
    await gridButton.waitFor({ state: "visible" });
    if (await gridButton.getAttribute("aria-pressed") !== "true") await gridButton.click();
    await gridPage.waitForFunction(() => document.querySelector(".pf-grid")?.classList.contains("is-grid-view"));
    const gridGeometry = await gridPage.locator(".pf-grid.is-grid-view > .pcard").first().evaluate((card) => {
      const rect = card.getBoundingClientRect();
      const image = card.querySelector(".pcard-media > .pcard-image-link")?.getBoundingClientRect();
      const actions = card.querySelector(".pcard-actions");
      const actionButtons = [...(actions?.querySelectorAll("button, a") ?? [])].map((button) => {
        const bounds = button.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
      return {
        cardHeight: rect.height,
        imageHeight: image?.height ?? 0,
        actionsDisplay: actions ? getComputedStyle(actions).display : "missing",
        actionButtons,
      };
    });
    if (gridGeometry.cardHeight <= 132 || gridGeometry.imageHeight <= 132 || gridGeometry.actionsDisplay === "none" || gridGeometry.actionsDisplay === "missing" || !gridGeometry.actionButtons.length) {
      failures.push(`430px grid view was affected by mobile list-card rules: ${JSON.stringify(gridGeometry)}`);
    }
    if (gridGeometry.actionButtons.some((button) => button.width < 40 || button.height < 40)) {
      failures.push(`430px grid actions lost their touch target size: ${JSON.stringify(gridGeometry.actionButtons)}`);
    }
  } catch (error) {
    failures.push(`430px grid-view regression: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await gridPage.close();
  }

  for (const viewport of [{ width: 768, height: 900 }, { width: 1024, height: 900 }]) {
    const desktopPage = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    try {
      desktopPage.setDefaultTimeout(12_000);
      await desktopPage.goto(new URL("/properties?sort=price_asc", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (cssOverride) await desktopPage.addStyleTag({ content: cssOverride });
      await desktopPage.waitForFunction(() => document.querySelector(".pf-grid")?.children.length > 0);
      await desktopPage.waitForTimeout(500);
      const listButton = desktopPage.locator('.pf-views button[aria-label="نمایش فهرستی فایل‌ها"]').first();
      await listButton.waitFor({ state: "visible" });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
      await desktopPage.waitForFunction(() => document.querySelector(".pf-grid")?.classList.contains("is-list-view"));
      const desktopGeometry = await desktopPage.locator(".pf-grid.is-list-view > .pcard").first().evaluate((card) => {
        const rect = card.getBoundingClientRect();
        const image = card.querySelector(".pcard-media > .pcard-image-link")?.getBoundingClientRect();
        const link = card.querySelector(":scope > .pcard-link");
        const linkRect = link?.getBoundingClientRect();
        const actions = card.querySelector(".pcard-actions");
        return {
          cardHeight: rect.height,
          imageHeight: image?.height ?? 0,
          linkWidth: linkRect?.width ?? 0,
          linkDisplay: link ? getComputedStyle(link).display : "missing",
          actionsDisplay: actions ? getComputedStyle(actions).display : "missing",
        };
      });
      if (desktopGeometry.cardHeight <= 132 || desktopGeometry.imageHeight <= 132 || desktopGeometry.linkWidth <= 0 || desktopGeometry.linkDisplay === "none") {
        failures.push(`${viewport.width}px desktop list view was affected by mobile rules: ${JSON.stringify(desktopGeometry)}`);
      }
    } catch (error) {
      failures.push(`${viewport.width}px desktop list-view regression: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await desktopPage.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, viewports: results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
