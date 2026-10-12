import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const shots = [
    { name: "home-top", route: "/", scroll: 0 },
    { name: "home-hero-mid", route: "/", scroll: 700 },
    { name: "home-services", route: "/", scroll: 1500 },
    { name: "home-types", route: "/", scroll: 3400 },
    { name: "home-inquiry", route: "/", scroll: 7200 },
    { name: "home-footer", route: "/", scroll: 99999 },
    { name: "props-top", route: "/properties", scroll: 0 },
    { name: "props-cards", route: "/properties", scroll: 500 },
  ];
  for (const s of shots) {
    await page.goto(BASE + s.route, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (s.scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), s.scroll);
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `screenshots/m-${s.name}.png` });
  }
  // mobile menu open state
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  await page.tap(".menu-toggle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "screenshots/m-menu-open.png" });
  console.log("shots done");
} finally {
  await browser.close();
}
