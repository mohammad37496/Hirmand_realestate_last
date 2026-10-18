import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPropertyFloorValue, PROPERTY_FLOOR_OPTIONS } from "./property-options.ts";

test("property floor choices keep only the explicit underground exception and floors 0 through 20", () => {
  assert.deepEqual(
    PROPERTY_FLOOR_OPTIONS.map((item) => Number(item.value)),
    [-60, ...Array.from({ length: 21 }, (_, index) => index)],
  );
  assert.equal(isAllowedPropertyFloorValue(-60), true);
  assert.equal(isAllowedPropertyFloorValue(0), true);
  assert.equal(isAllowedPropertyFloorValue(20), true);
  assert.equal(isAllowedPropertyFloorValue(-59), false);
  assert.equal(isAllowedPropertyFloorValue(-1), false);
  assert.equal(isAllowedPropertyFloorValue(21), false);
  assert.equal(isAllowedPropertyFloorValue(200), false);
  assert.equal(isAllowedPropertyFloorValue(1.5), false);
});
