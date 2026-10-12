import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const route of ["/", "/properties"]) {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => {
      const out = {};
      const qa = document.querySelector(".quick-actions");
      if (qa) {
        const r = qa.getBoundingClientRect();
        out.quickActions = { bottom: Math.round(innerHeight - r.bottom), h: Math.round(r.height), fixed: getComputedStyle(qa).position };
        window.scrollTo(0, document.body.scrollHeight);
        const fr = document.querySelector(".footer")?.getBoundingClientRect();
        if (fr) out.footerVsBar = { footerBottom: Math.round(fr.bottom), viewportH: innerHeight, gap: Math.round(fr.bottom - r.top) };
        window.scrollTo(0, 0);
      }
      const hero = document.querySelector(".hero");
      if (hero) out.heroH = Math.round(hero.getBoundingClientRect().height);
      const search = document.querySelector(".hero-search");
      if (search) {
        const sr = search.getBoundingClientRect();
        out.heroSearch = { w: Math.round(sr.width), h: Math.round(sr.height), rows: getComputedStyle(search).gridTemplateRows };
      }
      const h1 = document.querySelector("h1");
      if (h1) out.h1 = { size: getComputedStyle(h1).fontSize, lh: getComputedStyle(h1).lineHeight };
      const cards = document.querySelectorAll(".property-card, .pf-card");
      out.cardCount = cards.length;
      if (cards[0]) {
        const cr = cards[0].getBoundingClientRect();
        out.card = { w: Math.round(cr.width), h: Math.round(cr.height) };
      }
      const pfGrid = document.querySelector(".pf-grid, .properties-grid");
      if (pfGrid) out.gridCols = getComputedStyle(pfGrid).gridTemplateColumns;
      const chipsWrap = document.querySelector(".pf-chips, .chip-row");
      if (chipsWrap) out.chipsScroll = { overflowX: getComputedStyle(chipsWrap).overflowX };
      out.bodyFont = getComputedStyle(document.body).fontSize;
      return out;
    });
    console.log(route, JSON.stringify(m, null, 1));
  }
  // property detail
  await page.goto(BASE + "/properties", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  const href = await page.evaluate(() => document.querySelector('a[href^="/properties/"]')?.getAttribute("href"));
  if (href) {
    await page.goto(BASE + href, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => {
      const gallery = document.querySelector(".property-gallery");
      return {
        galleryCols: gallery ? getComputedStyle(gallery).gridTemplateColumns : null,
        titleSize: (() => { const t = document.querySelector(".property-title, h1"); return t ? getComputedStyle(t).fontSize : null; })(),
      };
    });
    console.log(href, JSON.stringify(d));
  }
} finally {
  await browser.close();
}
