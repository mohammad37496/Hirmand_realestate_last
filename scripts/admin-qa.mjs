/**
 * Admin panel QA sweep.
 *
 * Signs in with HIRMAND_ADMIN_KEY, walks every panel section at desktop and
 * mobile widths, and reports console errors, failed requests, horizontal
 * overflow and stuck loading states. Screenshots land in screenshots/admin/.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { installAdminApiStubs, unshapedFallbacks } from "./admin-fixtures.mjs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:8080";
const KEY = process.env.HIRMAND_ADMIN_KEY || "";
const OUT = "screenshots/admin";

if (!KEY) {
  console.error("HIRMAND_ADMIN_KEY is required for the admin QA sweep.");
  process.exit(2);
}

const VIEWS = [
  { id: "dashboard", label: "داشبورد" },
  { id: "list", label: "فهرست فایل‌ها" },
  { id: "leads", label: "درخواست‌ها" },
  { id: "consultants", label: "مشاوران" },
  { id: "partners", label: "همکاران" },
  { id: "music", label: "موسیقی" },
  { id: "attendance", label: "حضور و غیاب" },
  { id: "divar", label: "فایل‌های دیوار" },
];

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

const results = [];
const stubbedAcrossViewports = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const environmentalErrors = [];

/**
 * Fills in only the endpoints the target server is missing. On the Vite dev
 * server that is the whole nitro API (so the panel can render at all); on a
 * production preview it is nothing, and the real routes answer.
 */
async function installApiStubs(page) {
  const stubbed = await installAdminApiStubs(page, BASE);
  stubbedAcrossViewports.push(...stubbed);
  return stubbed;
}

function attach(page, tag) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The dev overlay logs benign HMR noise; keep the real failures.
    if (text.includes("Download the React DevTools")) return;
    consoleErrors.push({ tag, text: text.slice(0, 400) });
  });
  page.on("pageerror", (error) => {
    const text = String(error);
    // Headless Chromium has no GPU, so the map component's WebGL layer always
    // throws on context creation. That is the harness, not the panel.
    if (text.includes("Could not create a WebGL context")) {
      environmentalErrors.push({ tag, text: text.slice(0, 120) });
      return;
    }
    pageErrors.push({ tag, text: text.slice(0, 400) });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (failure.includes("ERR_ABORTED")) return;
    failedRequests.push({ tag, url: request.url().slice(0, 200), failure });
  });
  // A 404 does not fire `requestfailed`, it only shows up as an opaque
  // "Failed to load resource" console line. Record the URL so the sweep can
  // tell a real broken asset reference apart from an expected miss.
  page.on("response", (response) => {
    if (response.status() < 400) return;
    badResponses.push({ tag, status: response.status(), url: response.url().slice(0, 200) });
  });
}

const ALIASES = {
  dashboard: ["داشبورد"],
  list: ["فایل‌های ملک", "فهرست"],
  leads: ["درخواست‌ها"],
  consultants: ["مشاوران"],
  partners: ["همکاران"],
  music: ["موسیقی"],
  attendance: ["حضور"],
  divar: ["دیوار"],
};

async function clickByLabel(page, selector, viewId) {
  const candidates = await page.locator(selector).all();
  for (const candidate of candidates) {
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = (await candidate.innerText().catch(() => "")) || "";
    const title = (await candidate.getAttribute("title").catch(() => null)) || "";
    if (ALIASES[viewId].some((alias) => text.includes(alias) || title.includes(alias))) {
      await candidate.click();
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
}

async function openView(page, view) {
  const isMobile = (page.viewportSize()?.width ?? 1440) <= 900;
  if (isMobile) {
    const trigger = page.locator(".admin-drawer-trigger");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(350);
    }
    return clickByLabel(page, ".admin-drawer .admin-nav-btn", view.id);
  }
  return clickByLabel(page, ".admin-sidebar-nav .admin-nav-btn", view.id);
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "fa-IR",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const tag = `${viewport.id}`;
    await installApiStubs(page);
    attach(page, tag);

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(600);

    const needsLogin = await page.locator('input[type="password"]').count();
    if (needsLogin) {
      await page.locator('input[type="password"]').fill(KEY);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2500);
    }

    const loginFailed = await page.locator('input[type="password"]').count();
    if (loginFailed) {
      console.error("Login failed — check HIRMAND_ADMIN_KEY.");
      results.push({ viewport: viewport.id, view: "login", ok: false, note: "login failed" });
      await context.close();
      continue;
    }

    for (const view of VIEWS) {
      const before = consoleErrors.length + pageErrors.length;
      const navigated = await openView(page, view);
      await page.waitForTimeout(900);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          offenders: Array.from(document.querySelectorAll("body *"))
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.right > doc.clientWidth + 2;
            })
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
        };
      });

      const text = await page.locator("body").innerText();
      const stuck = /در حال بارگذاری…|در حال ساخت داشبورد/.test(text);

      await page.screenshot({
        path: `${OUT}/${viewport.id}-${view.id}.png`,
        fullPage: false,
      });

      results.push({
        viewport: viewport.id,
        view: view.id,
        ok: navigated && overflow.scrollWidth <= overflow.clientWidth + 2 && !stuck,
        overflow: overflow.scrollWidth > overflow.clientWidth + 2,
        offenders: overflow.offenders,
        stuckLoading: stuck,
        newErrors: consoleErrors.length + pageErrors.length - before,
        bodyTextLength: text.length,
      });
    }

    // Property editor
    if (viewport.width <= 900) {
      const trigger = page.locator(".admin-drawer-trigger");
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.waitForTimeout(350);
      }
    }
    await page
      .locator(".admin-sidebar-nav .admin-nav-btn, .admin-drawer .admin-nav-btn", { hasText: "فایل جدید" })
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${viewport.id}-form.png`, fullPage: false });
    const formOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    results.push({
      viewport: viewport.id,
      view: "form",
      ok: formOverflow <= 2,
      overflow: formOverflow > 2,
    });

    await context.close();
  }

  await browser.close();

  // Which endpoints had to be filled in, so a report never implies the sweep
  // covered the real API when it did not.
  const stubbedRoutes = [...new Set(stubbedAcrossViewports)];

  const summary = {
    base: BASE,
    at: new Date().toISOString(),
    stubbedApiRoutes: stubbedRoutes,
    unshapedApiRoutes: [...unshapedFallbacks].sort(),
    results,
    consoleErrors: consoleErrors.slice(0, 25),
    pageErrors: pageErrors.slice(0, 25),
    failedRequests: failedRequests.slice(0, 25),
    badResponses: badResponses.slice(0, 25),
    environmentalErrors: environmentalErrors.slice(0, 5),
  };
  console.log(JSON.stringify(summary, null, 2));

  // `/api/music` and friends are nitro handlers: they only exist in the
  // production build, so the dev server 404s them by design. Anything else
  // that came back 4xx/5xx is a real broken reference.
  const unexpected = badResponses.filter((item) => !item.url.includes("/api/"));
  const failures = results.filter((item) => !item.ok);
  if (failures.length || pageErrors.length || unexpected.length) {
    process.exitCode = 1;
  }
}

await run();
