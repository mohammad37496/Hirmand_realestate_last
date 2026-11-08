/** Keep consultant target amounts as decimal strings from request through SQL and JSON. */
export function normalizeConsultantTargetMoney(value: unknown): string {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) return "0";
  if (typeof value !== "string" && typeof value !== "number") return "0";
  const source = String(value).trim();
  if (!source || source.length > 40) return "0";
  const raw = source
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٫]/g, ".")
    .replace(/[٬،,\s]/g, "");
  return /^\d{1,20}(?:\.\d+)?$/.test(raw) ? raw : "0";
}
