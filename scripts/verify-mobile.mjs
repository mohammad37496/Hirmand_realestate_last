import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
try {
  for (const [name, width, height] of [
    ["iphone-390", 390, 844],
    ["android-360", 360, 800],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));

    for (const route of ["/", "/properties"]) {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const report = await page.evaluate(() => {
        const out = {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          smallTap: [],
          tinyText: [],
        };
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim())
            .join(" ");
          if (ownText && parseFloat(cs.fontSize) < 11) out.tinyText.push(ownText.slice(0, 30));
          const interactive = el.matches('a,button,select,input,textarea,[role="button"],summary');
          if (interactive && rect.height < 40 && !el.closest("svg")) {
            const p = el.parentElement;
            const inline = p && getComputedStyle(p).display.includes("inline");
            if (!inline)
              out.smallTap.push(
                `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(rect.width)}x${Math.round(rect.height)} "${(el.textContent || "").trim().slice(0, 18)}"`,
              );
          }
        }
        return out;
      });
      console.log(`\n=== ${name} ${route} === overflow=${report.overflow}px tinyText=${report.tinyText.length} smallTap=${report.smallTap.length}`);
      report.smallTap.slice(0, 10).forEach((t) => console.log("  ", t));
      // key shots
      const tag = `${name}-${route.replace("/", "") || "home"}`;
      await page.screenshot({ path: `screenshots/v2-${tag}-top.png` });
      if (route === "/") {
        await page.evaluate(() => window.scrollTo(0, 3400));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `screenshots/v2-${tag}-types.png` });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `screenshots/v2-${tag}-footer.png` });
      } else {
        await page.evaluate(() => window.scrollTo(0, 480));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `screenshots/v2-${tag}-cards.png` });
      }
      // menu state
      if (route === "/") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.tap(".menu-toggle");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `screenshots/v2-${tag}-menu.png` });
        const menuLink = await page.evaluate(() => {
          const a = document.querySelector(".mobile-menu.is-open a");
          if (!a) return null;
          const r = a.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        console.log("menu link size:", JSON.stringify(menuLink));
        await page.tap(".menu-toggle");
        await page.waitForTimeout(300);
      }
      if (errors.length) {
        console.log("ERRORS:");
        errors.forEach((e) => console.log("  ", e.slice(0, 120)));
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("\nverify done");
