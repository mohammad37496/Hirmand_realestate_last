import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

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
  const start = source.indexOf("const VIEWS = ["); const end = source.indexOf("\n];", start);
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
});

test("functional QA fails on empty views, API errors, console errors and failed requests", () => {
  for (const token of ["newErrors === 0", "newFailedRequests === 0", "newBadResponses === 0", "const unexpected = badResponses;", "text.length > 0"]) assert.ok(functionalQa.includes(token), token);
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

test("coverage regression test is part of the normal npm test command", () => {
  assert.ok(packageManifest.includes("scripts/admin-qa-coverage.test.mjs"));
});


test("visual audit scopes the create view to the active navigation and tolerates decorative edge bleed", () => {
  assert.ok(visualQa.includes('const navRoot = selector.startsWith(".admin-drawer") ? ".admin-drawer" : ".admin-sidebar-nav";'));
  assert.ok(visualQa.includes('page.locator(navRoot + " .admin-nav-btn-create")'));
  assert.ok(visualQa.includes("rect.right > window.innerWidth + 4 || rect.left < -4"));
  const start = visualQa.indexOf("const blockingPatterns = [");
  const end = visualQa.indexOf("];", start);
  const blockers = visualQa.slice(start, end);
  assert.ok(!blockers.includes("clipped text"));
  assert.ok(visualQa.includes("geometry.clipped.length"));
});
