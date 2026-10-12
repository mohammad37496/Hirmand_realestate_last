/**
 * Visual + accessibility audit for the admin panel.
 *
 * Screenshots cannot be eyeballed here, so the checks that matter are
 * measured in the browser: text contrast against the real painted background,
 * accessible names on every control, touch-target sizes, and whether the fixed
 * chrome (topbar / sticky save bar / mobile nav) overlaps content.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { installAdminApiStubs } from "./admin-fixtures.mjs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:8080";
const KEY = process.env.HIRMAND_ADMIN_KEY || "";
const OUT = "screenshots/admin";

const VIEWS = [
  { id: "dashboard", label: "داشبورد" },
  { id: "list", label: "فایل‌های ملک" },
  { id: "leads", label: "درخواست‌ها" },
  { id: "consultants", label: "مشاوران" },
  { id: "partners", label: "همکاران" },
  { id: "music", label: "موسیقی" },
  { id: "attendance", label: "حضور و غیاب" },
  { id: "divar", label: "فایل‌های دیوار" },
  { id: "form", label: "افزودن فایل" },
];

/**
 * Viewport matrix.
 *
 * `QA_VIEWPORTS` takes `WxH` entries so a run can be split into chunks that fit
 * in a CI timeout. `QA_ZOOM` emulates the Windows Chrome zoom levels: browser
 * zoom is a layout change, so 125% on a 1366px window lays out exactly like a
 * 1093px-wide viewport — which is what the media queries actually see.
 */
const DEFAULT_VIEWPORTS = [
  { id: "w320", width: 320, height: 568 },
  { id: "w360", width: 360, height: 800 },
  { id: "w375", width: 375, height: 667 },
  { id: "w390", width: 390, height: 844 },
  { id: "w412", width: 412, height: 915 },
  { id: "w430", width: 430, height: 932 },
  { id: "w768", width: 768, height: 1024 },
  { id: "w820", width: 820, height: 1180 },
  { id: "w1024", width: 1024, height: 768 },
  { id: "w1280", width: 1280, height: 800 },
  { id: "w1366", width: 1366, height: 768 },
  { id: "w1440", width: 1440, height: 900 },
  { id: "w1536", width: 1536, height: 864 },
  { id: "w1920", width: 1920, height: 1080 },
];

function parseViewports() {
  const raw = process.env.QA_VIEWPORTS;
  // "none" lets a zoom-only run skip the default matrix.
  if (!raw) return DEFAULT_VIEWPORTS;
  if (raw.trim() === "none") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [width, height] = entry.split("x").map(Number);
      return { id: `w${width}`, width, height: height || 900 };
    });
}

function parseZooms() {
  const raw = process.env.QA_ZOOM;
  if (!raw) return [];
  const windowWidth = Number(process.env.QA_ZOOM_WINDOW_WIDTH || 1366);
  const windowHeight = Number(process.env.QA_ZOOM_WINDOW_HEIGHT || 768);
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const factor = Number(entry.replace("%", "")) / 100;
      return {
        id: `zoom${Math.round(factor * 100)}`,
        zoom: entry,
        factor,
        width: Math.round(windowWidth / factor),
        height: Math.round(windowHeight / factor),
      };
    });
}

const ALIASES = {
  dashboard: ["داشبورد"],
  list: ["فایل‌های ملک", "فهرست"],
  leads: ["درخواست‌ها"],
  consultants: ["مشاوران"],
  partners: ["همکاران"],
  music: ["موسیقی"],
  attendance: ["حضور و غیاب"],
  divar: ["فایل‌های دیوار"],
  form: ["فایل جدید"],
};

const AUDIT = () => {
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => Number(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  };

  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  // Alpha compositing must keep the residual opacity: collapsing `a` to 1 on
  // every layer turns two stacked 3% overlays into near-black.
  const blend = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  };

  const contrast = (fg, bg) => {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * Resolves the colour actually painted behind an element.
   *
   * Gradients matter: the admin sidebar and topbar paint their background
   * through `background-image`, so `backgroundColor` is transparent and a naive
   * walk up the tree reports the light page background instead. Use the first
   * opaque gradient stop as the surface colour.
   */
  const gradientStop = (image) => {
    if (!image || image === "none") return null;
    if (!/gradient/i.test(image)) return null;
    const matches = image.match(/rgba?\([^)]+\)/g);
    if (!matches) return null;
    for (const candidate of matches) {
      const color = parse(candidate);
      if (color && color.a > 0.05) return color;
    }
    return null;
  };

  const effectiveBackground = (element) => {
    let node = element;
    let acc = null;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const color = parse(style.backgroundColor);
      const gradient = gradientStop(style.backgroundImage);
      if ((color && color.a > 0) || gradient) {
        acc = acc ? blend(acc, gradient ?? color) : (gradient ?? color);
        if (acc.a >= 0.99) return acc;
      }
      node = node.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor) || {
      r: 255, g: 255, b: 255, a: 1,
    };
    return acc ? blend(acc, body) : body;
  };

  const issues = { contrast: [], unnamed: [], smallTargets: [], overlaps: [] };
  const geometry = {
    horizontalScroll: false,
    scrollWidth: 0,
    innerWidth: 0,
    offViewport: [],
    clipped: [],
    chrome: {},
  };

  // --- text contrast ------------------------------------------------------
  const textNodes = Array.from(
    document.querySelectorAll(
      "body *:not(script):not(style):not(svg):not(path)",
    ),
  ).filter((el) => {
    if (!el.textContent?.trim()) return false;
    const hasElementChild = Array.from(el.children).some((child) =>
      child.textContent?.trim(),
    );
    return !hasElementChild;
  });

  // No cap here: the dashboard holds well over a thousand text nodes and a
  // low cap made the finding set depend on the viewport width rather than on
  // the panel.
  for (const element of textNodes) {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const fgRaw = parse(style.color);
    if (!fgRaw || fgRaw.a === 0) continue;
    const bg = effectiveBackground(element);
    const fg = blend(fgRaw, bg);
    const ratio = contrast(fg, bg);

    const size = parseFloat(style.fontSize) || 14;
    const weight = Number(style.fontWeight) || 400;
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
    const min = isLarge ? 3 : 4.5;

    if (ratio + 0.02 < min) {
      issues.contrast.push({
        selector: `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 70)}`,
        text: element.textContent.trim().slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        min,
        color: style.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }

  // --- accessible names ---------------------------------------------------
  /**
   * The area a finger can actually hit.
   *
   * A small control often reaches 44px without being 44px: an absolutely
   * positioned `::after` overlay, or a `<label>` wrapped around it that toggles
   * it on tap. `getBoundingClientRect` on the element knows nothing about
   * either, so measuring the bare box reports a 18px checkbox as a failure
   * when its real target is 44px. Union in whatever genuinely enlarges it.
   */
  const hitArea = (element) => {
    const rect = element.getBoundingClientRect();
    const area = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    let grew = false;

    if (getComputedStyle(element).position !== "static") {
      for (const pseudo of ["::after", "::before"]) {
        const style = getComputedStyle(element, pseudo);
        if (style.content === "none" || style.position !== "absolute") continue;
        const inset = (value) => {
          const n = parseFloat(value);
          return Number.isFinite(n) ? n : 0;
        };
        area.left = Math.min(area.left, rect.left + inset(style.left));
        area.top = Math.min(area.top, rect.top + inset(style.top));
        area.right = Math.max(area.right, rect.right - inset(style.right));
        area.bottom = Math.max(area.bottom, rect.bottom - inset(style.bottom));
        grew = true;
      }
    }

    // A wrapping <label> forwards the tap to its control, so its box counts.
    const label = element.closest("label");
    if (label && label !== element) {
      const labelRect = label.getBoundingClientRect();
      if (labelRect.width > rect.width || labelRect.height > rect.height) {
        area.left = Math.min(area.left, labelRect.left);
        area.top = Math.min(area.top, labelRect.top);
        area.right = Math.max(area.right, labelRect.right);
        area.bottom = Math.max(area.bottom, labelRect.bottom);
        grew = true;
      }
    }

    return grew
      ? { width: area.right - area.left, height: area.bottom - area.top }
      : rect;
  };

  for (const element of Array.from(
    document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]"),
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;

    const name =
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent?.trim() ||
      (element.labels && element.labels.length ? element.labels[0].textContent?.trim() : "") ||
      "";
    if (!name) {
      issues.unnamed.push({
        selector: `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)}`,
        type: element.getAttribute("type") || "",
      });
    }

    // Touch targets: WCAG 2.2 asks for 24x24; the project brand asks 44px.
    const area = hitArea(element);
    if (window.innerWidth <= 640 && (area.width < 32 || area.height < 32)) {
      issues.smallTargets.push({
        selector: `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`,
        width: Math.round(area.width),
        height: Math.round(area.height),
        name: name.slice(0, 30),
      });
    }
  }

  // --- fixed chrome overlap ----------------------------------------------
  const fixedBars = Array.from(
    document.querySelectorAll(
      ".admin-topbar, .admin-sticky-bar, .admin-mobile-nav, .admin-sidebar, .admin-drawer",
    ),
  )
    .filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .map((el) => ({
      name: String(el.className).split(" ")[0],
      rect: el.getBoundingClientRect(),
    }))
    .filter((item) => item.rect.width > 2 && item.rect.height > 2);

  for (let i = 0; i < fixedBars.length; i += 1) {
    for (let j = i + 1; j < fixedBars.length; j += 1) {
      const a = fixedBars[i];
      const b = fixedBars[j];
      // The nav drawer is a modal: covering the topbar and the quick nav is
      // the point, so only its backdrop is worth asserting.
      if (a.name === "admin-drawer" || b.name === "admin-drawer") continue;
      const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (overlapX > 4 && overlapY > 4) {
        issues.overlaps.push({ a: a.name, b: b.name, overlapX: Math.round(overlapX), overlapY: Math.round(overlapY) });
      }
    }
  }

  // A drawer without a backdrop is a real defect, so check for one directly.
  const drawer = document.querySelector(".admin-drawer");
  if (drawer && getComputedStyle(drawer).display !== "none") {
    if (!document.querySelector(".admin-drawer-overlay")) {
      issues.overlaps.push({ a: "admin-drawer", b: "missing backdrop", overlapX: 0, overlapY: 0 });
    }
  }

  // --- layout geometry ----------------------------------------------------
  /**
   * Geometry is what a screenshot cannot answer: overflow, clipped text and
   * off-viewport boxes are measured against the live layout at the real
   * viewport, which is exactly what a 320px phone or a 125% zoomed window hits.
   */
  geometry.scrollWidth = document.documentElement.scrollWidth;
  geometry.innerWidth = window.innerWidth;
  geometry.horizontalScroll = geometry.scrollWidth > window.innerWidth + 1;

  const describe = (el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`;

  /** True when an ancestor scrolls on purpose, so overhang is not a bug. */
  const insideScroller = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true;
      node = node.parentElement;
    }
    return false;
  };

  for (const el of Array.from(document.querySelectorAll(".admin-app *, .admin-login *"))) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !insideScroller(el)) {
      geometry.offViewport.push({
        selector: describe(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }

    if (el.children.length === 0 && el.textContent?.trim()) {
      // A deliberate line clamp is a design decision, not a defect.
      const clamped = style.webkitLineClamp && style.webkitLineClamp !== "none";
      const clippedX =
        !clamped &&
        el.scrollWidth > el.clientWidth + 1 &&
        (style.overflowX === "hidden" || style.overflowX === "clip") &&
        style.textOverflow !== "ellipsis";
      const clippedY =
        !clamped &&
        el.scrollHeight > el.clientHeight + 1 &&
        (style.overflowY === "hidden" || style.overflowY === "clip");
      if (clippedX || clippedY) {
        geometry.clipped.push({
          selector: describe(el),
          text: el.textContent.trim().slice(0, 40),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          textOverflow: style.textOverflow,
          overflow: style.overflow,
          whiteSpace: style.whiteSpace,
        });
      }
    }
  }

  const isVisible = (el) => Boolean(el) && getComputedStyle(el).display !== "none";
  const sidebar = document.querySelector(".admin-sidebar");
  const stickyBar = document.querySelector(".admin-sticky-bar");
  const drawerTrigger = document.querySelector(".admin-drawer-trigger");
  const mobileNav = document.querySelector(".admin-mobile-nav");
  geometry.chrome = {
    sidebar: isVisible(sidebar),
    sidebarWidth: isVisible(sidebar) ? Math.round(sidebar.getBoundingClientRect().width) : 0,
    drawerTrigger: isVisible(drawerTrigger),
    mobileNav: isVisible(mobileNav),
  };
  // Brand fingerprint: the audit must not quietly retheme the panel, so the
  // three colours that define the Hirmand identity are recorded on every run.
  const main = document.querySelector(".admin-main");
  const brass = document.querySelector(".admin-main .btn-gold");
  geometry.chrome.brand = {
    sidebar: isVisible(sidebar) ? getComputedStyle(sidebar).backgroundImage.slice(0, 60) : null,
    surface: main ? getComputedStyle(main).backgroundColor : null,
    accent: brass ? getComputedStyle(brass).backgroundColor : null,
    font: getComputedStyle(document.body).fontFamily.split(",")[0],
  };
  if (isVisible(stickyBar)) {
    const stickyStyle = getComputedStyle(stickyBar);
    geometry.chrome.stickyLeft = Math.round(parseFloat(stickyStyle.left) || 0);
    geometry.chrome.stickyRight = Math.round(parseFloat(stickyStyle.right) || 0);
    // A sticky bar that still reserves the sidebar's offset after the sidebar
    // is gone leaves a dead column of empty page next to the buttons.
    geometry.chrome.orphanedStickyBar =
      !geometry.chrome.sidebar && geometry.chrome.stickyLeft > 0;
  }

  return { issues, geometry };
};

/** `QA_VIEWS` narrows a run to the sections under investigation. */
function selectedViews() {
  const raw = process.env.QA_VIEWS;
  if (!raw) return VIEWS;
  const wanted = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  return VIEWS.filter((view) => wanted.includes(view.id));
}

async function clickByLabel(page, selector, viewId) {
  const candidates = await page.locator(selector).all();
  for (const candidate of candidates) {
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = (await candidate.innerText().catch(() => "")) || "";
    if (ALIASES[viewId].some((alias) => text.includes(alias))) {
      await candidate.click();
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
}

const report = { base: BASE, at: new Date().toISOString(), views: [], overlays: [] };

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

/**
 * Measures an overlay in its OPEN state.
 *
 * The view loop above navigates, which closes the drawer again, so without
 * this the most fragile surfaces in the panel (nav drawer, Persian calendar)
 * would never be measured at all.
 */
async function auditOpenOverlay(page, viewport, kind, open) {
  const opened = await open();
  if (!opened) return;
  await page.waitForTimeout(400);
  const { issues, geometry } = await page.evaluate(AUDIT);
  report.overlays.push({ viewport: viewport.id, width: viewport.width, kind, issues, geometry });
  if (process.env.QA_SCREENSHOTS !== "0") {
    await page.screenshot({ path: `${OUT}/overlay-${viewport.id}-${kind}.png` });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const stillOpen = await page.evaluate(
    (selector) => Boolean(document.querySelector(selector)),
    kind === "drawer" ? ".admin-drawer" : ".persian-date-picker-popover",
  );
  if (stillOpen) {
    report.overlays.push({
      viewport: viewport.id,
      width: viewport.width,
      kind,
      issues: { escapes: [`${kind} ignored Escape`] },
    });
  }
}

for (const viewport of [...parseViewports(), ...parseZooms()]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "fa-IR",
  });
  const page = await context.newPage();
  await installAdminApiStubs(page, BASE);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(500);
  if (await page.locator('input[type="password"]').count()) {
    await page.locator('input[type="password"]').fill(KEY);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);
  }

  for (const view of selectedViews()) {
    const mobile = viewport.width <= 900;
    if (mobile) {
      const trigger = page.locator(".admin-drawer-trigger");
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.waitForTimeout(300);
      }
    }
    await clickByLabel(page, mobile ? ".admin-drawer .admin-nav-btn" : ".admin-sidebar-nav .admin-nav-btn", view.id);
    await page.waitForTimeout(900);

    if (view.id === "attendance") {
      await auditOpenOverlay(page, viewport, "datepicker", async () => {
        const trigger = page.locator(".persian-date-picker-trigger").first();
        if (!(await trigger.isVisible().catch(() => false))) return false;
        await trigger.click();
        return true;
      });
    }

    const { issues, geometry } = await page.evaluate(AUDIT);
    report.views.push({
      viewport: viewport.id,
      width: viewport.width,
      view: view.id,
      issues,
      geometry,
    });
    if (process.env.QA_SCREENSHOTS !== "0") {
      await page.screenshot({ path: `${OUT}/audit-${viewport.id}-${view.id}.png` });
    }
  }

  // Drawer state, measured open: the panel only exists at this width.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const drawerTrigger = page.locator(".admin-drawer-trigger");
  if (await drawerTrigger.isVisible().catch(() => false)) {
    await auditOpenOverlay(page, viewport, "drawer", async () => {
      await drawerTrigger.click({ timeout: 5_000 });
      return true;
    }).catch((error) => {
      report.overlays.push({
        viewport: viewport.id,
        width: viewport.width,
        kind: "drawer",
        issues: { escapes: [`could not open the drawer: ${String(error).slice(0, 120)}`] },
      });
    });
  }

  await context.close();
}

await browser.close();

/**
 * Compact verdict first: a 14-viewport matrix printed as raw JSON buries the
 * two lines that matter (which viewport, which rule). Full detail stays one
 * `QA_FULL=1` away.
 */
const problems = [];
for (const entry of report.overlays) {
  const tag = `${entry.viewport}(${entry.width})/overlay:${entry.kind}`;
  if (entry.issues.escapes) problems.push(`${tag}: ${entry.issues.escapes.join(", ")}`);
  if (entry.geometry.horizontalScroll) {
    problems.push(`${tag}: horizontal scroll ${entry.geometry.scrollWidth}px > ${entry.geometry.innerWidth}px`);
  }
  if (entry.geometry.offViewport?.length) {
    problems.push(
      `${tag}: ${entry.geometry.offViewport.length} box(es) outside the viewport e.g. ${
        entry.geometry.offViewport[0].selector
      } [${entry.geometry.offViewport[0].left}..${entry.geometry.offViewport[0].right}]`,
    );
  }
  if (entry.geometry.clipped?.length) {
    problems.push(`${tag}: ${entry.geometry.clipped.length} clipped text node(s)`);
  }
  for (const item of entry.issues.contrast ?? []) {
    problems.push(`${tag}: contrast ${item.ratio} < ${item.min} for "${item.text}" (${item.selector})`);
  }
  for (const item of entry.issues.unnamed ?? []) {
    problems.push(`${tag}: control without accessible name ${item.selector}`);
  }
  for (const item of entry.issues.overlaps ?? []) {
    problems.push(`${tag}: ${item.a} overlaps ${item.b} by ${item.overlapX}x${item.overlapY}px`);
  }
}
for (const entry of report.views) {
  const { issues, geometry } = entry;
  const tag = `${entry.viewport}(${entry.width})/${entry.view}`;
  if (geometry.horizontalScroll) {
    problems.push(
      `${tag}: horizontal scroll ${geometry.scrollWidth}px > ${geometry.innerWidth}px`,
    );
  }
  if (geometry.chrome.orphanedStickyBar) {
    problems.push(
      `${tag}: sticky bar indented ${geometry.chrome.stickyLeft}px with no sidebar`,
    );
  }
  if (geometry.offViewport.length) {
    problems.push(
      `${tag}: ${geometry.offViewport.length} box(es) outside the viewport e.g. ${
        geometry.offViewport[0].selector
      } [${geometry.offViewport[0].left}..${geometry.offViewport[0].right}]`,
    );
  }
  if (geometry.clipped.length) {
    problems.push(
      `${tag}: ${geometry.clipped.length} clipped text node(s) e.g. "${
        geometry.clipped[0].text
      }" in ${geometry.clipped[0].selector}`,
    );
  }
  for (const item of issues.contrast) {
    problems.push(
      `${tag}: contrast ${item.ratio} < ${item.min} for "${item.text}" (${item.selector})`,
    );
  }
  for (const item of issues.unnamed) {
    problems.push(`${tag}: control without accessible name ${item.selector}`);
  }
  for (const item of issues.smallTargets) {
    problems.push(
      `${tag}: touch target ${item.width}x${item.height} for ${item.selector}`,
    );
  }
  for (const item of issues.overlaps) {
    problems.push(`${tag}: ${item.a} overlaps ${item.b} by ${item.overlapX}x${item.overlapY}px`);
  }
}

console.log(`\n=== admin audit: ${report.views.length} view/viewport pairs ===`);
if (problems.length === 0) console.log("no findings");
else console.log(problems.join("\n"));
console.log(`\n${problems.length} finding(s)\n`);

if (process.env.QA_FULL === "1") console.log(JSON.stringify(report, null, 2));
