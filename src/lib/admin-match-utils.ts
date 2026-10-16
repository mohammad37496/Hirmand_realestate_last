export type AreaMatchResult = {
  score: number;
  reason: string;
  withinRange: boolean;
};

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Scores a listing's area against optional one- or two-sided customer bounds.
 * A missing listing area or absent preference is neutral (null), not a mismatch.
 */
export function scoreAreaMatch(
  areaValue: unknown,
  minValue: unknown,
  maxValue: unknown,
): AreaMatchResult | null {
  const area = finitePositive(areaValue);
  const min = finitePositive(minValue);
  const max = finitePositive(maxValue);
  if (area == null || (min == null && max == null)) return null;
  if (min != null && max != null && min > max) return null;

  const withinRange = (min == null || area >= min) && (max == null || area <= max);
  if (withinRange) {
    const reason = min != null && max != null
      ? "متراژ داخل بازهٔ درخواستی"
      : min != null
        ? "متراژ حداقل موردنظر را دارد"
        : "متراژ زیر سقف درخواستی است";
    return { score: 100, reason, withinRange: true };
  }

  const boundary = min != null && area < min ? min : max != null && area > max ? max : area;
  const distance = Math.abs(area - boundary);
  const reference = min != null && max != null
    ? Math.max(max - min, Math.max(min, max) * 0.15, 10)
    : Math.max((min ?? max ?? area) * 0.15, 10);
  const score = Math.max(0, Math.round(100 - (distance / reference) * 100));
  return {
    score,
    reason: score > 0 ? "متراژ نزدیک به بازهٔ درخواستی" : "متراژ خارج از بازهٔ درخواستی",
    withinRange: false,
  };
}

/** Normalizes common Persian/Arabic spelling and spacing differences in labels. */
export function normalizeMatchLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\s]+/g, " ")
    .toLocaleLowerCase("fa-IR");
}
