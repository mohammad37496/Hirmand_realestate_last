import test from "node:test";
import assert from "node:assert/strict";
import { buildBudgetLeadNote, budgetEquivalent } from "./budget-lead.ts";

test("calculates the stored budget equivalent", () => {
  assert.ok(Math.abs(budgetEquivalent({ depositBudget: 500_000_000, rentBudget: 10_000_000 }) - 833_333_333.3333334) < 0.01);
});

test("builds a useful CRM note", () => {
  const note = buildBudgetLeadNote({
    name: "علی",
    phone: "09130000000",
    depositBudget: 500_000_000,
    rentBudget: 10_000_000,
    propertyType: "آپارتمان",
    neighborhood: "مرداویج",
    bedrooms: 2,
    matches: [],
  });
  assert.match(note, /مرداویج/);
  assert.match(note, /۵۰۰٬۰۰۰٬۰۰۰/);
});