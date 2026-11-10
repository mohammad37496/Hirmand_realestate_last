import type { PropertyFilters, PropertyTransaction, PropertyType } from "@/lib/properties";
import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES } from "@/lib/site";
import { parsePersianNumberToken } from "@/lib/smart-property-search-core.mjs";

export type SmartSearchResult = {
  filters: PropertyFilters;
  summary: string[];
};

function faToEn(input: string) {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function parseMoneyToken(token: string) {
  const normalized = faToEn(token).replace(/,/g, "").replace(/٫/g, ".");
  const match = normalized.match(/([\d.]+)\s*(میلیارد|ملیارد|میلیون|m|b)?/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2]?.toLowerCase();
  if (unit === "میلیارد" || unit === "ملیارد" || unit === "b") return Math.round(number * 1_000_000_000);
  if (unit === "میلیون" || unit === "m") return Math.round(number * 1_000_000);
  return Math.round(number);
}

function findNeighborhood(query: string) {
  return [...NEIGHBORHOOD_NAMES]
    .sort((a, b) => b.length - a.length)
    .find((name) => query.includes(name)) ?? "";
}

function findPropertyType(query: string): { value: PropertyType; label: string } | null {
  const aliases: Array<{ value: PropertyType; labels: string[] }> = [
    { value: "apartment", labels: ["آپارتمان", "واحد"] },
    { value: "villa", labels: ["ویلا", "خانه ویلایی", "خانه"] },
    { value: "office", labels: ["دفتر", "اداری", "آفیس"] },
    { value: "heritage", labels: ["کلنگی", "قدیمی", "میراثی"] },
    { value: "land", labels: ["زمین", "باغ"] },
    { value: "commercial", labels: ["تجاری", "مغازه", "فروشگاه"] },
  ];
  for (const item of aliases) {
    if (item.labels.some((label) => query.includes(label))) {
      const label = PROPERTY_TYPES.find((type) => type.id === item.value)?.title ?? item.value;
      return { value: item.value, label };
    }
  }
  return null;
}

function containsPhrase(query: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s،,؛])${escaped}(?=$|[\\s،,؛])`, "u").test(query);
}

function findTransaction(query: string): { value: PropertyTransaction; label: string } | null {
  const candidates: Array<{ value: PropertyTransaction; label: string; words: string[] }> = [
    { value: "buy", label: "خرید", words: ["خرید", "بخر", "خریدنی"] },
    { value: "sell", label: "فروش", words: ["فروش", "فروختن"] },
    { value: "rent", label: "اجاره", words: ["اجاره", "اجاره‌ای", "کرایه"] },
    { value: "mortgage", label: "رهن", words: ["رهن", "رهن کامل"] },
  ];
  return candidates.find((item) => item.words.some((word) => containsPhrase(query, word))) ?? null;
}

const RESIDUAL_STOP_WORDS = new Set([
  "در", "نزدیک", "به", "با", "و", "یا", "برای", "از", "تا", "حداقل", "حداکثر", "زیر", "بالای",
  "بیشتر", "کمتر", "حدود", "تقریبا", "تقریباً", "تومان", "مبلغ", "قیمت", "بودجه", "میلیارد", "ملیارد", "میلیون",
]);

function extractResidualSearchText(input: string, neighborhood: string) {
  let residual = input;
  if (neighborhood) {
    const escaped = neighborhood.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    residual = residual.replace(new RegExp(escaped, "gu"), " ");
  }

  const recognizedPatterns = [
    /رهن\s+کامل|آپارتمان|واحد|خانه\s+ویلایی|ویلا|خانه|دفتر|اداری|آفیس|کلنگی|قدیمی|میراثی|زمین|باغ|تجاری|مغازه|فروشگاه/giu,
    /خریدنی|خرید|بخر|فروختن|فروش|اجاره‌ای|اجاره|کرایه|رهن/giu,
    /(?:\d+|یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:خوابه|خواب|اتاق\s+خواب)/giu,
    /(?:حداقل|بالای|بیشتر\s+از)\s*[\d.]+\s*(?:مترمربع|متری|متر)/giu,
    /(?:تا|حداکثر|زیر|کمتر\s+از)\s*[\d.]+\s*(?:مترمربع|متری|متر)/giu,
    /[\d.]+\s*(?:مترمربع|متری|متر)/giu,
    /(?:تا|زیر|کمتر\s+از|حداکثر|از|بالای|بیشتر\s+از)\s*[\d.,]+\s*(?:میلیارد|ملیارد|میلیون|m|b)/giu,
    /(?:بودجه|قیمت)\s*(?:تا)?\s*[\d.,]+\s*(?:میلیارد|ملیارد|میلیون|m|b)/giu,
    /[\d.,]+\s*(?:میلیارد|ملیارد|میلیون|m|b)/giu,
    /(?:اجاره|ماهانه)\s*(?:تا|زیر|حداکثر)?\s*[\d.,]+\s*(?:میلیون|m)/giu,
    /پارکینگ|آسانسور|انباری|موقعیت|نقشه/gu,
  ];
  for (const pattern of recognizedPatterns) residual = residual.replace(pattern, " ");

  return residual
    .replace(/[،,؛;:!?؟()[\]{}]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !RESIDUAL_STOP_WORDS.has(token))
    .join(" ")
    .slice(0, 80);
}

function captureNumber(query: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      const n = parsePersianNumberToken(match[1]);
      if (n != null && Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function parseSmartPropertySearch(input: string): SmartSearchResult {
  const original = faToEn(input).trim().replace(/\s+/g, " ");
  const query = original.toLowerCase();
  const filters: PropertyFilters = { sort: "newest", offset: 0 };
  const summary: string[] = [];

  const transaction = findTransaction(query);
  if (transaction) {
    filters.transactionType = transaction.value;
    summary.push(transaction.label);
  }

  const propertyType = findPropertyType(query);
  if (propertyType) {
    filters.propertyType = propertyType.value;
    summary.push(propertyType.label);
  }

  const neighborhood = findNeighborhood(original);
  if (neighborhood) {
    filters.neighborhood = neighborhood;
    summary.push(neighborhood);
  }

  const bedrooms = captureNumber(query, [
    /(\d+|یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:خوابه|خواب|اتاق خواب)/,
    /(?:با|و)\s*(\d+|یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:خواب|خوابه)/,
  ]);
  if (bedrooms != null) {
    filters.minBedrooms = Math.max(0, Math.floor(bedrooms));
    summary.push(bedrooms.toLocaleString("fa-IR") + " خواب به بالا");
  }

  const areaMin = captureNumber(query, [
    /(?:حداقل|بالای|بیشتر از)\s*(\d+)\s*(?:متر|مترمربع|متری)/,
  ]);
  const areaMax = captureNumber(query, [
    /(?:تا|حداکثر|زیر|کمتر از)\s*(\d+)\s*(?:متر|مترمربع|متری)/,
  ]);
  if (areaMin != null) {
    filters.minArea = Math.max(0, Math.floor(areaMin));
    summary.push("متراژ از " + areaMin.toLocaleString("fa-IR") + " متر");
  }
  if (areaMax != null) {
    filters.maxArea = Math.max(0, Math.floor(areaMax));
    summary.push("تا " + areaMax.toLocaleString("fa-IR") + " متر");
  }
  if (areaMin == null && areaMax == null) {
    const exactArea = captureNumber(query, [/(\d+)\s*(?:مترمربع|متر|متری)/]);
    if (exactArea != null) {
      filters.minArea = Math.max(0, Math.floor(exactArea));
      filters.maxArea = Math.max(0, Math.floor(exactArea));
      summary.push("متراژ " + exactArea.toLocaleString("fa-IR") + " متر");
    }
  }

  if (query.includes("پارکینگ")) {
    filters.parkingOnly = true;
    summary.push("پارکینگ");
  }
  if (query.includes("آسانسور")) {
    filters.elevatorOnly = true;
    summary.push("آسانسور");
  }
  if (query.includes("انباری")) {
    filters.storageOnly = true;
    summary.push("انباری");
  }
  if (query.includes("موقعیت") || query.includes("نقشه")) {
    filters.hasLocationOnly = true;
    summary.push("دارای موقعیت مکانی");
  }

  const billionMax = query.match(/(?:تا|زیر|کمتر از|حداکثر)\s*([\d۰-۹.,]+)\s*(میلیارد|ملیارد|b)/);
  const millionMax = query.match(/(?:تا|زیر|کمتر از|حداکثر)\s*([\d۰-۹.,]+)\s*(میلیون|m)/);
  const rawMax = billionMax?.[1] && billionMax?.[2]
    ? parseMoneyToken(billionMax[1] + " " + billionMax[2])
    : millionMax?.[1] && millionMax?.[2]
      ? parseMoneyToken(millionMax[1] + " " + millionMax[2])
      : null;

  const billionMin = query.match(/(?:از|بالای|بیشتر از)\s*([\d۰-۹.,]+)\s*(میلیارد|ملیارد|b)/);
  const millionMin = query.match(/(?:از|بالای|بیشتر از)\s*([\d۰-۹.,]+)\s*(میلیون|m)/);
  const rawMin = billionMin?.[1] && billionMin?.[2]
    ? parseMoneyToken(billionMin[1] + " " + billionMin[2])
    : millionMin?.[1] && millionMin?.[2]
      ? parseMoneyToken(millionMin[1] + " " + millionMin[2])
      : null;

  if (rawMax != null) {
    filters.maxPrice = rawMax;
    summary.push("تا " + rawMax.toLocaleString("fa-IR") + " تومان");
  }
  if (rawMin != null) {
    filters.minPrice = rawMin;
    summary.push("از " + rawMin.toLocaleString("fa-IR") + " تومان");
  }

  if (filters.transactionType === "rent" || filters.transactionType === "mortgage") {
    const rentMax = query.match(/(?:اجاره|ماهانه)\s*(?:تا|زیر|حداکثر)?\s*([\d.,]+)\s*(میلیون|m)/);
    if (rentMax?.[1]) {
      const amount = parseMoneyToken(rentMax[1] + " " + rentMax[2]);
      if (amount != null) {
        filters.maxPrice = amount;
        summary.push("اجاره تا " + amount.toLocaleString("fa-IR") + " تومان");
      }
    }
  }

  if (filters.minPrice == null && filters.maxPrice == null) {
    const looseBudget = query.match(/(?:بودجه|قیمت)\s*(?:تا)?\s*([\d.,]+)\s*(میلیارد|ملیارد|میلیون|m|b)/);
    if (looseBudget?.[1] && looseBudget?.[2]) {
      const amount = parseMoneyToken(looseBudget[1] + " " + looseBudget[2]);
      if (amount != null) {
        filters.maxPrice = amount;
        summary.push("بودجه تا " + amount.toLocaleString("fa-IR") + " تومان");
      }
    }
  }

  if (!summary.length) {
    filters.search = original.slice(0, 80);
    summary.push("جستجوی متنی");
  } else {
    const residualSearch = extractResidualSearchText(original, neighborhood);
    if (residualSearch) {
      filters.search = residualSearch;
      summary.push("عبارت متنی: " + residualSearch);
    }
  }
  return { filters, summary: [...new Set(summary)] };
}
