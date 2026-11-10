export type CommissionRateConfig = {
  city: string;
  /** Total sale commission charged to both parties together. */
  saleTotalPercent: number;
  /** Deposit-based commission charged to each party. */
  rentDepositPercent: number;
  /** Monthly-rent commission charged to each party. */
  rentMonthlyPercent: number;
  vatPercent: number;
  sourceLabel: string;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo: string;
  verified: boolean;
};

/** The percentage calculator is an estimate, not the statutory county tariff model. */
export const COMMISSION_LEGAL_BASIS_NOTICE =
  "طبق آیین‌نامه اجرایی تبصره ۱ ماده ۳ قانون الزام به ثبت رسمی معاملات اموال غیرمنقول (مصوب ۱۴۰۴/۰۷/۰۲)، تعرفه رسمی بر پایه ضریب ارزش معاملاتی ملک موضوع ماده ۶۴ و سقف مصوب شهرستان تعیین می‌شود و باید در سامانه ثبت الکترونیک اسناد محاسبه شود. این ابزار فعلاً نرخ‌های درصدی مدیریتی را برای برآورد ساده روی مبلغ معامله، اجاره یا رهن اعمال می‌کند؛ تا اتصال به ضریب، ارزش معاملاتی و سقف معتبر شهرستان، خروجی تعرفه رسمی یا مبلغ قابل مطالبه نیست.";

/** Illustrative defaults only. They are not presented as an official Isfahan tariff. */
export const DEFAULT_COMMISSION_RATES: CommissionRateConfig = {
  city: "اصفهان",
  saleTotalPercent: 0.5,
  rentDepositPercent: 0.5,
  rentMonthlyPercent: 25,
  vatPercent: 10,
  sourceLabel: "",
  sourceUrl: "",
  effectiveFrom: "",
  effectiveTo: "",
  verified: false,
};

/** Any edit to a rate, city, source or validity window revokes prior approval. */
export function updateCommissionRateConfig<K extends keyof CommissionRateConfig>(
  current: CommissionRateConfig,
  key: K,
  value: CommissionRateConfig[K],
): CommissionRateConfig {
  return {
    ...current,
    [key]: value,
    ...(key === "verified" ? {} : { verified: false }),
  };
}

function safeDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? "" : value;
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Normalize persisted JSON without trusting its shape or numeric values. */
export function normalizeCommissionRates(value: unknown): CommissionRateConfig {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = null;
    }
  }
  const record = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
  const percent = (key: keyof CommissionRateConfig, fallback: number, min: number, max: number) => {
    const parsed = Number(record[key]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  };
  const effectiveFrom = safeDate(record.effectiveFrom);
  const effectiveTo = safeDate(record.effectiveTo);
  const rawEffectiveTo = typeof record.effectiveTo === "string" ? record.effectiveTo.trim() : "";
  const invalidEffectiveTo = Boolean(rawEffectiveTo && !effectiveTo);
  const sourceLabel = typeof record.sourceLabel === "string" ? record.sourceLabel.trim().slice(0, 200) : "";
  const sourceUrl = safeHttpsUrl(record.sourceUrl);
  return {
    city: typeof record.city === "string" && record.city.trim() ? record.city.trim().slice(0, 80) : DEFAULT_COMMISSION_RATES.city,
    saleTotalPercent: percent("saleTotalPercent", DEFAULT_COMMISSION_RATES.saleTotalPercent, 0.001, 5),
    rentDepositPercent: percent("rentDepositPercent", DEFAULT_COMMISSION_RATES.rentDepositPercent, 0, 5),
    rentMonthlyPercent: percent("rentMonthlyPercent", DEFAULT_COMMISSION_RATES.rentMonthlyPercent, 0.01, 100),
    vatPercent: percent("vatPercent", DEFAULT_COMMISSION_RATES.vatPercent, 0, 25),
    sourceLabel,
    sourceUrl,
    effectiveFrom,
    effectiveTo,
    verified: record.verified === true && Boolean(sourceLabel && sourceUrl && effectiveFrom) &&
      !invalidEffectiveTo && (!effectiveTo || effectiveTo >= effectiveFrom),
  };
}

export type CommissionRateStatus = "verified" | "unverified" | "upcoming" | "expired";

function tehranDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function commissionRateStatus(rates: CommissionRateConfig, now = new Date()): CommissionRateStatus {
  if (!rates.verified || !rates.sourceLabel || !safeHttpsUrl(rates.sourceUrl) || !rates.effectiveFrom) return "unverified";
  const today = tehranDate(now);
  if (today < rates.effectiveFrom) return "upcoming";
  if (rates.effectiveTo && today > rates.effectiveTo) return "expired";
  return "verified";
}

export type BuyResult = {
  kind: "buy";
  amount: number;
  base: number;
  vat: number;
  total: number;
  each: number;
  rates: CommissionRateConfig;
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
  rates: CommissionRateConfig;
};

export type CommissionResult = BuyResult | RentResult;

function roundToman(value: number) {
  return Math.round(value);
}

function formatToman(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function percentLabel(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value) + "٪";
}

export function calculateBuy(amount: number, inputRates: CommissionRateConfig = DEFAULT_COMMISSION_RATES): BuyResult | null {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000_000) return null;
  const rates = normalizeCommissionRates(inputRates);
  const base = roundToman(amount * rates.saleTotalPercent / 100);
  const vat = roundToman(base * rates.vatPercent / 100);
  const total = base + vat;
  return { kind: "buy", amount, base, vat, total, each: total / 2, rates };
}

export function calculateRent(rent: number, deposit: number, inputRates: CommissionRateConfig = DEFAULT_COMMISSION_RATES): RentResult | null {
  if (
    !Number.isFinite(rent) || !Number.isFinite(deposit) || rent < 0 || deposit < 0 ||
    rent > 1_000_000_000_000_000 || deposit > 1_000_000_000_000_000 || (rent <= 0 && deposit <= 0)
  ) return null;
  const rates = normalizeCommissionRates(inputRates);
  const rentFromDeposit = rates.rentMonthlyPercent > 0
    ? roundToman(deposit * rates.rentDepositPercent / rates.rentMonthlyPercent)
    : 0;
  const monthlyEq = rent + rentFromDeposit;
  const baseEach = roundToman(rent * rates.rentMonthlyPercent / 100 + deposit * rates.rentDepositPercent / 100);
  const base = baseEach * 2;
  const vat = roundToman(base * rates.vatPercent / 100);
  const total = base + vat;
  return { kind: "rent", rent, deposit, rentFromDeposit, monthlyEq, base, vat, total, each: total / 2, rates };
}

export function resultSummary(result: CommissionResult): string {
  const vatLabel = `برآورد مالیات ارزش افزوده (${percentLabel(result.rates.vatPercent)}): ${formatToman(result.vat)} تومان`;
  const status = commissionRateStatus(result.rates);
  const rateNote = status === "verified"
    ? `وضعیت نرخ: تأیید داخلی مدیریت (نه تأیید رسمی/قانونی) | منبع: ${result.rates.sourceLabel} | ${result.rates.sourceUrl} | اعتبار: ${result.rates.effectiveFrom} تا ${result.rates.effectiveTo || "بدون تاریخ پایان ثبت‌شده"}`
    : `وضعیت نرخ: تأییدنشده و صرفاً برآورد برای ${result.rates.city}`;
  if (result.kind === "buy") {
    return [
      "برآورد نمونه کمیسیون خرید و فروش — گروه مشاورین املاک هیرمند",
      `شهر مبنا: ${result.rates.city}`,
      rateNote,
      COMMISSION_LEGAL_BASIS_NOTICE,
      `مبلغ معامله: ${formatToman(result.amount)} تومان`,
      `کمیسیون پایه برآوردی کل (${percentLabel(result.rates.saleTotalPercent)}): ${formatToman(result.base)} تومان`,
      vatLabel,
      `جمع کل برآوردی بنگاه: ${formatToman(result.total)} تومان`,
      `سهم برآوردی هر طرف: ${formatToman(result.each)} تومان`,
    ].join("\n");
  }
  return [
    "برآورد نمونه کمیسیون رهن و اجاره — گروه مشاورین املاک هیرمند",
    `شهر مبنا: ${result.rates.city}`,
    rateNote,
    COMMISSION_LEGAL_BASIS_NOTICE,
    `اجاره ماهانه: ${formatToman(result.rent)} تومان`,
    `مبلغ رهن: ${formatToman(result.deposit)} تومان`,
    `معادل اجارهٔ رهن: ${formatToman(result.rentFromDeposit)} تومان`,
    `اجاره ماهانه معادل: ${formatToman(result.monthlyEq)} تومان`,
    `کمیسیون پایه برآوردی هر طرف: ${percentLabel(result.rates.rentMonthlyPercent)} اجاره + ${percentLabel(result.rates.rentDepositPercent)} رهن`,
    `جمع کمیسیون پایه برآوردی دو طرف: ${formatToman(result.base)} تومان`,
    vatLabel,
    `جمع کل برآوردی بنگاه: ${formatToman(result.total)} تومان`,
    `سهم برآوردی هر طرف: ${formatToman(result.each)} تومان`,
  ].join("\n");
}
