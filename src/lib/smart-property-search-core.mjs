const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const PERSIAN_NUMBER_WORDS = new Map([
  ["یک", 1],
  ["یه", 1],
  ["دو", 2],
  ["سه", 3],
  ["چهار", 4],
  ["پنج", 5],
  ["شش", 6],
  ["هفت", 7],
  ["هشت", 8],
  ["نه", 9],
  ["ده", 10],
]);

/** Parse the small, explicit number vocabulary used by natural-language filters.
 * @param {unknown} value
 */
export function parsePersianNumberToken(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return PERSIAN_NUMBER_WORDS.get(normalized) ?? null;
}
