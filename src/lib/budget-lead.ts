import { DEFAULT_MATCH_RAHN_RATE, totalRahnEquivalent, type BudgetInput } from "./budget-matching.ts";

export type BudgetLeadMatch = {
  slug: string;
  title: string;
  tier: "within" | "convertible" | "near";
  score: number;
  suggestedDeposit: number;
  suggestedRent: number;
  gapEquivalent?: number;
  reason?: string;
};

export type BudgetLeadPayload = {
  name: string;
  phone: string;
  depositBudget: number;
  rentBudget: number;
  propertyType?: string;
  neighborhood?: string;
  bedrooms?: number;
  matches: BudgetLeadMatch[];
  note?: string;
};

export function budgetEquivalent(payload: Pick<BudgetLeadPayload, "depositBudget" | "rentBudget">) {
  const budget: BudgetInput = {
    depositBudget: payload.depositBudget,
    rentBudget: payload.rentBudget,
  };
  return totalRahnEquivalent(budget.depositBudget, budget.rentBudget, DEFAULT_MATCH_RAHN_RATE);
}

export function buildBudgetLeadNote(payload: BudgetLeadPayload): string {
  const lines = [
    "بودجه جستجوی هوشمند: رهن " + Math.round(payload.depositBudget).toLocaleString("fa-IR") + " تومان",
    "اجاره ماهانه " + Math.round(payload.rentBudget).toLocaleString("fa-IR") + " تومان",
    payload.propertyType ? "نوع ملک: " + payload.propertyType : "",
    payload.neighborhood ? "محله: " + payload.neighborhood : "",
    payload.bedrooms ? "حداقل خواب: " + payload.bedrooms : "",
    "معادل رهنی بودجه: " + Math.round(budgetEquivalent(payload)).toLocaleString("fa-IR") + " تومان",
    payload.matches.length ? "تعداد فایل‌های پیشنهادی در زمان ثبت: " + payload.matches.length : "",
    payload.note?.trim() ? "یادداشت: " + payload.note.trim() : "",
  ];
  return lines.filter(Boolean).join("\n");
}