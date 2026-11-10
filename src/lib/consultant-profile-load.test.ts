import assert from "node:assert/strict";
import test from "node:test";
import { loadConsultantPropertiesWithFailureState } from "./consultant-profile-load.ts";

test("consultant profile preserves a successful empty property result", async () => {
  const result = await loadConsultantPropertiesWithFailureState(async () => []);
  assert.deepEqual(result, { properties: [], failed: false });
});

test("consultant profile marks a rejected property request as failed, not empty", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await loadConsultantPropertiesWithFailureState(async () => {
      throw new Error("database unavailable");
    });
    assert.deepEqual(result, { properties: [], failed: true });
  } finally {
    console.error = originalError;
  }
});

test("consultant profile preserves returned property records", async () => {
  const properties = [{ id: "property-1" }, { id: "property-2" }];
  const result = await loadConsultantPropertiesWithFailureState(async () => properties);
  assert.deepEqual(result, { properties, failed: false });
});
