#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL;
if (!baseUrl) throw new Error("QA_BASE_URL is required; run through test:site-device-matrix");
const outputDir = path.resolve(process.env.QA_DEVICE_SCREENSHOT_DIR || "screenshots/mobile-device-audit/device-profiles");
const reportPath = path.resolve(process.env.QA_DEVICE_REPORT_PATH || path.join(outputDir, "report.json"));
const captureScreenshots = process.env.QA_DEVICE_SCREENSHOTS !== "0";
const chromeVersion = "130.0.0.0";

const devices = [
  { id: "samsung-galaxy-j7-pro", name: "Samsung Galaxy J7 Pro", os: "Android 9", token: "SM-J730F", viewport: [360, 640], dpr: 3 },
  { id: "samsung-galaxy-j7-2016", name: "Samsung Galaxy J7 2016", os: "Android 8.1", token: "SM-J710F", viewport: [360, 640], dpr: 3 },
  { id: "samsung-galaxy-a10", name: "Samsung Galaxy A10", os: "Android 9", token: "SM-A105F", viewport: [360, 760], dpr: 2 },
  { id: "samsung-galaxy-a12", name: "Samsung Galaxy A12", os: "Android 11", token: "SM-A125F", viewport: [360, 800], dpr: 2 },
  { id: "samsung-galaxy-a14", name: "Samsung Galaxy A14", os: "Android 13", token: "SM-A145F", viewport: [412, 915], dpr: 2.625 },
  { id: "samsung-galaxy-a15", name: "Samsung Galaxy A15", os: "Android 14", token: "SM-A155F", viewport: [412, 915], dpr: 2.625 },
  { id: "samsung-galaxy-a32", name: "Samsung Galaxy A32", os: "Android 11", token: "SM-A325F", viewport: [360, 800], dpr: 2.75 },
  { id: "samsung-galaxy-a52", name: "Samsung Galaxy A52", os: "Android 11", token: "SM-A525F", viewport: [384, 854], dpr: 2.8125 },
  { id: "samsung-galaxy-s20", name: "Samsung Galaxy S20", os: "Android 13", token: "SM-G981B", viewport: [360, 800], dpr: 3 },
  { id: "samsung-galaxy-s21", name: "Samsung Galaxy S21", os: "Android 14", token: "SM-G991B", viewport: [360, 800], dpr: 3 },
  { id: "samsung-galaxy-s23", name: "Samsung Galaxy S23", os: "Android 14", token: "SM-S911B", viewport: [360, 780], dpr: 3 },
  { id: "samsung-galaxy-s24", name: "Samsung Galaxy S24", os: "Android 14", token: "SM-S921B", viewport: [360, 780], dpr: 3 },
  { id: "xiaomi-redmi-note-8", name: "Xiaomi Redmi Note 8", os: "Android 10", token: "Redmi Note 8", viewport: [393, 851], dpr: 2.75 },
  { id: "xiaomi-redmi-note-9", name: "Xiaomi Redmi Note 9", os: "Android 10", token: "Redmi Note 9", viewport: [393, 873], dpr: 2.75 },
  { id: "xiaomi-redmi-note-10", name: "Xiaomi Redmi Note 10", os: "Android 12", token: "Redmi Note 10", viewport: [393, 873], dpr: 2.75 },
  { id: "xiaomi-redmi-note-12", name: "Xiaomi Redmi Note 12", os: "Android 13", token: "Redmi Note 12", viewport: [393, 873], dpr: 2.75 },
  { id: "xiaomi-redmi-note-13", name: "Xiaomi Redmi Note 13", os: "Android 14", token: "Redmi Note 13", viewport: [393, 873], dpr: 2.75 },
  { id: "poco-x3", name: "Poco X3", os: "Android 12", token: "POCO X3", viewport: [393, 873], dpr: 2.75 },
  { id: "poco-x5", name: "Poco X5", os: "Android 13", token: "POCO X5", viewport: [393, 873], dpr: 2.75 },
  { id: "google-pixel-6", name: "Google Pixel 6", os: "Android 15", token: "Pixel 6", viewport: [412, 915], dpr: 2.625 },
  { id: "google-pixel-7", name: "Google Pixel 7", os: "Android 15", token: "Pixel 7", viewport: [412, 915], dpr: 2.625 },
  { id: "iphone-se", name: "iPhone SE", os: "iOS 15.8", token: "iPhone", viewport: [375, 667], dpr: 2, ios: true },
  { id: "iphone-11", name: "iPhone 11", os: "iOS 16.7", token: "iPhone", viewport: [414, 896], dpr: 2, ios: true },
  { id: "iphone-12", name: "iPhone 12", os: "iOS 17.0", token: "iPhone", viewport: [390, 844], dpr: 3, ios: true },
  { id: "iphone-13", name: "iPhone 13", os: "iOS 17.0", token: "iPhone", viewport: [390, 844], dpr: 3, ios: true },
  { id: "iphone-14", name: "iPhone 14", os: "iOS 17.0", token: "iPhone", viewport: [390, 844], dpr: 3, ios: true },
  { id: "iphone-15", name: "iPhone 15", os: "iOS 18.0", token: "iPhone", viewport: [393, 852], dpr: 3, ios: true },
];

function userAgent(device) {
  if (device.ios) {
    const version = device.os.replace("iOS ", "").replaceAll(".", "_");
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`;
  }
  return `Mozilla/5.0 (Linux; ${device.os}; ${device.token}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
}

const routes = [
  { id: "home", path: "/" },
  { id: "properties", path: "/properties" },
  { id: "property-detail", path: "/properties/qa-apartment-long-title" },
  { id: "budget-match", path: "/budget-match" },
  { id: "submit-property", path: "/submit-property" },
];
const selectedDevices = devices.filter((device) => !process.env.QA_DEVICE_FILTER || device.id.includes(process.env.QA_DEVICE_FILTER));
const selectedOrientations = ["portrait", "landscape"].filter((orientation) => !process.env.QA_DEVICE_ORIENTATION || orientation === process.env.QA_DEVICE_ORIENTATION);
const selectedRoutes = routes.filter((route) => !process.env.QA_DEVICE_ROUTE_FILTER || route.id === process.env.QA_DEVICE_ROUTE_FILTER);
if (!selectedDevices.length || !selectedOrientations.length || !selectedRoutes.length) {
  throw new Error("Device profile filters did not match any device, orientation, or route");
}

if (captureScreenshots) fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-extensions", "--hide-scrollbars"] };
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch {
  browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
}

const results = [];
const failures = [];
try {
  for (const device of selectedDevices) {
    for (const orientation of selectedOrientations) {
      const [portraitWidth, portraitHeight] = device.viewport;
      const viewport = orientation === "portrait"
        ? { width: portraitWidth, height: portraitHeight }
        : { width: portraitHeight, height: portraitWidth };
      const ua = userAgent(device);
      const context = await browser.newContext({
        viewport,
        screen: viewport,
        deviceScaleFactor: device.dpr,
        isMobile: true,
        hasTouch: true,
        locale: "fa-IR",
        timezoneId: "Asia/Tehran",
        colorScheme: "light",
        userAgent: ua,
      });
      for (const route of selectedRoutes) {
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const consoleErrors = [];
        const pageErrors = [];
        const failedImages = [];
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("response", (response) => {
          if (response.request().resourceType() === "image" && response.status() >= 400) {
            failedImages.push({ url: response.url(), status: response.status() });
          }
        });
        let status = null;
        let geometry = null;
        let cardAudit = null;
        let galleryAudit = null;
        let screenshot = null;
        try {
          const response = await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
          status = response?.status() ?? null;
          await page.waitForTimeout(300);
          await page.evaluate(() => document.fonts?.ready);
          geometry = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            outerWidth: window.outerWidth,
            visualViewport: window.visualViewport ? {
              width: Math.round(window.visualViewport.width * 100) / 100,
              height: Math.round(window.visualViewport.height * 100) / 100,
              scale: window.visualViewport.scale,
              offsetLeft: Math.round(window.visualViewport.offsetLeft * 100) / 100,
            } : null,
            screen: { width: window.screen.width, height: window.screen.height, availWidth: window.screen.availWidth },
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            documentRectWidth: Math.round(document.documentElement.getBoundingClientRect().width * 100) / 100,
            rootStyle: {
              direction: getComputedStyle(document.documentElement).direction,
              scrollbarGutter: getComputedStyle(document.documentElement).scrollbarGutter,
              overflowX: getComputedStyle(document.documentElement).overflowX,
              landscapeTouchMedia: matchMedia("(orientation: landscape) and (max-height: 420px) and (pointer: coarse)").matches,
              propertyDetailMatches: Boolean(document.querySelector("html:has(main#top.property-detail-page.hd-property-detail-v2)")),
              scrollbarRules: (() => {
                const matches = [];
                const visit = (rules, active = true) => {
                  for (const rule of rules) {
                    if (rule.cssRules) {
                      const mediaActive = rule.conditionText ? matchMedia(rule.conditionText).matches : active;
                      visit(rule.cssRules, active && mediaActive);
                      continue;
                    }
                    if (!active || !rule.selectorText || !rule.style?.getPropertyValue("scrollbar-gutter")) continue;
                    let selectorMatches = false;
                    try {
                      selectorMatches = document.querySelector(rule.selectorText) !== null;
                    } catch {
                      // Ignore selectors that this browser cannot parse.
                    }
                    if (selectorMatches) matches.push({
                      selector: rule.selectorText,
                      value: rule.style.getPropertyValue("scrollbar-gutter"),
                      priority: rule.style.getPropertyPriority("scrollbar-gutter"),
                      cssText: rule.cssText,
                    });
                  }
                };
                for (const sheet of document.styleSheets) {
                  try {
                    visit(sheet.cssRules);
                  } catch {
                    // Cross-origin stylesheets do not expose cssRules.
                  }
                }
                return matches;
              })(),
            },
            body: {
              width: Math.round(document.body.getBoundingClientRect().width * 100) / 100,
              scrollWidth: document.body.scrollWidth,
              clientWidth: document.body.clientWidth,
              overflowX: getComputedStyle(document.body).overflowX,
            },
            main: (() => {
              const element = document.querySelector("main#top");
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                left: Math.round(rect.left * 100) / 100,
                right: Math.round(rect.right * 100) / 100,
                width: Math.round(rect.width * 100) / 100,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                widthStyle: style.width,
                minWidth: style.minWidth,
                maxWidth: style.maxWidth,
                marginInlineStart: style.marginInlineStart,
                marginInlineEnd: style.marginInlineEnd,
              };
            })(),
            bodyChildren: [...document.body.children].map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || "",
                className: typeof element.className === "string" ? element.className : "",
                left: Math.round(rect.left * 100) / 100,
                right: Math.round(rect.right * 100) / 100,
                width: Math.round(rect.width * 100) / 100,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                position: getComputedStyle(element).position,
                insetInlineStart: getComputedStyle(element).insetInlineStart,
                insetInlineEnd: getComputedStyle(element).insetInlineEnd,
              };
            }),
            devicePixelRatio: window.devicePixelRatio,
            pointerCoarse: matchMedia("(pointer: coarse)").matches,
            // clientWidth excludes a vertical scrollbar (including the 8px
            // left-side gutter used by RTL pages in desktop Chromium emulation).
            // Compare with the layout viewport instead, otherwise a normal
            // vertical scrollbar is misreported as horizontal document overflow.
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            fontStatus: document.fonts?.status || "unknown",
            overflowElements: document.documentElement.scrollWidth > window.innerWidth + 1
              ? [...document.querySelectorAll("body *")].map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tag: element.tagName.toLowerCase(),
                  className: typeof element.className === "string" ? element.className : "",
                  id: element.id || "",
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                  position: getComputedStyle(element).position,
                  overflowX: getComputedStyle(element).overflowX,
                };
              }).filter((element) => element.width > 0 && (
                element.right > window.innerWidth + 1 ||
                element.left < -1 ||
                element.scrollWidth > element.clientWidth + 1
              )).sort((a, b) => Math.max(b.right - window.innerWidth, b.scrollWidth - b.clientWidth, -b.left) - Math.max(a.right - window.innerWidth, a.scrollWidth - a.clientWidth, -a.left)).slice(0, 16)
              : [],
          }));
          if (route.id === "properties") {
            const cardAudits = await page.locator(".pcard-actions").evaluateAll((containers) => containers.map((container) => {
              const actions = [...container.querySelectorAll(".property-action")];
              const boxes = actions.map((node) => {
                const rect = node.getBoundingClientRect();
                return { width: Math.round(rect.width), height: Math.round(rect.height), label: node.getAttribute("aria-label") || node.textContent?.trim() || "" };
              });
              return {
                actionCount: boxes.length,
                minWidth: boxes.length ? Math.min(...boxes.map((box) => box.width)) : null,
                minHeight: boxes.length ? Math.min(...boxes.map((box) => box.height)) : null,
                actions: boxes,
              };
            }));
            cardAudit = {
              cards: cardAudits.length,
              perCard: cardAudits,
            };
            if (cardAudit.cards < 3 || cardAudits.some((card) => card.actionCount < 8 || card.minWidth < 44 || card.minHeight < 44)) {
              failures.push(`${device.name} ${orientation} /properties: each of the three fixture cards must expose eight 44px actions; got ${JSON.stringify(cardAudit)}`);
            }
          }
          if (route.id === "property-detail") {
            const galleryMain = page.locator(".property-gallery.hd-gallery > .property-gallery-main.hd-gallery-main");
            const thumbnails = page.locator(".hd-gallery-thumb");
            const thumbnailCount = await thumbnails.count();
            if (!(await galleryMain.isVisible().catch(() => false)) || thumbnailCount < 2) {
              failures.push(`${device.name} ${orientation} property detail: expected a visible main gallery and at least two fixture thumbnails; found main=${await galleryMain.count()}, thumbnails=${thumbnailCount}`);
            } else {
              await thumbnails.nth(1).scrollIntoViewIfNeeded();
              await thumbnails.nth(1).tap();
              galleryAudit = await thumbnails.nth(1).evaluate((button) => {
                const rect = button.getBoundingClientRect();
                const gallery = button.closest(".property-gallery.hd-gallery");
                const galleryRect = gallery?.getBoundingClientRect();
                const rail = gallery?.querySelector(".property-gallery-thumbs.hd-gallery-thumbs");
                const railRect = rail?.getBoundingClientRect();
                const actionBar = document.querySelector(".hd-mobile-actions");
                const actionBarTop = actionBar?.getBoundingClientRect().top ?? window.innerHeight;
                const preview = button.querySelector(".hd-gallery-thumb-preview")?.getBoundingClientRect();
                const shortLandscape = matchMedia("(orientation: landscape) and (max-height: 420px) and (pointer: coarse)").matches;
                return {
                  top: Math.round(rect.top),
                  bottom: Math.round(rect.bottom),
                  actionBarTop: Math.round(actionBarTop),
                  viewportHeight: window.innerHeight,
                  thumbnailCount: document.querySelectorAll(".hd-gallery-thumb").length,
                  selected: button.getAttribute("aria-pressed") === "true" && button.classList.contains("is-active"),
                  previewWidth: Math.round(preview?.width ?? 0),
                  previewHeight: Math.round(preview?.height ?? 0),
                  shortLandscape,
                  railWithinGallery: Boolean(galleryRect && railRect && railRect.left >= galleryRect.left - 1 && railRect.right <= galleryRect.right + 1 && railRect.top >= galleryRect.top - 1 && railRect.bottom <= galleryRect.bottom + 1),
                  railHorizontalOverflow: Boolean(rail && rail.scrollWidth > rail.clientWidth + 1),
                };
              });
              if (galleryAudit.top < -1 || galleryAudit.bottom > galleryAudit.actionBarTop - 2 || !galleryAudit.selected || galleryAudit.previewWidth < 40 || galleryAudit.previewHeight < 40 || (galleryAudit.shortLandscape && (!galleryAudit.railWithinGallery || galleryAudit.railHorizontalOverflow))) {
                failures.push(`${device.name} ${orientation} gallery thumbnail is hidden, clipped, or cannot be selected above the bottom action bar: ${JSON.stringify(galleryAudit)}`);
              }
            }
          }
          if (geometry.horizontalOverflow) failures.push(`${device.name} ${orientation} ${route.path}: horizontal overflow ${geometry.documentWidth}px > ${geometry.viewportWidth}px layout viewport`);
          if (!geometry.pointerCoarse) failures.push(`${device.name} ${orientation} ${route.path}: coarse pointer emulation is not active`);
          if (status == null || status >= 400) failures.push(`${device.name} ${orientation} ${route.path}: HTTP ${status ?? "no response"}`);
          if (pageErrors.length) failures.push(`${device.name} ${orientation} ${route.path}: page errors ${pageErrors.join(" | ")}`);
          if (consoleErrors.length) failures.push(`${device.name} ${orientation} ${route.path}: console errors ${consoleErrors.join(" | ")}`);
          if (failedImages.length) failures.push(`${device.name} ${orientation} ${route.path}: failed images ${JSON.stringify(failedImages)}`);
          if (captureScreenshots) {
            const deviceDir = path.join(outputDir, `${device.id}-${orientation}`);
            fs.mkdirSync(deviceDir, { recursive: true });
            screenshot = path.join(deviceDir, `${route.id}-${viewport.width}x${viewport.height}.png`);
            await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
          }
        } catch (error) {
          pageErrors.push(error instanceof Error ? error.message : String(error));
          failures.push(`${device.name} ${orientation} ${route.path}: ${pageErrors.at(-1)}`);
        }
        results.push({
          device: device.name,
          deviceId: device.id,
          platform: device.os,
          orientation,
          viewport,
          deviceScaleFactor: device.dpr,
          browserEngine: "Chromium",
          userAgent: ua,
          route: route.path,
          status,
          geometry,
          cardAudit,
          galleryAudit,
          screenshot: screenshot ? path.relative(process.cwd(), screenshot).replace(/\\/g, "/") : null,
          consoleErrors,
          pageErrors,
          failedImages,
        });
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browserEngine: "Chromium (installed Chrome fallback when bundled Chromium is unavailable)",
  physicalDevicesConnected: false,
  deviceCount: selectedDevices.length,
  orientations: selectedOrientations,
  routeCountPerOrientation: selectedRoutes.length,
  checks: results.length,
  failureCount: failures.length,
  devices: devices.map((device) => ({ ...device, userAgent: userAgent(device) })),
  routes,
  failures,
  results,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(`[mobile-device-profiles] ${selectedDevices.length} devices × ${selectedOrientations.length} orientations × ${selectedRoutes.length} routes = ${results.length} checks`);
if (!captureScreenshots) console.log("[mobile-device-profiles] screenshot capture disabled for this metrics-only verification run");
console.log(`[mobile-device-profiles] ${failures.length} failure(s); report: ${reportPath}`);
if (failures.length) {
  for (const failure of failures.slice(0, 30)) console.error(`[mobile-device-profiles] ${failure}`);
  process.exitCode = 1;
}
