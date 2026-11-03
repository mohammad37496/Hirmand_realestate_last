#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.MOBILE_AUDIT_BASE_URL || "https://hirmandrealestate.ir";
const outputDir = path.resolve(process.env.MOBILE_AUDIT_BASELINE_DIR || "screenshots/mobile-device-audit/before-production");
const androidUserAgent = "Mozilla/5.0 (Linux; Android 9; SM-J730F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const iphoneUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const profiles = [
  { id: "galaxy-j7-pro", viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: androidUserAgent },
  { id: "iphone-13", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: iphoneUserAgent },
  { id: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

fs.mkdirSync(outputDir, { recursive: true });
const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-extensions"] };
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch {
  browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
}

const results = [];
let routes = [];
try {
  let propertyHref = process.env.MOBILE_AUDIT_PROPERTY_PATH || "";
  if (!propertyHref) {
    const discoveryPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const listingResponse = await discoveryPage.goto(new URL("/properties", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!listingResponse || listingResponse.status() >= 400) throw new Error(`Production /properties returned HTTP ${listingResponse?.status() ?? "no response"}`);
    propertyHref = await discoveryPage.locator('a[href^="/properties/"]').first().getAttribute("href") || "";
    await discoveryPage.close();
  }
  if (!propertyHref) throw new Error("Could not find a public property detail link in the production listing page");
  routes = [
    { id: "home", path: "/" },
    { id: "properties", path: "/properties" },
    { id: "property-detail", path: propertyHref },
    { id: "budget-match", path: "/budget-match" },
    { id: "submit-property", path: "/submit-property" },
  ];
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
      colorScheme: "light",
      ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    });
    for (const route of routes) {
      const page = await context.newPage();
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
      let screenshot = null;
      let geometry = null;
      try {
        const response = await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
        status = response?.status() ?? null;
        await page.waitForTimeout(700);
        await page.evaluate(() => document.fonts?.ready);
        geometry = await page.evaluate(() => ({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          // clientWidth excludes a vertical scrollbar, which can be 8px on
          // the RTL inline-start edge. Compare against the layout viewport so
          // a normal scrollbar is not misreported as horizontal overflow.
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          clientWidth: document.documentElement.clientWidth,
        }));
        const filename = `${route.id}-${profile.viewport.width}x${profile.viewport.height}.png`;
        screenshot = path.join(outputDir, filename);
        await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
      } catch (error) {
        pageErrors.push(error instanceof Error ? error.message : String(error));
      }
      results.push({
        profile: profile.id,
        route: route.path,
        status,
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        userAgent: profile.userAgent || "Chromium default desktop user agent",
        geometry,
        screenshot: screenshot ? path.relative(process.cwd(), screenshot).replace(/\\/g, "/") : null,
        consoleErrors,
        pageErrors,
        failedImages,
      });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  source: "live production before the pending responsive-audit changes are merged",
  browserEngine: "Chromium",
  profiles: profiles.map(({ id, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent }) => ({ id, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent: userAgent || "Chromium default desktop user agent" })),
  routes,
  checks: results.length,
  failureCount: results.filter((item) => item.status == null || item.status >= 400 || item.pageErrors.length || item.failedImages.length || item.geometry?.horizontalOverflow).length,
  results,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`[mobile-audit-baseline] ${results.length} production screenshots saved to ${outputDir}`);
console.log(`[mobile-audit-baseline] ${report.failureCount} route/profile finding(s)`);
if (report.failureCount) process.exitCode = 1;
