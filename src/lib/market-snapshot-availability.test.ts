import assert from "node:assert/strict";
import test from "node:test";
import {
  loadMarketSnapshot,
  MARKET_SNAPSHOT_CACHE_CONTROL,
  MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL,
} from "./market-snapshot-availability.ts";

test("successful market snapshots retain public cache policy", async () => {
  const snapshot = { activeFiles: 0, saleFiles: 0, rentFiles: 0 };
  const headers: string[] = [];
  const result = await loadMarketSnapshot(
    async () => snapshot,
    (value) => headers.push(value),
  );

  assert.equal(result, snapshot);
  assert.deepEqual(headers, [MARKET_SNAPSHOT_CACHE_CONTROL]);
});

test("failed market snapshots are not cached as zero-valued data", async () => {
  const failure = new Error("market database unavailable");
  const headers: string[] = [];
  const errors: unknown[] = [];
  const result = await loadMarketSnapshot(
    async () => { throw failure; },
    (value) => headers.push(value),
    (error) => errors.push(error),
  );

  assert.equal(result, null);
  assert.deepEqual(headers, [MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL]);
  assert.deepEqual(errors, [failure]);
});
