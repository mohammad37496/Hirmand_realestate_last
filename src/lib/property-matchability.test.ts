import assert from "node:assert/strict";
import test from "node:test";
import { isMatchableProperty, MATCHABLE_PROPERTY_SQL } from "./property-matchability.ts";

test("matching only includes published listings currently available", () => {
  assert.equal(isMatchableProperty({ status: "published", availability_status: "available" }), true);
  assert.equal(isMatchableProperty({ status: "published", availability_status: null }), true);
  assert.equal(isMatchableProperty({ status: "draft", availability_status: "available" }), false);
  for (const status of ["reserved", "sold", "rented", "unavailable", "unknown"]) {
    assert.equal(isMatchableProperty({ status: "published", availability_status: status }), false, status);
  }
});

test("matching SQL excludes unavailable listings before the candidate limit", () => {
  assert.equal(
    MATCHABLE_PROPERTY_SQL,
    "status = 'published' and coalesce(availability_status, 'available') = 'available'",
  );
});
