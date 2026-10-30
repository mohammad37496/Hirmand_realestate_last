import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AdminDataHealthCheckError, runAdminDataHealthChecks } from "./admin-data-health-checks.ts";

test("data-health scan returns all results when every check succeeds", async () => {
  const result = await runAdminDataHealthChecks([
    { name: "orphans", run: async () => [{ id: "lead-1" }] },
    { name: "coordinates", run: async () => [{ id: "property-1" }] },
  ]);
  assert.deepEqual(result, [[{ id: "lead-1" }], [{ id: "property-1" }]]);
});

test("a failed data-health query fails the whole scan instead of returning a false clean result", async () => {
  await assert.rejects(
    runAdminDataHealthChecks([
      { name: "orphans", run: async () => [] as { id: string }[] },
      { name: "consultants", run: async () => { throw new Error("database unavailable"); } },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof AdminDataHealthCheckError);
      assert.deepEqual(error.failedChecks, ["consultants"]);
      return true;
    },
  );
});

test("data-health API and panel fail closed for unavailable storage and no-op resolution", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-data-health.post.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-data-health.tsx", import.meta.url), "utf8");
  const actionIndex = route.indexOf('const action = body.action ?? "scan"');
  const permissionIndex = route.indexOf('hasAdminPermission(role, "settings.manage")');
  const unavailableIndex = route.indexOf('if (dbSource === "unconfigured")');

  assert.ok(actionIndex >= 0 && permissionIndex > actionIndex && unavailableIndex > permissionIndex);
  assert.match(route, /statusCode:\s*503/);
  assert.match(route, /resolveAdminDataHealthFinding/);
  assert.match(route, /return \{ available:true/);
  assert.match(route, /resolvedId === null/);
  assert.match(route, /statusCode:\s*404/);
  assert.match(ui, /payload\.available !== true/);
  assert.match(ui, /payload\.success !== true/);
  assert.match(ui, /setData\(null\)/);
  assert.match(ui, /<AdminErrorBanner/);
  assert.match(ui, /onRetry=\{\(\) => void scan\(\)\}/);
});
