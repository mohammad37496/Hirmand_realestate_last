/**
 * Pure Divar helpers shared by the admin panel and the tests.
 *
 * This module is intentionally dependency-free (type-only imports) so it can be
 * loaded by `node --test` without pulling in the server-only imports of
 * `@/lib/divar`. The gallery-health, completeness, filtering and sorting rules
 * used to live inline in the panel, where the filter button and the badge had
 * already drifted apart and disagreed about the same file.
 */
import type {
  DivarFile,
  DivarFilterStatus,
  DivarPropertyType,
  DivarSyncRun,
  DivarTransaction,
} from "./divar";

/** Divar advertises up to 60 photos, but only this many are ever published. */
export const DIVAR_MAX_PUBLISHED_IMAGES = 20;

export const DIVAR_TRANSACTION_LABELS: Record<DivarTransaction, string> = {
  sell: "فروش",
  rent: "رهن و اجاره",
};

export const DIVAR_PROPERTY_LABELS: Record<DivarPropertyType, string> = {
  apartment: "آپارتمان",
  villa: "ویلا",
};

export const DIVAR_STATUS_LABELS: Record<DivarFilterStatus, string> = {
  accepted: "آماده انتشار",
  imported: "منتشرشده",
  rejected: "ردشده",
};

export const DIVAR_ORIENTATION_LABELS: Record<
  NonNullable<DivarFile["orientation"]>,
  string
> = {
  north: "شمالی",
  south: "جنوبی",
  east: "شرقی",
  west: "غربی",
  northeast: "شمال‌شرقی",
  northwest: "شمال‌غربی",
  southeast: "جنوب‌شرقی",
  southwest: "جنوب‌غربی",
  two_fronts: "دو نبش",
  three_fronts: "سه نبش",
  four_fronts: "چهار نبش",
  other: "سایر",
};

/* -------------------------------------------------------------------------- */
/* Gallery health                                                             */
/* -------------------------------------------------------------------------- */

export type DivarGalleryLevel = "complete" | "partial" | "missing" | "empty";

export type DivarGalleryHealth = {
  /** `source` images found on the Divar ad (capped at the publish limit). */
  expected: number;
  /** Images actually attached to the published site listing. */
  published: number;
  /** Images copied onto Hirmand storage. */
  hosted: number;
  /** Images still rendered from Divar's CDN through the site proxy. */
  remote: number;
  level: DivarGalleryLevel;
  /** Only real gallery gaps are "repairable" — see `divarGalleryHealth`. */
  needsRepair: boolean;
  label: string;
};

/**
 * A gallery only counts as broken when the *published* gallery is short of the
 * photos the ad offered. A listing whose photos are still proxied from Divar is
 * complete for visitors, so it is reported as a note (`remote`) rather than as
 * a permanent red "needs repair" badge that no retry can ever clear.
 */
export function divarGalleryHealth(file: {
  sourceImageCount: number;
  publishedImageCount: number;
  publishedHostedImageCount: number;
  publishedRemoteImageCount: number;
  filterStatus: DivarFilterStatus;
}): DivarGalleryHealth {
  const expected = Math.min(Math.max(file.sourceImageCount, 0), DIVAR_MAX_PUBLISHED_IMAGES);
  const published = Math.max(file.publishedImageCount, 0);
  const hosted = Math.max(file.publishedHostedImageCount, 0);
  const remote = Math.max(file.publishedRemoteImageCount, 0);

  if (file.filterStatus !== "imported") {
    const level: DivarGalleryLevel = file.sourceImageCount > 0 ? "complete" : "empty";
    return {
      expected: file.sourceImageCount,
      published,
      hosted,
      remote,
      level,
      needsRepair: false,
      label:
        file.sourceImageCount > 0
          ? `${file.sourceImageCount.toLocaleString("fa-IR")} تصویر در آگهی`
          : "آگهی بدون تصویر",
    };
  }

  if (expected === 0) {
    return {
      expected: 0,
      published,
      hosted,
      remote,
      level: published > 0 ? "complete" : "empty",
      needsRepair: false,
      label: published > 0 ? `${published.toLocaleString("fa-IR")} تصویر` : "بدون تصویر",
    };
  }

  const level: DivarGalleryLevel =
    published === 0 ? "missing" : published < expected ? "partial" : "complete";

  return {
    expected,
    published,
    hosted,
    remote,
    level,
    needsRepair: level !== "complete",
    label: `${Math.min(published, expected).toLocaleString("fa-IR")} / ${expected.toLocaleString("fa-IR")} تصویر منتشرشده`,
  };
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

export type DivarCompleteness = {
  /** 0..100 */
  score: number;
  passed: number;
  total: number;
  missing: string[];
};

/** Field-by-field readiness check, used for the listing-quality score. */
export function divarCompleteness(file: {
  transactionType: DivarTransaction;
  price: string | null;
  deposit: string | null;
  rent: string | null;
  areaM2: number | null;
  bedrooms: number | null;
  neighborhood: string;
  description: string;
  features: string[];
  images: string[];
  sourceImageCount: number;
  publishedImageCount: number;
  latitude: number | null;
  longitude: number | null;
}): DivarCompleteness {
  const hasPrice =
    file.transactionType === "rent"
      ? Boolean(file.deposit || file.rent)
      : Boolean(file.price);
  const hasImages = file.sourceImageCount > 0 || file.publishedImageCount > 0 || file.images.length > 0;

  const checks: Array<[boolean, string]> = [
    [hasImages, "تصویر"],
    [hasPrice, file.transactionType === "rent" ? "رهن/اجاره" : "قیمت"],
    [Boolean(file.areaM2), "متراژ"],
    [Boolean(file.bedrooms), "تعداد خواب"],
    [Boolean(file.neighborhood.trim()) && file.neighborhood.trim() !== "اصفهان", "محله دقیق"],
    [file.description.trim().length >= 40, "توضیحات کامل"],
    [file.features.length > 0, "امکانات"],
    [file.latitude != null && file.longitude != null, "موقعیت روی نقشه"],
  ];

  const missing = checks.filter(([passed]) => !passed).map(([, label]) => label);
  const passed = checks.length - missing.length;

  return {
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Search / filter / sort                                                     */
/* -------------------------------------------------------------------------- */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Folds Persian/Arabic variants and digits so "۱۲۳" matches "123". */
export function normalizeDivarQuery(value: string): string {
  return value
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    // Escaped on purpose: U+06C0 decomposes, so a literal character class reads
    // as a combined sequence (`no-misleading-character-class`).
    .replace(/[\u06c0\u0629]/g, "ه")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    // ZWNJ/ZWJ are "joined" characters, so they are alternated instead of
    // placed in a character class (`no-misleading-character-class`).
    .replace(/\u200c|\u200d|\u200e|\u200f|\u0640/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Everything a search query is allowed to match, including the Divar token. */
export function divarSearchHaystack(file: {
  title: string;
  neighborhood: string;
  description: string;
  sellerName: string | null;
  features: string[];
  token: string;
  sourceUrl: string;
  transactionType: DivarTransaction;
  propertyType: DivarPropertyType;
}): string {
  return normalizeDivarQuery(
    [
      file.title,
      file.neighborhood,
      file.description,
      file.sellerName ?? "",
      file.token,
      file.sourceUrl,
      DIVAR_TRANSACTION_LABELS[file.transactionType],
      DIVAR_PROPERTY_LABELS[file.propertyType],
      ...file.features,
    ].join(" "),
  );
}

export type DivarSortKey =
  | "newest"
  | "oldest"
  | "priceAsc"
  | "priceDesc"
  | "areaDesc"
  | "areaAsc"
  | "scoreDesc";

export type DivarFilters = {
  search: string;
  transaction: "all" | DivarTransaction;
  propertyType: "all" | DivarPropertyType;
  neighborhood: string;
  onlyWithImages: boolean;
  onlyNeedsRepair: boolean;
  minScore: number;
};

export const EMPTY_DIVAR_FILTERS: DivarFilters = {
  search: "",
  transaction: "all",
  propertyType: "all",
  neighborhood: "all",
  onlyWithImages: false,
  onlyNeedsRepair: false,
  minScore: 0,
};

/**
 * The comparable money figure behind a listing: the headline price for a sale
 * and the mortgage (رهن) for a rental. Rent-only ads fall back to the monthly
 * rent so they are never sorted as if they were free.
 */
export function divarPriceValue(file: {
  transactionType: DivarTransaction;
  price: string | null;
  deposit: string | null;
  rent: string | null;
}): number {
  const preferred =
    file.transactionType === "rent" ? (file.deposit ?? file.rent) : file.price;
  const parsed = Number(preferred ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timeOf(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Filtering for an already status-scoped list. */
export function filterDivarFiles(files: DivarFile[], filters: DivarFilters): DivarFile[] {
  const query = normalizeDivarQuery(filters.search);
  const needsRepairOnly = filters.onlyNeedsRepair;

  return files.filter((file) => {
    if (filters.transaction !== "all" && file.transactionType !== filters.transaction) {
      return false;
    }
    if (filters.propertyType !== "all" && file.propertyType !== filters.propertyType) {
      return false;
    }
    if (filters.neighborhood !== "all" && file.neighborhood !== filters.neighborhood) {
      return false;
    }
    if (filters.onlyWithImages && file.sourceImageCount === 0 && file.images.length === 0) {
      return false;
    }
    if (needsRepairOnly && !divarGalleryHealth(file).needsRepair) return false;
    if (filters.minScore > 0 && divarCompleteness(file).score < filters.minScore) return false;
    if (!query) return true;
    return divarSearchHaystack(file).includes(query);
  });
}

export function sortDivarFiles(files: DivarFile[], sortBy: DivarSortKey): DivarFile[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return timeOf(a.lastSeenAt) - timeOf(b.lastSeenAt);
      case "priceAsc":
        return divarPriceValue(a) - divarPriceValue(b);
      case "priceDesc":
        return divarPriceValue(b) - divarPriceValue(a);
      case "areaDesc":
        return (b.areaM2 ?? -1) - (a.areaM2 ?? -1);
      case "areaAsc":
        return (a.areaM2 ?? Number.MAX_SAFE_INTEGER) - (b.areaM2 ?? Number.MAX_SAFE_INTEGER);
      case "scoreDesc":
        return divarCompleteness(b).score - divarCompleteness(a).score;
      case "newest":
      default:
        return timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt) || timeOf(b.createdAt) - timeOf(a.createdAt);
    }
  });
  return sorted;
}

/** Distinct neighborhoods of a list, most frequent first, for the filter select. */
export function divarNeighborhoodOptions(files: DivarFile[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const name = file.neighborhood.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fa"));
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Spreadsheet export of the current view. Rows are quoted defensively and the
 * caller prepends a BOM so Excel keeps the Persian text readable.
 */
/**
 * Persian-number and date formatting for the panel.
 *
 * These live here (rather than next to the React components) so they stay
 * unit-testable and so the component module only exports components.
 */
export function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function formatMoney(value: string | null) {
  if (!value) return "توافقی";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("fa-IR") + " تومان";
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fa-IR");
}

export function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1_000) return `${fa(Math.round(ms))} میلی‌ثانیه`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${fa(seconds)} ثانیه`;
  return `${fa(Math.floor(seconds / 60))} دقیقه و ${fa(seconds % 60)} ثانیه`;
}

export function propertyLabel(file: DivarFile) {
  return DIVAR_PROPERTY_LABELS[file.propertyType];
}

export function transactionLabel(file: DivarFile) {
  return DIVAR_TRANSACTION_LABELS[file.transactionType];
}

export function syncRunBadge(run: DivarSyncRun) {
  if (run.status === "failed") return { className: "failed", label: "ناموفق" };
  if (run.status === "running") return { className: "running", label: "در حال اجرا" };
  if (run.detailFailures > 0) return { className: "partial", label: "ناقص" };
  return { className: "completed", label: "موفق" };
}

/** Falls back to the boolean/orientation specs when nothing is free text. */
export function featureSummary(file: DivarFile): string[] {
  const fallback = [
    file.parking ? "پارکینگ" : null,
    file.elevator ? "آسانسور" : null,
    file.storage ? "انباری" : null,
    file.orientation ? DIVAR_ORIENTATION_LABELS[file.orientation] : null,
  ].filter(Boolean) as string[];
  return (file.features.length ? file.features : fallback).slice(0, 6);
}

export function divarFilesToCsv(files: DivarFile[], siteUrl = ""): string {
  const header = [
    "عنوان",
    "وضعیت",
    "معامله",
    "نوع ملک",
    "محله",
    "متراژ",
    "خواب",
    "پارکینگ",
    "آسانسور",
    "انباری",
    "قیمت",
    "رهن",
    "اجاره",
    "تعداد تصویر آگهی",
    "تصویر منتشرشده",
    "امتیاز کامل بودن",
    "کمبودها",
    "املاک‌کننده",
    "لینک دیوار",
    "لینک سایت",
  ];

  const rows = files.map((file) => {
    const completeness = divarCompleteness(file);
    const propertyLink = file.importedPropertyId
      ? `${siteUrl}/properties/${file.propertySlug || file.importedPropertyId}`
      : "";
    return [
      file.title,
      DIVAR_STATUS_LABELS[file.filterStatus],
      DIVAR_TRANSACTION_LABELS[file.transactionType],
      DIVAR_PROPERTY_LABELS[file.propertyType],
      file.neighborhood,
      file.areaM2 ?? "",
      file.bedrooms ?? "",
      file.parking ? "دارد" : "ندارد",
      file.elevator ? "دارد" : "ندارد",
      file.storage ? "دارد" : "ندارد",
      file.price ?? "",
      file.deposit ?? "",
      file.rent ?? "",
      file.sourceImageCount,
      file.publishedImageCount,
      completeness.score,
      completeness.missing.join("، "),
      file.sellerName ?? "",
      file.sourceUrl,
      propertyLink,
    ].map(csvCell);
  });

  return [header.map(csvCell), ...rows].map((row) => row.join(",")).join("\r\n");
}
