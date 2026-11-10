import type { PropertyCardData } from "@/lib/properties";

export const SMART_MATCH_WEIGHTS = Object.freeze({
  budget: 30,
  neighborhoods: 20,
  area: 20,
  bedrooms: 15,
  amenities: 15,
});

export type SmartMatchPreferences = {
  minPrice?: number;
  maxPrice?: number;
  neighborhoods: string[];
  minArea?: number;
  maxArea?: number;
  exactBedrooms?: number;
  minBedrooms?: number;
  amenities: Array<"parking" | "elevator" | "storage">;
};

export function parseSmartBudgetAmount(value: string): number {
  if (/[−-]/.test(value)) return 0;
  const digits = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/[٬,\s]/g, "")
    .replace(/[^\d.]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return 0;
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const normalized = value.toLowerCase();
  if (normalized.includes("میلیارد") || normalized.includes("billion") || /(?:^|\s)b(?:\s|$)/i.test(normalized)) return Math.round(amount * 1_000_000_000);
  if (normalized.includes("میلیون") || normalized.includes("million") || /(?:^|\s)m(?:\s|$)/i.test(normalized)) return Math.round(amount * 1_000_000);
  return amount;
}

export function smartMatchReasons(property: PropertyCardData, preferences: SmartMatchPreferences): string[] {
  const reasons: string[] = [];
  const price = Number(property.price ?? 0);
  const area = property.areaM2 ?? 0;
  if ((preferences.minPrice !== undefined || preferences.maxPrice !== undefined) && price > 0) {
    const withinMin = preferences.minPrice === undefined || price >= preferences.minPrice;
    const withinMax = preferences.maxPrice === undefined || price <= preferences.maxPrice;
    reasons.push(withinMin && withinMax ? "بودجه در محدوده انتخابی" : "نزدیک به بودجه انتخابی");
  }
  if (preferences.neighborhoods.length && preferences.neighborhoods.includes(property.neighborhood)) {
    reasons.push(`محدوده ${property.neighborhood}`);
  }
  if ((preferences.minArea !== undefined || preferences.maxArea !== undefined) && area > 0) {
    const withinMin = preferences.minArea === undefined || area >= preferences.minArea;
    const withinMax = preferences.maxArea === undefined || area <= preferences.maxArea;
    reasons.push(withinMin && withinMax ? "متراژ در بازه انتخابی" : "متراژ نزدیک به بازه انتخابی");
  }
  if (preferences.exactBedrooms !== undefined && property.bedrooms !== null) {
    reasons.push(property.bedrooms === preferences.exactBedrooms ? "تعداد خواب مطابق انتخاب شما" : "تعداد خواب متفاوت از انتخاب شما");
  } else if (preferences.minBedrooms !== undefined && property.bedrooms !== null) {
    reasons.push(property.bedrooms >= preferences.minBedrooms ? "تعداد خواب مطابق نیاز" : "تعداد خواب کمتر از حداقل انتخابی");
  } else if (preferences.exactBedrooms !== undefined || preferences.minBedrooms !== undefined) {
    reasons.push("تعداد خواب در آگهی ثبت نشده");
  }
  if (preferences.amenities.length) {
    const matched = preferences.amenities.filter((amenity) => property[amenity]).length;
    if (matched) reasons.push(`${matched.toLocaleString("fa-IR")} از ${preferences.amenities.length.toLocaleString("fa-IR")} امکانات انتخابی`);
  }
  return reasons;
}
