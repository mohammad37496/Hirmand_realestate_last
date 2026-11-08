import { subtractDecimalStrings } from "./decimal-money.ts";

/** Keep PostgreSQL numeric money values as decimal strings across JSON boundaries. */
export function normalizeFinanceMoney(value: unknown): string {
  const raw = String(value ?? "0").trim();
  return /^-?\d+(?:\.\d+)?$/.test(raw) ? raw : "0";
}

/** The ledger stores whole tomans in numeric(20,0), so accept at most 20 digits. */
export function parseFinanceAmount(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s٬،,]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const canonical = normalized.replace(/^0+(?=\d)/, "");
  return canonical.length <= 20 ? canonical : null;
}

export function financeMoneySummary(income: unknown, expense: unknown) {
  const exactIncome = normalizeFinanceMoney(income);
  const exactExpense = normalizeFinanceMoney(expense);
  return {
    income: exactIncome,
    expense: exactExpense,
    balance: subtractDecimalStrings(exactIncome, exactExpense),
  };
}
