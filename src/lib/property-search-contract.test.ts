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
    { maxDeposit: 9999999999999999 },
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
  assert.equal(publicPropertyFiltersSchema.safeParse({ search: "" }).success, true);
  assert.equal(publicPropertyFiltersSchema.safeParse({ featureSearch: "؟؟؟" }).success, false);
});
