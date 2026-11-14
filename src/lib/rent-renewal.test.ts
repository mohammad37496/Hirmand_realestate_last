import assert from "node:assert/strict";
import test from "node:test";
import { calculateRentRenewal } from "./rent-renewal.ts";

test("calculates the renewed deposit and monthly rent independently", () => {
  assert.deepEqual(calculateRentRenewal(500_000_000, 30), {
    previousAmount: 500_000_000,
    increasePercent: 30,
    increaseAmount: 150_000_000,
    renewedAmount: 650_000_000,
  });
  assert.deepEqual(calculateRentRenewal(10_000_000, 30), {
    previousAmount: 10_000_000,
    increasePercent: 30,
    increaseAmount: 3_000_000,
    renewedAmount: 13_000_000,
  });
});

test("supports zero percent and rejects invalid renewal inputs", () => {
  assert.equal(calculateRentRenewal(12_345, 0)?.renewedAmount, 12_345);
  assert.equal(calculateRentRenewal(0, 30), null);
  assert.equal(calculateRentRenewal(100, -1), null);
  assert.equal(calculateRentRenewal(100, 1001), null);
  assert.equal(calculateRentRenewal(Number.NaN, 30), null);
  assert.equal(calculateRentRenewal(1.5, 30), null);
  assert.equal(calculateRentRenewal(Number.MAX_SAFE_INTEGER + 1, 30), null);
  assert.equal(calculateRentRenewal(Number.MAX_SAFE_INTEGER, 1000), null);
});

test("rounds fractional percentage increases to the nearest toman", () => {
  assert.deepEqual(calculateRentRenewal(12_345, 12.5), {
    previousAmount: 12_345,
    increasePercent: 12.5,
    increaseAmount: 1_543,
    renewedAmount: 13_888,
  });
});
