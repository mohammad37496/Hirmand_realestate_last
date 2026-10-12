import { formatFaNumber, formatToman } from "@/lib/money";

export const DEPOSIT_PRESETS = [
  { id: "short", title: "کوتاه‌مدت عادی", rate: 5, hint: "برداشت آزاد" },
  { id: "special", title: "کوتاه‌مدت ویژه", rate: 10, hint: "مانده بالاتر" },
  { id: "y1", title: "بلندمدت یک‌ساله", rate: 20.5, hint: "رایج بانک‌ها" },
  { id: "y2", title: "بلندمدت دوساله", rate: 21.5, hint: "نرخ بالاتر" },
  { id: "y3", title: "بلندمدت سه‌ساله", rate: 22.5, hint: "بیشترین سود" },
] as const;

export type DepositResult = {
  principal: number;
  annualRate: number;
  months: number;
  monthlyProfit: number;
  totalProfit: number;
  finalAmount: number;
  dailyProfit: number;
};

export function calculateDeposit(
  principal: number,
  annualRate: number,
  months: number,
): DepositResult | null {
  if (principal <= 0 || annualRate <= 0 || months <= 0) return null;
  const monthlyProfit = (principal * annualRate) / 1200;
  const totalProfit = monthlyProfit * months;
  return {
    principal,
    annualRate,
    months,
    monthlyProfit,
    totalProfit,
    finalAmount: principal + totalProfit,
    dailyProfit: (principal * annualRate) / 36500,
  };
}

export function depositSummary(result: DepositResult): string {
  return [
    "محاسبه سود سپرده بانکی — گروه مشاورین املاک هیرمند",
    `مبلغ سپرده: ${formatToman(result.principal)} تومان`,
    `نرخ سود سالانه: ${formatFaNumber(result.annualRate, 1)}٪`,
    `مدت: ${formatFaNumber(result.months, 0)} ماه`,
    `سود ماهانه: ${formatToman(result.monthlyProfit)} تومان`,
    `سود کل دوره: ${formatToman(result.totalProfit)} تومان`,
    `مبلغ نهایی: ${formatToman(result.finalAmount)} تومان`,
  ].join("\n");
}

export type LoanMethod = "annuity" | "simple";

export type LoanResult = {
  method: LoanMethod;
  principal: number;
  annualRate: number;
  months: number;
  installment: number;
  totalPay: number;
  totalInterest: number;
  interestShare: number;
};

export function calculateLoan(
  principal: number,
  annualRate: number,
  months: number,
  method: LoanMethod,
): LoanResult | null {
  if (principal <= 0 || months <= 0 || annualRate < 0) return null;

  if (method === "simple") {
    const totalInterest = (principal * annualRate * months) / 1200;
    const totalPay = principal + totalInterest;
    return {
      method,
      principal,
      annualRate,
      months,
      installment: totalPay / months,
      totalPay,
      totalInterest,
      interestShare: totalPay > 0 ? totalInterest / totalPay : 0,
    };
  }

  const i = annualRate / 1200;
  if (i === 0) {
    return {
      method,
      principal,
      annualRate,
      months,
      installment: principal / months,
      totalPay: principal,
      totalInterest: 0,
      interestShare: 0,
    };
  }

  const factor = (1 + i) ** months;
  const installment = (principal * i * factor) / (factor - 1);
  const totalPay = installment * months;
  const totalInterest = totalPay - principal;
  return {
    method,
    principal,
    annualRate,
    months,
    installment,
    totalPay,
    totalInterest,
    interestShare: totalPay > 0 ? totalInterest / totalPay : 0,
  };
}

export function loanSummary(result: LoanResult): string {
  const methodLabel =
    result.method === "annuity" ? "اقساط مساوی (مانده نزولی)" : "سود ساده";
  return [
    "محاسبه اقساط و سود وام بانکی — گروه مشاورین املاک هیرمند",
    `روش: ${methodLabel}`,
    `مبلغ وام: ${formatToman(result.principal)} تومان`,
    `نرخ سود سالانه: ${formatFaNumber(result.annualRate, 1)}٪`,
    `تعداد اقساط: ${formatFaNumber(result.months, 0)} ماه`,
    `قسط ماهانه: ${formatToman(result.installment)} تومان`,
    `مجموع سود: ${formatToman(result.totalInterest)} تومان`,
    `جمع کل پرداختی: ${formatToman(result.totalPay)} تومان`,
  ].join("\n");
}

/** تومان اجاره ماهانه به‌ازای هر ۱ میلیون تومان رهن */
export const RAHN_RATE_PRESETS = [20_000, 30_000, 40_000] as const;
export const DEFAULT_RAHN_RATE = 30_000;

export type RahnRentSplit = {
  totalRahn: number;
  rate: number;
  rentShare: number;
  rahn: number;
  rent: number;
  totalRentEq: number;
};

export function splitRahnRent(
  totalRahn: number,
  rentShare: number,
  rate = DEFAULT_RAHN_RATE,
): RahnRentSplit | null {
  if (totalRahn <= 0 || rate <= 0) return null;
  const share = Math.min(1, Math.max(0, rentShare));
  const totalRentEq = (totalRahn / 1_000_000) * rate;
  const rent = totalRentEq * share;
  const rahn = ((totalRentEq - rent) / rate) * 1_000_000;
  return { totalRahn, rate, rentShare: share, rahn, rent, totalRentEq };
}

export function rahnFromRent(rent: number, rate = DEFAULT_RAHN_RATE): number {
  if (rent <= 0 || rate <= 0) return 0;
  return (rent / rate) * 1_000_000;
}

export function rentFromRahn(rahn: number, rate = DEFAULT_RAHN_RATE): number {
  if (rahn <= 0 || rate <= 0) return 0;
  return (rahn / 1_000_000) * rate;
}

export function rahnRentSummary(result: RahnRentSplit): string {
  return [
    "تبدیل رهن به اجاره — گروه مشاورین املاک هیرمند",
    `ارزش کل (معادل رهن): ${formatToman(result.totalRahn)} تومان`,
    `نرخ تبدیل: هر ۱ میلیون رهن ≈ ${formatToman(result.rate)} تومان اجاره`,
    `رهن: ${formatToman(result.rahn)} تومان`,
    `اجاره ماهانه: ${formatToman(result.rent)} تومان`,
    `سهم اجاره از کل ارزش: ${formatFaNumber(result.rentShare * 100, 0)}٪`,
  ].join("\n");
}
