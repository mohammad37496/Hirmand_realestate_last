import type { Property } from "./properties";

export const DEFAULT_MATCH_RAHN_RATE = 30_000;
export const BUDGET_NEAR_RATIO = 1.15;

export type BudgetInput = {
  depositBudget: number;
  rentBudget: number;
};

export type BudgetMatchTier = "within" | "convertible" | "near";

export type BudgetMatchDetails = {
  tier: BudgetMatchTier;
  score: number;
  rate: number;
  propertyTotalEquivalent: number;
  budgetTotalEquivalent: number;
  budgetUsagePercent: number;
  gapEquivalent: number;
  suggestedDeposit: number;
  suggestedRent: number;
  conversionDirection: "none" | "deposit_to_rent" | "rent_to_deposit" | "mixed";
  reason: string;
};

function numeric(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function totalRahnEquivalent(
  deposit: number,
  rent: number,
  rate = DEFAULT_MATCH_RAHN_RATE,
): number {
  if (rate <= 0) return Math.max(0, deposit);
  return Math.max(0, deposit) + (Math.max(0, rent) * 1_000_000) / rate;
}

export function budgetTotalEquivalent(
  budget: BudgetInput,
  rate = DEFAULT_MATCH_RAHN_RATE,
): number {
  return totalRahnEquivalent(budget.depositBudget, budget.rentBudget, rate);
}

function buildConvertibleAllocation(
  propertyTotal: number,
  budget: BudgetInput,
  rate: number,
  propertyDeposit: number,
  propertyRent: number,
) {
  const maxDeposit = Math.max(0, budget.depositBudget);
  const maxRent = Math.max(0, budget.rentBudget);
  const maxRentEquivalent = (maxRent * 1_000_000) / rate;

  let suggestedDeposit = clamp(propertyDeposit, 0, maxDeposit);
  let suggestedRent = Math.max(
    0,
    (propertyTotal - suggestedDeposit) * rate / 1_000_000,
  );

  if (suggestedRent > maxRent) {
    suggestedRent = maxRent;
    suggestedDeposit = clamp(
      propertyTotal - maxRentEquivalent,
      0,
      maxDeposit,
    );
  }

  const depositChanged = Math.abs(suggestedDeposit - propertyDeposit) >= 1;
  const rentChanged = Math.abs(suggestedRent - propertyRent) >= 1;

  let conversionDirection: BudgetMatchDetails["conversionDirection"] = "mixed";
  if (!depositChanged && !rentChanged) conversionDirection = "none";
  else if (propertyDeposit > suggestedDeposit && suggestedRent > propertyRent) {
    conversionDirection = "deposit_to_rent";
  } else if (propertyRent > suggestedRent && suggestedDeposit > propertyDeposit) {
    conversionDirection = "rent_to_deposit";
  }

  return {
    suggestedDeposit: Math.round(suggestedDeposit),
    suggestedRent: Math.round(suggestedRent),
    conversionDirection,
  };
}

export function calculateBudgetMatch(
  property: Property,
  budget: BudgetInput,
  rate = DEFAULT_MATCH_RAHN_RATE,
): BudgetMatchDetails | null {
  const deposit = numeric(property.deposit);
  const rent = numeric(property.rent);
  const budgetDeposit = Math.max(0, budget.depositBudget);
  const budgetRent = Math.max(0, budget.rentBudget);
  const budgetTotal = budgetTotalEquivalent(budget, rate);

  if (budgetTotal <= 0 || (deposit <= 0 && rent <= 0)) return null;

  const propertyTotal = totalRahnEquivalent(deposit, rent, rate);
  const within = deposit <= budgetDeposit && rent <= budgetRent;
  const convertible = property.convertible && !within && propertyTotal <= budgetTotal;
  const near = !within && !convertible && propertyTotal <= budgetTotal * BUDGET_NEAR_RATIO;

  if (!within && !convertible && !near) return null;

  const usage = budgetTotal > 0 ? propertyTotal / budgetTotal : 1;
  const distance = Math.abs(1 - usage);
  const closenessScore = Math.round(
    Math.max(0, 100 - Math.min(1, distance) * 100),
  );
  const tierBonus = within ? 10 : convertible ? 5 : 0;
  const score = Math.min(100, closenessScore + tierBonus);

  const allocation = buildConvertibleAllocation(
    propertyTotal,
    budget,
    rate,
    deposit,
    rent,
  );

  const gapEquivalent = Math.max(0, propertyTotal - budgetTotal);
  let reason = "این فایل با ترکیب فعلی رهن و اجاره داخل سقف بودجه شماست.";
  if (convertible) {
    reason = "با جابه‌جایی بخشی از رهن و اجاره، این فایل داخل معادل بودجه شما قرار می‌گیرد.";
  } else if (near) {
    reason = "این فایل کمی بالاتر از معادل بودجه شماست، اما برای بررسی نزدیک پیشنهاد شده است.";
  }

  return {
    tier: within ? "within" : convertible ? "convertible" : "near",
    score,
    rate,
    propertyTotalEquivalent: Math.round(propertyTotal),
    budgetTotalEquivalent: Math.round(budgetTotal),
    budgetUsagePercent: Math.round((propertyTotal / budgetTotal) * 100),
    gapEquivalent: Math.round(gapEquivalent),
    ...allocation,
    reason,
  };
}

export function tierLabel(tier: BudgetMatchTier): string {
  if (tier === "within") return "داخل بودجه";
  if (tier === "convertible") return "قابل تبدیل";
  return "نزدیک بودجه";
}
