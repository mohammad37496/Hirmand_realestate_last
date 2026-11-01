import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stubAdminApi } from "./admin-fixtures.mjs";

const adminSource = readFileSync(new URL("../src/components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
const functionalQa = readFileSync(new URL("./admin-qa.mjs", import.meta.url), "utf8");
const visualQa = readFileSync(new URL("./admin-visual-audit.mjs", import.meta.url), "utf8");
const fixtures = readFileSync(new URL("./admin-fixtures.mjs", import.meta.url), "utf8");
const packageManifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");

const navStart = adminSource.indexOf("const navItems = useMemo(");
const navEnd = adminSource.indexOf("const visibleNavItems = useMemo(", navStart);
const navSource = adminSource.slice(navStart, navEnd);
const navViews = navSource.split("\n").flatMap((line) => {
  const marker = 'view: "'; const start = line.indexOf(marker);
  return start < 0 ? [] : [line.slice(start + marker.length).split('"')[0]];
});
function viewIds(source) {
  const declaration = source.includes("const ALL_VIEWS = [") ? "const ALL_VIEWS = [" : "const VIEWS = [";
  const start = source.indexOf(declaration); const end = source.indexOf("\n];", start);
  assert.ok(start >= 0 && end > start, "QA script should declare its view matrix");
  return source.slice(start, end).split("\n").flatMap((line) => {
    const marker = 'id: "'; const offset = line.indexOf(marker);
    return offset < 0 ? [] : [line.slice(offset + marker.length).split('"')[0]];
  });
}

test("functional and visual admin QA cover every view exposed in navigation", () => {
  assert.ok(navViews.length >= 25, "expected broad admin navigation");
  for (const [name, ids] of [["functional QA", viewIds(functionalQa)], ["visual QA", viewIds(visualQa)]]) {
    assert.deepEqual(navViews.filter((id) => !ids.includes(id)), [], name + " is missing navigation views");
  }
});

test("admin navigation has stable IDs and both browser audits use them", () => {
  assert.ok(adminSource.includes("data-admin-view={item.view}"));
  assert.ok(functionalQa.includes("data-admin-view=") && functionalQa.includes("view.id"));
  assert.ok(visualQa.includes("data-admin-view=") && visualQa.includes("viewId"));
  assert.ok(functionalQa.includes('process.env.QA_SCREENSHOT_DIR || "screenshots/admin"'));
  assert.ok(functionalQa.includes("const requestedViewIds = process.env.QA_VIEW_IDS"));
  assert.ok(functionalQa.includes("const VIEWS = requestedViewIds.length ? ALL_VIEWS.filter"));
  assert.ok(visualQa.includes("const requestedViewIds = process.env.QA_VIEW_IDS"));
  assert.ok(visualQa.includes("const VIEWS = requestedViewIds.length ? ALL_VIEWS.filter"));
});

test("functional QA fails on empty views, API errors, console errors and failed requests", () => {
  for (const token of ["newErrors === 0", "newFailedRequests === 0", "newBadResponses === 0", "const unexpected = badResponses;", "text.length > 0"]) assert.ok(functionalQa.includes(token), token);
  assert.ok(functionalQa.includes('page.locator(".admin-drawer-overlay").click()'));
  assert.ok(functionalQa.includes('expanded !== "true"'));
  assert.ok(functionalQa.includes("unshapedFallbacks.size"));
});

test("visual QA fails on structural blockers while retaining accessibility findings as warnings", () => {
  assert.ok(visualQa.includes("const navigated = await clickByLabel"));
  assert.ok(visualQa.includes("if (!entry.navigated) problems.push"));
  assert.ok(visualQa.includes("const blockers = problems.filter"));
  assert.ok(visualQa.includes("if (blockers.length) process.exitCode = 1;"));
  assert.ok(visualQa.includes("contrast"));
});

test("visual QA retains touch emulation and 44px admin icon targets", () => {
  assert.ok(visualQa.includes("hasTouch: viewport.width <= 1024"));
  assert.ok(visualQa.includes("isMobile: viewport.width <= 640"));
  assert.ok(visualQa.includes("touchViewport && adminIconButton ? 44 : 32"));
});

test("admin API fixtures match query-string endpoints", () => {
  assert.ok(fixtures.includes("**/api/admin-sales-funnel**"));
  assert.ok(fixtures.includes("**/api/admin-management-report**"));
});

test("sales funnel, management report and sales-control fixtures satisfy their strict UI response contracts", async () => {
  async function payloadFor(pattern, body = {}) {
    let payload = null;
    await stubAdminApi[pattern]({
      request: () => ({ postDataJSON: () => body }),
      fulfill: async (response) => { payload = JSON.parse(response.body); },
    });
    return payload;
  }

  const funnel = await payloadFor("**/api/admin-sales-funnel**");
  assert.equal(funnel.available, true);
  assert.ok(Array.isArray(funnel.statuses) && funnel.conversions);

  const report = await payloadFor("**/api/admin-management-report**");
  assert.equal(report.available, true);
  assert.ok(report.properties && report.leads && report.deals && Array.isArray(report.topConsultants));

  const sales = await payloadFor("**/api/admin-sales-control-center", { days: 30 });
  assert.equal(sales.available, true);
  assert.ok(sales.pipeline && sales.summary && sales.consultants.every((item) => typeof item.periodLeads === "number"));
});

test("admin QA uses the real database-backed session route and can fixture other Nitro APIs", () => {
  assert.doesNotMatch(fixtures, /^\s*"\*\*\/api\/admin\/session":/m);
  assert.match(fixtures, /response\.status !== 404 && response\.status !== 405/);
  assert.match(fixtures, /process\.env\.QA_STUB_ADMIN_APIS === "1"/);
  assert.match(fixtures, /pathname === "\/api\/admin\/session"\) return route\.continue\(\)/);
  assert.ok(fixtures.includes('"**/api/admin-kpi-snapshot**"'));
  assert.ok(fixtures.includes('"**/api/music**"'));
});

test("coverage regression test is part of the normal npm test command", () => {
  assert.ok(packageManifest.includes("scripts/admin-qa-coverage.test.mjs"));
});

test("visual audit scopes create navigation and keeps chart-label clipping diagnostic", () => {
  assert.ok(visualQa.includes('const navRoot = selector.startsWith(".admin-drawer") ? ".admin-drawer" : ".admin-sidebar-nav";'));
  assert.ok(visualQa.includes('page.locator(navRoot + " .admin-nav-btn-create")'));
  assert.ok(visualQa.includes("rect.right > window.innerWidth + 8 || rect.left < -8"));
  const start = visualQa.indexOf("const blockingPatterns = [");
  const end = visualQa.indexOf("];", start);
  assert.ok(!visualQa.slice(start, end).includes("clipped text"));
  assert.ok(visualQa.includes("geometry.clipped.length"));
});
