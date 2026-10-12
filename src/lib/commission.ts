import { formatToman } from "@/lib/money";

export const VAT = 0.09;
export const BUY_TOTAL_RATE = 0.005;
export const RENT_RATE = 0.25;
export const DEPOSIT_TO_RENT = 30_000;

export type BuyResult = {
  kind: "buy";
  amount: number;
  base: number;
  vat: number;
  total: number;
  each: number;
};

export type RentResult = {
  kind: "rent";
  rent: number;
  deposit: number;
  rentFromDeposit: number;
  monthlyEq: number;
  base: number;
  vat: number;
  total: number;
  each: number;
};

export type CommissionResult = BuyResult | RentResult;

export function calculateBuy(amount: number): BuyResult | null {
  if (amount <= 0) return null;
  const base = amount * BUY_TOTAL_RATE;
  const vat = base * VAT;
  const total = base + vat;
  return { kind: "buy", amount, base, vat, total, each: total / 2 };
}

export function calculateRent(rent: number, deposit: number): RentResult | null {
  if (rent <= 0 && deposit <= 0) return null;
  const rentFromDeposit = (deposit / 1_000_000) * DEPOSIT_TO_RENT;
  const monthlyEq = rent + rentFromDeposit;
  const base = monthlyEq * RENT_RATE;
  const vat = base * VAT;
  const total = base + vat;
  return {
    kind: "rent",
    rent,
    deposit,
    rentFromDeposit,
    monthlyEq,
    base,
    vat,
    total,
    each: total / 2,
  };
}

export function resultSummary(result: CommissionResult): string {
  if (result.kind === "buy") {
    return [
      "محاسبه کمیسیون خرید و فروش — گروه مشاورین املاک هیرمند",
      `مبلغ معامله: ${formatToman(result.amount)} تومان`,
      `کمیسیون پایه (۰٫۵٪): ${formatToman(result.base)} تومان`,
      `مالیات ارزش افزوده (۹٪): ${formatToman(result.vat)} تومان`,
      `جمع کل کمیسیون بنگاه: ${formatToman(result.total)} تومان`,
      `سهم هر طرف: ${formatToman(result.each)} تومان`,
    ].join("\n");
  }
  return [
    "محاسبه کمیسیون رهن و اجاره — گروه مشاورین املاک هیرمند",
    `اجاره ماهانه: ${formatToman(result.rent)} تومان`,
    `مبلغ رهن: ${formatToman(result.deposit)} تومان`,
    `معادل اجارهٔ رهن: ${formatToman(result.rentFromDeposit)} تومان`,
    `اجاره ماهانه معادل: ${formatToman(result.monthlyEq)} تومان`,
    `کمیسیون پایه (۲۵٪): ${formatToman(result.base)} تومان`,
    `مالیات ارزش افزوده (۹٪): ${formatToman(result.vat)} تومان`,
    `جمع کل کمیسیون بنگاه: ${formatToman(result.total)} تومان`,
    `سهم هر طرف: ${formatToman(result.each)} تومان`,
  ].join("\n");
}
