/**
 * Lightweight audit for /properties/$slug rendering + console health at one
 * viewport width. Usage: node scripts/qa-detail-audit.mjs <width> <height> [--full]
 * Prints PASS/FAIL lines and saves a screenshot under screenshots/.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const args = process.argv.slice(2);
const width = Number(args[0] ?? 1280);
const height = Number(args[1] ?? 844);
const full = args.includes("--full");

// Pick the canonical slug from the listing page so the audit tracks whatever
// data the dev environment currently has.
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
const httpErrors = [];
page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && httpErrors.push(`${r.status()} ${r.url()}`));
page.on("browser", () => void 0);

await page.goto(BASE + "/properties", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
const slug =
  (await page.evaluate(() => {
    const link = document.querySelector('[data-property-link="true"]') ?? document.querySelector("a[data-property-id]");
    if (link) {
      const id = link.getAttribute("data-property-id") ?? "";
      return id ? "/file/" + encodeURIComponent(id) : "";
    }
    const any = [...document.querySelectorAll('a[href^="/properties/"]')].map((a) => new URL(a.href, BASE).pathname);
    return any[0] ?? "";
  }).catch(() => "")) || "";
if (!slug) {
  console.log("FAIL no property link found on /properties listing");
  await browser.close();
  process.exit(1);
}

const errors2 = [];
const http2 = [];
page.on("pageerror", (e) => errors2.push(String(e?.message ?? e)));
page.on("console", (m) => m.type() === "error" && errors2.push(m.text()));
page.on("response", (r) => r.status() >= 400 && http2.push(`${r.status()} ${r.url()}`));
await page.goto(BASE + slug, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".property-detail-page", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const root = document.querySelector(".property-detail-page");
  const h1 = document.querySelector(".property-detail-page h1")?.textContent?.trim() ?? "";
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  const callLinks = [...document.querySelectorAll('a[href^="tel:"]')].length;
  const mapIframe = Boolean(document.querySelector("iframe"));
  const gutters = document.body.clientWidth;
  return { exists: Boolean(root), skeleton: root?.classList.contains("property-detail-skeleton") ?? false, h1, overflow, callLinks, mapIframe, gutters };
});

console.log(info.exists && !info.skeleton && info.h1 ? `PASS rendered h1: ${info.h1}` : "FAIL did not render detail page");
console.log(info.overflow ? "FAIL horizontal overflow" : "PASS no horizontal overflow");
console.log(info.callLinks > 0 ? "PASS call CTA present" : "FAIL call CTA missing");

const isEnvNoise = (msg) => /webgl|WebGL|Failed to initialize WebGL/i.test(msg) || /\/api\/music|\/api\/analytics\/track|-netln|hydrat/.test(msg) || /Failed to load resource/i.test(msg);
const appErrors = [...errors, ...errors2].filter((e) => !isEnvNoise(e));
console.log(appErrors.length ? `FAIL console errors: ${appErrors.slice(0, 4).join(" | ")}` : "PASS console clean");
const appHttp = [...httpErrors, ...http2].filter((u) => !/\/api\/analytics\/track|\/api\/music/.test(u));
console.log(appHttp.length ? `WARN non-2xx resources: ${appHttp.slice(0, 5).join(" | ")}` : "PASS no unexpected resource failures");

// Long-word vertical break audit: counts CJK/latin-subword single-letter wrap suspects is fragile;
// instead flag text nodes that render with fewer than 2 characters per visual line inside grids.
const wrapIssues = await page.evaluate(() => {
  const issues = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = (node.textContent ?? "").trim();
    if (!text || text.length < 3 || text.includes("\n")) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = range.getClientRects();
    if (lines.length >= 3) {
      const widths = [...lines].filter((r) => r.width < 34 && r.height > 4).length;
      if (widths >= 2) {
        issues.push(text.slice(0, 24));
      }
    }
  }
  return issues;
});
console.log(wrapIssues.length ? `FAIL suspicious narrow text wrapping: ${wrapIssues.slice(0, 6).join(" | ")}` : "PASS no 1–2 character line breaks");

await page.screenshot({ path: "/workspace/screenshots/property-audit-" + width + (full ? "-full" : "") + ".png", fullPage: full });
console.log("SHOT /workspace/screenshots/property-audit-" + width + (full ? "-full" : "") + ".png");

await browser.close();
