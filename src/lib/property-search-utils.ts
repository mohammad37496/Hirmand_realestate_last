const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

/** Canonicalize Persian/Arabic variants while retaining readable word spacing. */
export function normalizeSearchText(value: unknown): string {
  return toLatinDigits(value)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replaceAll("\u200c", "").replaceAll("\u200d", "").replaceAll("\u200e", "").replaceAll("\u200f", "").replaceAll("\uFEFF", "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa");
}

/** Compact form for matching token spelling regardless of spaces and punctuation. */
export function compactSearchText(value: unknown): string {
  return normalizeSearchText(value).replace(/[\s\p{P}\p{S}]+/gu, "");
}

export type IntegerFilterOptions = {
  min?: number;
  max?: number;
  allowNegative?: boolean;
};

export type IntegerFilterParseResult = {
  value: number | undefined;
  valid: boolean;
};

/**
 * Accepts Persian/Arabic/Latin digits and conventional thousands separators.
 * Empty input is valid and means "no bound". Malformed text is not silently
 * converted to an unfiltered query.
 */
export function parseIntegerFilter(
  value: unknown,
  options: IntegerFilterOptions = {},
): IntegerFilterParseResult {
  if (value == null) return { value: undefined, valid: true };
  if (typeof value !== "string" && typeof value !== "number") return { value: undefined, valid: false };
  const raw = String(value).trim();
  if (!raw) return { value: undefined, valid: true };

  const normalized = toLatinDigits(raw).replace(/[\s,،٬]/g, "");
  if (!/^-?\d+$/.test(normalized)) return { value: undefined, valid: false };

  const parsed = Number(normalized);
  const min = options.min ?? (options.allowNegative ? Number.MIN_SAFE_INTEGER : 0);
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { value: undefined, valid: false };
  }
  if (!options.allowNegative && parsed < 0) return { value: undefined, valid: false };
  return { value: parsed, valid: true };
}

export type IntegerFilterField = {
  key: string;
  label: string;
  value: unknown;
  min?: number;
  max: number;
  allowNegative?: boolean;
};

export function validateIntegerFilterFields(fields: IntegerFilterField[]): string[] {
  return fields.flatMap((field) => {
    const parsed = parseIntegerFilter(field.value, {
      min: field.min,
      max: field.max,
      allowNegative: field.allowNegative,
    });
    return parsed.valid ? [] : [field.label];
  });
}

/** Match the supported public filter contract for numeric inputs in the UI. */
export function validatePropertySearchNumbers(values: Record<string, unknown>): string[] {
  const errors = validateIntegerFilterFields([
    { key: "minArea", label: "حداقل متراژ", value: values.minArea, max: 100_000 },
    { key: "maxArea", label: "حداکثر متراژ", value: values.maxArea, max: 100_000 },
    { key: "minPrice", label: "حداقل قیمت", value: values.minPrice, max: 999_999_999_999_999 },
    { key: "maxPrice", label: "حداکثر قیمت", value: values.maxPrice, max: 999_999_999_999_999 },
    { key: "minDeposit", label: "حداقل ودیعه", value: values.minDeposit, max: 999_999_999_999_999 },
    { key: "maxDeposit", label: "حداکثر ودیعه", value: values.maxDeposit, max: 999_999_999_999_999 },
    { key: "minRent", label: "حداقل اجاره", value: values.minRent, max: 999_999_999_999_999 },
    { key: "maxRent", label: "حداکثر اجاره", value: values.maxRent, max: 999_999_999_999_999 },
    { key: "minBedrooms", label: "حداقل اتاق", value: values.minBedrooms, max: 30 },
    { key: "minBathrooms", label: "حداقل حمام", value: values.minBathrooms, max: 30 },
    { key: "minFloor", label: "طبقه از", value: values.minFloor, min: -60, max: 200, allowNegative: true },
    { key: "maxFloor", label: "طبقه تا", value: values.maxFloor, min: -60, max: 200, allowNegative: true },
    { key: "minTotalFloors", label: "حداقل تعداد طبقات", value: values.minTotalFloors, max: 200 },
    { key: "maxTotalFloors", label: "حداکثر تعداد طبقات", value: values.maxTotalFloors, max: 200 },
    { key: "minBuiltYear", label: "سال ساخت از", value: values.minBuiltYear, min: 1200, max: 2500 },
    { key: "maxBuiltYear", label: "سال ساخت تا", value: values.maxBuiltYear, min: 1200, max: 2500 },
  ]);

  const ranges = [
    ["minArea", "maxArea", "متراژ", { min: 0, max: 100_000 }],
    ["minPrice", "maxPrice", "قیمت", { min: 0, max: 999_999_999_999_999 }],
    ["minDeposit", "maxDeposit", "ودیعه", { min: 0, max: 999_999_999_999_999 }],
    ["minRent", "maxRent", "اجاره", { min: 0, max: 999_999_999_999_999 }],
    ["minFloor", "maxFloor", "طبقه", { min: -60, max: 200, allowNegative: true }],
    ["minTotalFloors", "maxTotalFloors", "تعداد طبقات", { min: 0, max: 200 }],
    ["minBuiltYear", "maxBuiltYear", "سال ساخت", { min: 1200, max: 2500 }],
  ] as const;
  for (const [minKey, maxKey, label, options] of ranges) {
    const minimum = parseIntegerFilter(values[minKey], options);
    const maximum = parseIntegerFilter(values[maxKey], options);
    if (minimum.valid && maximum.valid && minimum.value !== undefined && maximum.value !== undefined && minimum.value > maximum.value) {
      errors.push(`بازهٔ ${label}`);
    }
  }
  return errors;
}
