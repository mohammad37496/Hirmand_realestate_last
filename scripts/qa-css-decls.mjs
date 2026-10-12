#!/usr/bin/env node
/**
 * Reports which rule sets specific CSS properties on a selector, and which one
 * wins — the tool for "why is this box the wrong height?" questions.
 *
 *   node scripts/qa-css-decls.mjs <slug> <selector> <prop>[,<prop>...] [width]
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:8080";
const slug = process.argv[2] ?? "آپارتمان-تست-ناوبری-۱۴۰۵-browser-smoke";
const selector = process.argv[3] ?? ".property-gallery";
const props = (process.argv[4] ?? "height,min-height,max-height,aspect-ratio").split(",");
const width = Number(process.argv[5] ?? 1440);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(
  BASE + "/properties/" + encodeURIComponent(slug),
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await page
  .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 30000 })
  .catch(() => {});
await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);

const result = await page.evaluate(
  ([sel, want, vw]) => {
    const el = document.querySelector(sel);
    if (!el) return { error: "not found: " + sel };
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (!rules) continue;
      const walk = (list, media) => {
        for (const rule of list) {
          if (rule.type === CSSRule.MEDIA_RULES_LIST || rule.type === CSSRule.MEDIA_RULE) {
            walk(rule.cssRules, (rule.conditionText || "") + " ");
            continue;
          }
          if (!rule.selectorText) continue;
          let ok = false;
          try {
            ok = el.matches(rule.selectorText);
          } catch {
            ok = false;
          }
          if (!ok) continue;
          for (const p of want) {
            const v = rule.style.getPropertyValue(p);
            if (!v) continue;
            hits.push({
              prop: p,
              value: v,
              priority: rule.style.getPropertyPriority(p),
              file: (sheet.href || "inline").split("/").pop(),
              media: media.trim() || null,
              selector: rule.selectorText.slice(0, 90),
            });
          }
        }
      };
      walk(rules, "");
    }
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      viewport: vw,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      computed: Object.fromEntries(want.map((p) => [p, s.getPropertyValue(p)])),
      hits,
    };
  },
  [selector, props, width],
);

console.log(JSON.stringify(result, null, 1));
await browser.close();
