import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("lead assignment distinguishes unavailable data from an empty recommendation queue", () => {
  const route = read("server/routes/api/admin-lead-assignment.post.ts");
  const ui = read("src/components/hirmand/admin-lead-assignment-balancer.tsx");
  assert.match(route, /if \(action === "assign"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: false, consultants: \[\], recommendations: \[\]/);
  assert.match(route, /available: true,/);
  assert.match(ui, /typeof data\.available !== "boolean"/);
  assert.match(ui, /requestId !== requestRef\.current/);
  assert.match(ui, /available === true && !loadError && !recommendations\.length/);
  assert.match(ui, /<AdminErrorBanner/);
});

test("consultant targets preserve the selected month and reject unavailable writes", () => {
  const route = read("server/routes/api/admin-consultant-targets.post.ts");
  const ui = read("src/components/hirmand/admin-consultant-targets.tsx");
  assert.ok(route.indexOf('if (action !== "list" && !hasAdminPermission') < route.indexOf('if (dbSource === "unconfigured")'));
  assert.match(route, /action !== "list".*statusCode: 503/s);
  assert.match(route, /available: false, month: selectedMonth\.slice\(0, 7\), rows: \[\]/);
  assert.match(route, /available:true, month:selectedMonth\.slice\(0,7\)/);
  assert.match(ui, /loadRequestRef=useRef\(0\)/);
  assert.match(ui, /available===true&&!loadError/);
  assert.match(ui, /<AdminErrorBanner/);
});

test("consultant performance does not turn unavailable or failed requests into zero activity", () => {
  const route = read("server/routes/api/admin-consultant-performance.get.ts");
  const ui = read("src/components/hirmand/admin-consultant-performance.tsx");
  assert.match(route, /available: false, days, consultants: \[\]/);
  assert.match(route, /available: true, days, consultants: rows/);
  assert.match(ui, /requestId !== requestRef\.current/);
  assert.match(ui, /available === true && !loadError && !rows\.length/);
  assert.match(ui, /<AdminErrorBanner/);
});

test("lead 360 ignores stale customer responses and clears the previous record on selection", () => {
  const route = read("server/routes/api/admin-lead-360.post.ts");
  const ui = read("src/components/hirmand/admin-lead-360.tsx");
  assert.match(route, /available: false/);
  assert.match(route, /available: true/);
  assert.match(ui, /const requestId = \+\+requestRef\.current/);
  assert.match(ui, /setPayload\(null\);\s*setAvailable\(null\);\s*setLoading\(true\)/);
  assert.match(ui, /requestId !== requestRef\.current/);
  assert.match(ui, /available !== false/);
  assert.match(ui, /available === true && Boolean\(leadId\) && !c/);
  assert.match(ui, /<AdminErrorBanner/);
});
