import assert from "node:assert/strict";
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
