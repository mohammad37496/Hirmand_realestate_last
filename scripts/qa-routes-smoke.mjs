#!/usr/bin/env node
/**
 * Cross-route smoke check.
 *
 * A change to a shared stylesheet (styles.css tokens) or to the root document
 * can break any route, not just the one being redesigned. This walks the main
 * public routes and reports, per route: HTTP status, whether the root has real
 * visible text, the count of h1s, and any uncaught console/page error.
 *
 *   node scripts/qa-routes-smoke.mjs [width]
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const width = Number(process.argv[2] ?? 1440);

const ROUTES = [
  "/",
  "/properties",
  "/consultants",
  "/tools",
  "/budget-match",
  "/favorites",
  "/compare",
  "/tracking",
];

const IGNORE =
  /webgl|WebGL|webglcontextcreationerror|Failed to initialize WebGL|BindToCurrentSequence|\/api\/music|Failed to load resource|\/api\/analytics/i;

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const rows = [];

for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  let status = 0;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = res?.status() ?? 0;
    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1800);
  } catch (err) {
    rows.push({ route, ok: false, note: "navigation failed: " + err.message.split("\n")[0] });
    await page.close();
    continue;
  }

  const facts = await page.evaluate(() => {
    const root = document.querySelector("main, #root, body");
    const text = (root?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      textLen: text.length,
      h1: document.querySelectorAll("h1").length,
      dark: (() => {
        const lum = (r, g, b) => {
          const f = (c) => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const found = new Set();
        for (const el of document.querySelectorAll("main *, main")) {
          const r = el.getBoundingClientRect();
          if (r.width < 140 || r.height < 50) continue;
          const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
          if (!m) continue;
          const [rr, gg, bb, aa = "1"] = m.map(Number);
          if (aa === 0 || lum(rr, gg, bb) >= 0.22) continue;
          const max = Math.max(rr, gg, bb);
          const min = Math.min(rr, gg, bb);
          if (max === 0 || (max - min) / max > 0.25) continue; // brand hue
          found.add(
            (typeof el.className === "string" ? el.className : "")
              .split(/\s+/)[0] || el.tagName.toLowerCase(),
          );
        }
        return [...found];
      })(),
    };
  });

  const realErrors = errors.filter((e) => !IGNORE.test(e));
  const problems = [];
  if (status >= 400) problems.push(`status ${status}`);
  if (facts.textLen < 40) problems.push(`only ${facts.textLen} chars of text`);
  if (facts.h1 !== 1) problems.push(`${facts.h1} h1 elements`);
  if (facts.dark.length) problems.push(`dark slabs: ${facts.dark.join(", ")}`);
  if (realErrors.length) problems.push(`console: ${realErrors.slice(0, 1).join(" | ").slice(0, 120)}`);

  rows.push({ route, ok: problems.length === 0, status, textLen: facts.textLen, h1: facts.h1, problems });
  await page.close();
}

await browser.close();
for (const r of rows) {
  console.log(
    (r.ok ? "PASS " : "FAIL ") +
      r.route.padEnd(16) +
      `status=${r.status} text=${r.textLen} h1=${r.h1}` +
      (r.problems.length ? "  — " + r.problems.join("; ") : ""),
  );
}
process.exitCode = rows.some((r) => !r.ok) ? 1 : 0;
