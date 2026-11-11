import assert from "node:assert/strict";
import test from "node:test";
import { exactMediaRangeBytes } from "./media-range-bytes.ts";

test("stored media range rejects a missing row instead of returning a successful empty body", () => {
  assert.equal(exactMediaRangeBytes(undefined, 4), null);
});

test("stored media range rejects truncated bytes after a concurrent delete or stale metadata read", () => {
  assert.equal(exactMediaRangeBytes(new Uint8Array([1, 2]), 4), null);
});

test("stored media range preserves exact requested bytes", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.equal(exactMediaRangeBytes(bytes, 4), bytes);
});

test("stored media range validates its expected length", () => {
  assert.equal(exactMediaRangeBytes(new Uint8Array(), -1), null);
  assert.equal(exactMediaRangeBytes(new Uint8Array(), Number.POSITIVE_INFINITY), null);
  assert.equal(exactMediaRangeBytes(new Uint8Array(), 0)?.byteLength, 0);
});
