import test from "node:test";
import assert from "node:assert/strict";
import { calculateBudgetMatch, totalRahnEquivalent } from "./budget-matching.ts";
import type { Property } from "./properties";

function property(overrides: Partial<Property>): Property {
  return {
    id: "1",
    slug: "test",
    status: "published",
    availabilityStatus: "available",
    featured: false,
    title: "ملک تست",
    transactionType: "rent",
    propertyType: "apartment",
    city: "اصفهان",
    neighborhood: "مرداویج",
    address: null,
    areaM2: 100,
    bedrooms: 2,
    bathrooms: 1,
    floor: 2,
    floorLabel: null,
    orientation: null,
    convertible: true,
    totalFloors: 5,
    builtYear: 1400,
    parking: true,
    elevator: true,
    storage: true,
    painted: false,
    wallpaper: false,
    cabinetType: null,
    flooringType: null,
    coolingSystem: null,
    heatingSystem: null,
    wallClosetType: null,
    otherAmenities: [],
    price: null,
    deposit: "500000000",
    rent: "10000000",
    description: "ملک تستی برای آزمون منطق تطبیق بودجه.",
    features: [],
    images: [],
    contactName: "هیرمند",
    contactPhone: "09130000000",
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

test("converts rent to rahn equivalent using the default rate", () => {
  assert.ok(Math.abs(totalRahnEquivalent(500_000_000, 10_000_000) - 833_333_333.3333334) < 0.01);
});

test("marks a property within the user's direct budget", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "400000000", rent: "8000000" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result?.tier, "within");
  assert.ok((result?.score ?? 0) >= 90);
});

test("does not mark a non-convertible property as convertible", () => {
  const result = calculateBudgetMatch(
    property({ convertible: false, deposit: "700000000", rent: "0" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.notEqual(result?.tier, "convertible");
});

test("marks a higher-deposit property as convertible when total equivalent fits", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "700000000", rent: "0" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result?.tier, "convertible");
  assert.equal(result?.suggestedDeposit, 500_000_000);
  assert.equal(Math.round(result?.suggestedRent ?? 0), 6_000_000);
});

test("marks a property just above budget as near", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "900000000", rent: "0" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result?.tier, "near");
  assert.ok((result?.gapEquivalent ?? 0) > 0);
});

test("rejects properties far above the budget", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "1_200_000_000", rent: "0" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result, null);
});

test("builds a feasible conversion when monthly rent is above the user's cap", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "200000000", rent: "20000000" }),
    { depositBudget: 700_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result?.tier, "convertible");
  assert.equal(result?.suggestedRent, 10_000_000);
  assert.equal(result?.suggestedDeposit, 533_333_333);
  assert.equal(result?.conversionDirection, "rent_to_deposit");
});

test("returns transparent financial metadata for the UI", () => {
  const result = calculateBudgetMatch(
    property({ deposit: "600000000", rent: "6000000" }),
    { depositBudget: 500_000_000, rentBudget: 10_000_000 },
  );
  assert.equal(result?.budgetUsagePercent, 96);
  assert.equal(result?.gapEquivalent, 0);
  assert.match(result?.reason ?? "", /بودجه/);
});
