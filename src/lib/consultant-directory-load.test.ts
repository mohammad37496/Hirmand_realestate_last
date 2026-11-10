import assert from "node:assert/strict";
import test from "node:test";
import { loadConsultantDirectoryWithFailureState } from "./consultant-directory-load.ts";

test("consultant directory preserves a successful empty result", async () => {
  const result = await loadConsultantDirectoryWithFailureState(async () => []);
  assert.deepEqual(result, { consultants: [], failed: false });
});

test("consultant directory marks a rejected request as failed", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await loadConsultantDirectoryWithFailureState(async () => {
      throw new Error("network unavailable");
    });
    assert.deepEqual(result, { consultants: [], failed: true });
  } finally {
    console.error = originalError;
  }
});

test("consultant directory preserves successfully loaded records", async () => {
  const consultants = [{ id: "sheikh" }, { id: "moradi" }];
  const result = await loadConsultantDirectoryWithFailureState(async () => consultants);
  assert.deepEqual(result, { consultants, failed: false });
});
