import assert from "node:assert/strict";
import { test } from "node:test";
import { queryIfAllowed } from "./admin-query-access.ts";

test("a denied report permission never invokes its sensitive query", async () => {
  let queryCount = 0;
  const result = await queryIfAllowed(false, async () => {
    queryCount += 1;
    return ["private"];
  }, [] as string[]);

  assert.deepEqual(result, []);
  assert.equal(queryCount, 0);
});

test("an allowed report permission invokes its query exactly once", async () => {
  let queryCount = 0;
  const result = await queryIfAllowed(true, async () => {
    queryCount += 1;
    return ["permitted"];
  }, [] as string[]);

  assert.deepEqual(result, ["permitted"]);
  assert.equal(queryCount, 1);
});
