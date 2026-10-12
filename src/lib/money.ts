const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function parseAmount(raw: string): number {
  if (!raw) return 0;
  const digits = raw
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseDecimal(raw: string): number {
  if (!raw) return 0;
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatToman(n: number): string {
  if (!n) return "۰";
  return Math.round(n).toLocaleString("fa-IR");
}

export function formatGroupedInput(raw: string): string {
  const n = parseAmount(raw);
  return n ? n.toLocaleString("fa-IR") : "";
}

export function formatRateInput(raw: string): string {
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
  return normalized;
}

export function formatFaNumber(n: number, digits = 0): string {
  return n.toLocaleString("fa-IR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

const ONES = [
  "",
  "یک",
  "دو",
  "سه",
  "چهار",
  "پنج",
  "شش",
  "هفت",
  "هشت",
  "نه",
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];

function underThousand(n: number): string {
  if (n <= 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} و ${ONES[o]}` : TENS[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${HUNDREDS[h]} و ${underThousand(rest)}` : HUNDREDS[h];
}

export function tomanToWords(n: number): string {
  const amount = Math.round(n);
  if (amount <= 0) return "";
  if (amount >= 1e15) return `${formatToman(amount)} تومان`;

  const parts: string[] = [];
  let remaining = amount;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const words = underThousand(chunk);
      parts.unshift(SCALES[scale] ? `${words} ${SCALES[scale]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return `${parts.join(" و ")} تومان`;
}
