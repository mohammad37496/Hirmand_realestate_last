import assert from "node:assert/strict";
import test from "node:test";
import { publicPropertyFiltersSchema } from "./property-search-contract.ts";

test("public filter contract accepts supported transaction types and money ranges", () => {
  const parsed = publicPropertyFiltersSchema.parse({
    transactionType: "rent",
    propertyType: "apartment",
    search: "شهرک ولی‌عصر",
    minDeposit: 500_000_000,
    maxDeposit: 900_000_000,
    minRent: 15_000_000,
    maxRent: 25_000_000,
  });
  assert.equal(parsed.transactionType, "rent");
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.offset, 0);
});

test("public filter contract rejects unsupported transaction and property types", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ transactionType: "lease" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ propertyType: "garage" }).success, false);
});

test("public filter contract rejects negative, fractional, excessive and unsafe bounds", () => {
  for (const data of [
    { minPrice: -1 },
    { minArea: 100001 },
    { minBedrooms: 31 },
    { minRent: 10.5 },
    { maxDeposit: Number.MAX_SAFE_INTEGER },
    { offset: -1 },
  ]) {
    assert.equal(publicPropertyFiltersSchema.safeParse(data).success, false, JSON.stringify(data));
  }
});

test("public filter contract rejects inverted ranges and malformed map bounds", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ minArea: 120, maxArea: 80 }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ minRent: 25_000_000, maxRent: 15_000_000 }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ mapBounds: [51.65, 32.6, 51.61, 32.7] }).success, false);
});

test("public filter contract rejects symbol-only search text but permits an empty search", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ search: "!!!" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhood: "%%%" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ search: "" }).success, true);
  assert.equal(publicPropertyFiltersSchema.safeParse({ featureSearch: "؟؟؟" }).success, false);
});


test("public floor filters allow -60 and levels 0 through 20, rejecting unsupported values", () => {
  for (let floor = -59; floor <= -1; floor += 1) {
    assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: floor }).success, false, String(floor));
    assert.equal(publicPropertyFiltersSchema.safeParse({ maxFloor: floor }).success, false, String(floor));
  }
  for (let floor = 21; floor <= 200; floor += 1) {
    assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: floor }).success, false, String(floor));
    assert.equal(publicPropertyFiltersSchema.safeParse({ maxFloor: floor }).success, false, String(floor));
  }
  assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: -60, maxFloor: 0 }).success, true);
  assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: 0, maxFloor: 20 }).success, true);
});
