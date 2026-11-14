import assert from "node:assert/strict";
import test from "node:test";
import { isPropertyWatchTargetMutationSuccessful } from "./property-watch-target-response.ts";

test("accepts a persisted property watch target", () => {
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: true, enabled: true, target: { type: "price", amount: 2500000000 } },
      { type: "price", amount: 2500000000 },
    ),
    true,
  );
});

test("accepts clearing a target while keeping its watch subscription enabled", () => {
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: true, enabled: true, target: null },
      { type: "price", amount: null },
    ),
    true,
  );
});

test("rejects stale or contradictory target mutation responses", () => {
  const expected = { type: "rent" as const, amount: 50000000 };
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: true, enabled: true, target: { type: "rent", amount: 40000000 } },
      expected,
    ),
    false,
  );
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: true, enabled: false, target: { type: "rent", amount: 50000000 } },
      expected,
    ),
    false,
  );
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: false, enabled: true, target: { type: "rent", amount: 50000000 } },
      expected,
    ),
    false,
  );
  assert.equal(
    isPropertyWatchTargetMutationSuccessful(
      { ok: true, enabled: true, target: { type: "rent", amount: "50000000" as unknown as number } },
      expected,
    ),
    false,
  );
});
