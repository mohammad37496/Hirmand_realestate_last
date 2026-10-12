import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { SITE, TEAM } from "@/lib/site";
import { dbSource, getSql, type Sql } from "@/lib/db";
import { storeMedia } from "@/lib/media-store.server";
import { detectRasterImageType, isAllowedDivarImageUrl, isDivarRemoteHost } from "@/lib/media";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { isMoneyText, normalizeMoneyText } from "@/lib/property-input-normalization";
import { extractDivarMediaUrls } from "./divar-media-utils";
import { getDivarAgencyReason } from "./divar-agency-filter";
export { getDivarAgencyReason } from "./divar-agency-filter";
import { findDivarCoordinates } from "./divar-coordinate-utils";
import { DIVAR_MAX_PUBLISHED_IMAGES } from "./divar-status";

export const DIVAR_API = "https://api.divar.ir/v8";
const DIVAR_WEB = "https://divar.ir";
const CITY_SLUG = "isfahan";
export const CATEGORIES = [
  "apartment-sell",
  "house-villa-sell",
  "apartment-rent",
  "house-villa-rent",
] as const;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const DETAIL_BATCH = 4;
/** Shared with the admin panel so the gallery cap and the health badge agree. */
const MAX_IMAGES = DIVAR_MAX_PUBLISHED_IMAGES;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** A `running` sync row older than this was crashed, not still working. */
const SYNC_RUN_STALE_MS = 10 * 60 * 1000;
const MAX_SYNC_RUNS = 6;

export type DivarTransaction = "sell" | "rent";
export type DivarPropertyType = "apartment" | "villa";
export type DivarFilterStatus = "accepted" | "imported" | "rejected";

export type DivarFile = {
  id: string;
  token: string;
  title: string;
  transactionType: DivarTransaction;
  propertyType: DivarPropertyType;
  neighborhood: string;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floorLabel: "suite" | null;
  orientation: "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest" | "two_fronts" | "three_fronts" | "four_fronts" | "other" | null;
  totalFloors: number | null;
  builtYear: number | null;
  parking: boolean;
  elevator: boolean;
  storage: boolean;
  price: string | null;
  deposit: string | null;
  rent: string | null;
  description: string;
  features: string[];
  images: string[];
  sourceImageCount: number;
  publishedImageCount: number;
  publishedHostedImageCount: number;
  publishedRemoteImageCount: number;
  sellerName: string | null;
  sellerType: string | null;
  sourceUrl: string;
  filterStatus: DivarFilterStatus;
  importedPropertyId: string | null;
  propertySlug: string | null;
  latitude: number | null;
  longitude: number | null;
  importedAt: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  rejectReason?: string | null;
  /** The admin approved this ad by hand after the agency filter rejected it. */
  manualOverride: boolean;
};

export type DivarSyncStatus = "running" | "completed" | "failed";

export type DivarSyncRun = {
  id: string;
  status: DivarSyncStatus;
  requestedLimit: number;
  inspected: number;
  accepted: number;
  newlyVisible: number;
  rejected: number;
  requests: number;
  detailFailures: number;
  durationMs: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type DivarStats = {
  accepted: number;
  imported: number;
  rejected: number;
  totalSeen: number;
  /** Finish time of the newest completed sync (falls back to last activity). */
  lastSyncAt: string | null;
  syncRuns: DivarSyncRun[];
};

export type DivarSyncSummary = {
  accepted: number;
  visible: number;
  rejected: number;
  inspected: number;
  requests: number;
  detailFailures: number;
  syncedAt: string;
  durationMs: number;
};

type ListingCandidate = {
  token: string;
  category: (typeof CATEGORIES)[number];
  webInfo: Record<string, unknown>;
};

export type ParsedListing = Omit<
  DivarFile,
  | "id"
  | "filterStatus"
  | "importedPropertyId"
  | "importedAt"
  | "lastSeenAt"
  | "createdAt"
  | "updatedAt"
  | "sourceImageCount"
  | "publishedImageCount"
  | "publishedHostedImageCount"
  | "publishedRemoteImageCount"
  | "manualOverride"
>;

const adminInput = z.object({}).optional();

function requireAdminSync() {
  return getCookie(ADMIN_SESSION_COOKIE);
}

/**
 * Module-local on purpose — see the note in `divar-review.ts`. Exporting it
 * would keep the `admin-session.server` import alive in the client bundle and
 * the TanStack Start import-protection plugin rejects that at build time.
 */
async function requireAdmin() {
  const token = requireAdminSync();
  if (!(await verifyAdminSessionToken(token))) {
    throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
  }
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "divar.import")) {
    throw new Error("دسترسی دریافت فایل‌های دیوار برای این حساب فعال نیست.");
  }
  return claims;
}

function faToEn(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizeDivarText(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه")
    .replace(/(?:\u200c|\u200d|\u200e|\u200f|\u0640)/g, "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/[\u00a0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Divar serves listing photos from several rotating first-party CDN hosts. */
function isDivarSourceUrl(value: string): boolean {
  return isDivarRemoteHost(value);
}


function firstStringByKey(value: unknown, pattern: RegExp, depth = 0): string | null {
  if (depth > 10) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (pattern.test(key) && typeof item === "string" && item.trim()) return item.trim();
      const nested = firstStringByKey(item, pattern, depth + 1);
      if (nested) return nested;
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstStringByKey(item, pattern, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}


export function strictNullableMoney(value: unknown): string | null {
  const normalized = normalizeMoneyText(value);
  if (!normalized) return null;
  if (!isMoneyText(normalized)) {
    throw new Error("داده مالی دیوار نامعتبر است.");
  }
  return normalized;
}

function parseNumber(value: unknown): number | null {
  const s = faToEn(String(value ?? "")).replace(/[٬،,]/g, "").replace(/\s+/g, " ").trim();
  const match = s.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function parseMoney(value: unknown): number | null {
  const raw = normalizeDivarText(value);
  if (!raw) return null;
  const normalized = faToEn(raw).replace(/[٬،,]/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)?/g)];
  if (!matches.length) return null;

  let total = 0;
  let used = false;
  for (const match of matches) {
    const n = Number(match[1]);
    if (!Number.isFinite(n)) continue;
    const unit = match[2];
    const multiplier = unit === "میلیارد" ? 1_000_000_000 : unit === "میلیون" ? 1_000_000 : unit === "هزار" ? 1_000 : 1;
    total += n * multiplier;
    used = true;
    if (!unit) break;
  }
  return used && total > 0 ? Math.round(total) : null;
}

function compactKey(value: unknown) {
  return normalizeDivarText(value).replace(/\s+/g, "");
}

function walkWidgets(value: unknown, visit: (widget: Record<string, unknown>) => void, depth = 0) {
  if (depth > 12 || !value) return;
  if (Array.isArray(value)) {
    for (const item of value) walkWidgets(item, visit, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (typeof obj.widget_type === "string" && obj.data && typeof obj.data === "object") {
    visit(obj);
  }
  for (const item of Object.values(obj)) walkWidgets(item, visit, depth + 1);
}

function findModalWidgets(value: unknown, out: unknown[] = [], depth = 0) {
  if (depth > 12 || !value) return out;
  if (Array.isArray(value)) {
    for (const item of value) findModalWidgets(item, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  const obj = value as Record<string, unknown>;
  const modal = obj.modal_page;
  if (modal && typeof modal === "object") {
    const m = modal as Record<string, unknown>;
    if (m.title === "ویژگی‌ها و امکانات" && Array.isArray(m.widget_list)) {
      out.push(...m.widget_list);
    }
  }
  for (const item of Object.values(obj)) findModalWidgets(item, out, depth + 1);
  return out;
}

export function parseDivarListing(
  detail: Record<string, unknown>,
  webInfo: Record<string, unknown>,
  category: (typeof CATEGORIES)[number],
  token: string,
): ParsedListing {
  const specs = new Map<string, string>();
  const featureTexts: string[] = [];
  const descriptions: string[] = [];

  const visit = (widget: Record<string, unknown>) => {
    const widgetType = String(widget.widget_type ?? "");
    const data = (widget.data ?? {}) as Record<string, unknown>;

    if (widgetType === "GROUP_INFO_ROW") {
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (row.title && row.value) specs.set(normalizeDivarText(row.title), String(row.value));
      }
    }

    if (widgetType === "UNEXPANDABLE_ROW") {
      if (data.title && data.value) specs.set(normalizeDivarText(data.title), String(data.value));
    }

    if (widgetType === "FEATURE_ROW" || widgetType === "GROUP_FEATURE_ROW") {
      const items = widgetType === "GROUP_FEATURE_ROW" && Array.isArray(data.items) ? data.items : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (row.title) featureTexts.push(String(row.title));
      }
    }

    if (widgetType === "DESCRIPTION_ROW" && data.text) {
      descriptions.push(String(data.text));
    }
  };

  walkWidgets(detail, visit);
  for (const modalWidget of findModalWidgets(detail)) {
    if (modalWidget && typeof modalWidget === "object") {
      visit(modalWidget as Record<string, unknown>);
    }
  }

  const getSpec = (...keys: string[]) => {
    for (const key of keys) {
      const wanted = compactKey(key);
      for (const [currentKey, currentValue] of specs) {
        if (compactKey(currentKey).includes(wanted)) return currentValue;
      }
    }
    return null;
  };

  const transactionType: DivarTransaction = category.includes("rent") ? "rent" : "sell";
  const propertyType: DivarPropertyType = category.includes("villa") ? "villa" : "apartment";

  const areaM2 = parseNumber(getSpec("متراژ", "متراژ ملک", "متراژ زیربنا"));
  const bedrooms = parseNumber(getSpec("اتاق", "اتاق‌ها", "خواب"));
  const bathrooms = parseNumber(getSpec("تعداد سرویس بهداشتی", "سرویس بهداشتی", "حمام"));
  const rawFloor = normalizeDivarText(getSpec("طبقه"));
  const floorLabel = rawFloor.includes("سوئیت") || rawFloor.includes("سوییت") ? "suite" : null;
  const rawOrientation = getSpec("موقعیت ملک", "جهت ملک", "جهت ساختمان", "جهت");
  const compactOrientation = normalizeDivarText(rawOrientation).replace(/\s+/g, "");
  const orientation = compactOrientation.includes("شمالشرقی") ? "northeast" : compactOrientation.includes("شمالغربی") ? "northwest" : compactOrientation.includes("جنوبشرقی") ? "southeast" : compactOrientation.includes("جنوبغربی") ? "southwest" : compactOrientation.includes("دونبش") || compactOrientation.includes("دوبر") ? "two_fronts" : compactOrientation.includes("سهنبش") || compactOrientation.includes("سهبر") ? "three_fronts" : compactOrientation.includes("چهارنَبش") || compactOrientation.includes("چهارنبش") || compactOrientation.includes("چهاربر") ? "four_fronts" : compactOrientation.includes("شمالی") ? "north" : compactOrientation.includes("جنوبی") ? "south" : compactOrientation.includes("شرقی") ? "east" : compactOrientation.includes("غربی") ? "west" : null;
  const floor = floorLabel ? null : parseNumber(getSpec("طبقه"));
  const totalFloors = parseNumber(getSpec("تعداد کل طبقات ساختمان", "تعداد کل طبقات"));
  const builtYear = parseNumber(getSpec("ساخت", "سال ساخت"));

  let price = parseMoney(getSpec("قیمت کل", "قیمت ملک", "قیمت"));
  let deposit = parseMoney(getSpec("ودیعه", "رهن", "مبلغ رهن"));
  let rent = parseMoney(getSpec("اجاره ماهانه", "اجاره", "اجاره بها"));

  if (transactionType === "rent" && deposit == null && price != null) {
    deposit = price;
    price = null;
  }
  if (transactionType === "rent" && rent == null) {
    const rentSpec = getSpec("اجاره ماهانه", "اجاره");
    rent = parseMoney(rentSpec);
  }

  const featureBlob = featureTexts.map(normalizeDivarText).join(" ");
  const parking = /پارکینگ/u.test(featureBlob) && !/بدون پارکینگ|پارکینگ ندارد/u.test(featureBlob);
  const elevator = /آسانسور/u.test(featureBlob) && !/بدون آسانسور|آسانسور ندارد/u.test(featureBlob);
  const storage = /انباری/u.test(featureBlob) && !/بدون انباری|انباری ندارد/u.test(featureBlob);

  const images = extractDivarMediaUrls(detail);
  const coordinates = findDivarCoordinates(detail);

  const title = String(webInfo.title ?? "فایل دیوار").trim();
  const neighborhood = String(webInfo.district_persian ?? webInfo.district ?? "اصفهان").trim();
  const description = descriptions.map((v) => v.trim()).filter(Boolean).join("\n\n").slice(0, 5000);
  const safeDescription =
    description.length >= 10
      ? description
      : "توضیحات تکمیلی این فایل در آگهی دیوار موجود است.";

  return {
    token,
    title,
    transactionType,
    propertyType,
    neighborhood,
    areaM2,
    bedrooms,
    bathrooms,
    floor,
    floorLabel,
    orientation,
    totalFloors,
    builtYear,
    parking,
    elevator,
    storage,
    price: price != null ? String(price) : null,
    deposit: deposit != null ? String(deposit) : null,
    rent: rent != null ? String(rent) : null,
    description: safeDescription,
    features: Array.from(
      new Set(
        featureTexts
          .map((v) => v.trim())
          .filter((v) => v.length > 1)
          .slice(0, 20),
      ),
    ),
    images,
    propertySlug: null,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    sellerName:
      firstStringByKey(detail, /^(?:seller|owner|user|username|business_name|profile_name|author_name)$/i) ??
      firstStringByKey(webInfo, /seller|owner|user|business/i),
    sellerType: JSON.stringify(detail).includes("real-estate-business") ? "مشاور املاک" : "شخصی",
    sourceUrl: `${DIVAR_WEB}/v/${token}`,
  };
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      "accept-language": "fa-IR,fa;q=0.9,en;q=0.7",
      "user-agent": "Mozilla/5.0",
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Divar request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function resolveIsfahanCityId() {
  const data = await fetchJson<unknown>(`${DIVAR_API}/places/cities`);
  const cities = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).cities : []);
  if (!Array.isArray(cities)) return "4";

  for (const city of cities) {
    if (!city || typeof city !== "object") continue;
    const c = city as Record<string, unknown>;
    if (String(c.slug ?? "").toLowerCase() === CITY_SLUG) return String(c.id);
    if (normalizeDivarText(c.name) === "اصفهان") return String(c.id);
  }
  return "4";
}

function extractListRows(data: unknown, category: (typeof CATEGORIES)[number]): ListingCandidate[] {
  const widgets =
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).list_widgets)
      ? (data as Record<string, unknown>).list_widgets
      : data && typeof data === "object" && (data as Record<string, unknown>).web_widgets
        ? ((data as Record<string, unknown>).web_widgets as Record<string, unknown>).post_list
        : [];

  if (!Array.isArray(widgets)) return [];
  const out: ListingCandidate[] = [];
  for (const widget of widgets) {
    if (!widget || typeof widget !== "object") continue;
    const w = widget as Record<string, unknown>;
    if (w.widget_type !== "POST_ROW") continue;

    const rawData = (w.data ?? {}) as Record<string, unknown>;
    const action = (rawData.action ?? {}) as Record<string, unknown>;
    const payload = (action.payload ?? {}) as Record<string, unknown>;
    const token = String(payload.token ?? rawData.token ?? "").trim();
    if (!token) continue;
    const webInfo =
      (payload.web_info && typeof payload.web_info === "object"
        ? payload.web_info
        : rawData.web_info && typeof rawData.web_info === "object"
          ? rawData.web_info
          : {}) as Record<string, unknown>;

    out.push({
      token,
      category,
      webInfo,
    });
  }
  return out;
}

function listBody(cityId: string, category: string, paginationData?: unknown) {
  const formData: Record<string, unknown> = {
    category: { str: { value: category } },
    "business-type": { str: { value: "personal" } },
  };
  const body: Record<string, unknown> = {
    city_ids: [String(cityId)],
    search_data: { form_data: { data: formData } },
  };
  if (paginationData) body.pagination_data = paginationData;
  return body;
}

async function fetchCategoryPage(cityId: string, category: (typeof CATEGORIES)[number], cursor?: unknown) {
  try {
    return await fetchJson<unknown>(`${DIVAR_API}/postlist/w/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(listBody(cityId, category, cursor)),
    });
  } catch {
    // Divar occasionally changes a filter field's wire shape; retry the public search without the business filter.
    const body = listBody(cityId, category, cursor);
    const data = body.search_data as Record<string, unknown>;
    const form = (data.form_data as Record<string, unknown>).data as Record<string, unknown>;
    delete form["business-type"];
    return await fetchJson<unknown>(`${DIVAR_API}/postlist/w/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function getPagination(data: unknown): { hasNext: boolean; cursor: unknown } {
  if (!data || typeof data !== "object") return { hasNext: false, cursor: undefined };
  const pagination = (data as Record<string, unknown>).pagination;
  if (!pagination || typeof pagination !== "object") return { hasNext: false, cursor: undefined };
  const p = pagination as Record<string, unknown>;
  return {
    hasNext: Boolean(p.has_next_page),
    cursor: p.data,
  };
}

function propertyTypeToSite(value: DivarPropertyType): "apartment" | "villa" {
  return value === "villa" ? "villa" : "apartment";
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nullableInteger(value: unknown): number | null {
  const parsed = nullableNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "divar-property"
  );
}

type DivarImageDownload = {
  /** Media successfully hosted by Hirmand storage. */
  images: string[];
  /** How many images were copied onto our own storage. */
  stored: number;
  /** Original Divar URLs that could not be downloaded; public pages proxy these URLs. */
  failures: { source: string; reason: string }[];
  /** Sanitized original source URLs, kept as a guaranteed gallery fallback. */
  sourceImages: string[];
};

async function uploadDivarImages(token: string, urls: string[]): Promise<DivarImageDownload> {
  const candidatesFor = (source: string): Array<{
    label: string;
    url: string;
    timeoutMs: number;
    direct: boolean;
    headers: Record<string, string>;
  }> => [
    {
      label: "direct",
      url: source,
      timeoutMs: 6_000,
      direct: true,
      headers: {
        accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8",
        "accept-language": "fa-IR,fa;q=0.9,en;q=0.8",
        referer: DIVAR_WEB + "/v/" + token,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
      },
    },
  ];

  const detectImageType = (bytes: Buffer, _headerType: string) =>
    detectRasterImageType(bytes);

  const readBoundedResponse = async (response: Response): Promise<Buffer> => {
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      throw new Error("حجم اعلام‌شده تصویر بیش از ۱۲ مگابایت بود");
    }
    if (!response.body) throw new Error("پاسخ تصویر بدون بدنه بود");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error("حجم تصویر بیش از ۱۲ مگابایت بود");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  };

  const fetchCandidate = async (
    candidate: { url: string; headers: Record<string, string>; timeoutMs: number; direct: boolean },
  ): Promise<Response> => {
    const initial = new URL(candidate.url);
    const initialHost = initial.hostname.toLowerCase();
    const isAllowedRedirect = (next: URL) => {
      if (next.protocol !== "https:") return false;
      if (candidate.direct) return isAllowedDivarImageUrl(next.toString());
      const host = next.hostname.toLowerCase();
      return host === initialHost || isDivarRemoteHost(next.toString());
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        let current = initial;
        for (let redirects = 0; redirects <= 3; redirects += 1) {
          const response = await fetch(current.toString(), {
            redirect: "manual",
            headers: candidate.headers,
            signal: AbortSignal.timeout(candidate.timeoutMs),
          });
          if (response.status < 300 || response.status >= 400) return response;
          const location = response.headers.get("location");
          if (!location) throw new Error("ریدایرکت بدون مقصد");
          const next = new URL(location, current);
          if (!isAllowedRedirect(next)) throw new Error("ریدایرکت به میزبان غیرمجاز");
          current = next;
        }
        throw new Error("تعداد ریدایرکت بیش از حد مجاز");
      } catch (error) {
        lastError = error;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("دریافت تصویر ناموفق بود");
  };

  const downloadOne = async (source: string, index: number) => {
    let lastReason = "تصویر قابل دریافت نبود";

    for (const candidate of candidatesFor(source)) {
      try {
        const response = await fetchCandidate(candidate);

        if (!response.ok) {
          lastReason = candidate.label + ": HTTP " + response.status;
          continue;
        }

        const bytes = await readBoundedResponse(response);
        if (!bytes.length) {
          lastReason = candidate.label + ": فایل خالی بود";
          continue;
        }

        const type = detectImageType(bytes, response.headers.get("content-type") ?? "");
        if (!type) {
          lastReason = candidate.label + ": محتوای دریافتی تصویر معتبر نبود";
          continue;
        }

        const extension =
          type === "image/png"
            ? "png"
            : type === "image/webp"
              ? "webp"
              : type === "image/avif"
                ? "avif"
                : type === "image/gif"
                  ? "gif"
                  : "jpg";

        const stored = await storeMedia({
          pathname:
            "properties/divar/" +
            token +
            "/" +
            String(index + 1).padStart(2, "0") +
            "-" +
            crypto.randomUUID() +
            "." +
            extension,
          data: bytes,
          contentType: type,
        });

        return { index, url: stored.url, failure: null as null | { source: string; reason: string } };
      } catch (error) {
        lastReason =
          candidate.label +
          ": " +
          (error instanceof Error ? error.message : "خطای دریافت تصویر");
      }
    }

    return {
      index,
      url: null,
      failure: { source, reason: lastReason },
    };
  };

  const results: Array<{
    index: number;
    url: string | null;
    failure: { source: string; reason: string } | null;
  }> = [];

  const safeUrls = Array.from(
    new Set(urls.filter(isAllowedDivarImageUrl)),
  ).slice(0, MAX_IMAGES);
  const concurrency = 6;

  for (let startIndex = 0; startIndex < safeUrls.length; startIndex += concurrency) {
    const batch = safeUrls.slice(startIndex, startIndex + concurrency);
    const batchResults = await Promise.all(
      batch.map((source, offset) => downloadOne(source, startIndex + offset)),
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => a.index - b.index);

  // Only keep media that was successfully copied to Hirmand storage.
  // Publishing a foreign Divar URL would make the public gallery dependent on
  // an international/external request path.
  const images: string[] = [];
  let stored = 0;
  const failures: { source: string; reason: string }[] = [];

  for (const result of results) {
    if (result.url) {
      images.push(result.url);
      stored += 1;
      continue;
    }
    if (result.failure) failures.push(result.failure);
  }

  return { images, stored, failures, sourceImages: safeUrls };
}
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonArray(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row: Record<string, unknown>): DivarFile {
  return {
    id: String(row.id),
    token: String(row.token),
    title: String(row.title),
    transactionType: row.transaction_type as DivarTransaction,
    propertyType: row.property_type as DivarPropertyType,
    neighborhood: String(row.neighborhood ?? ""),
    areaM2: row.area_m2 == null ? null : Number(row.area_m2),
    bedrooms: row.bedrooms == null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms == null ? null : Number(row.bathrooms),
    floor: row.floor == null ? null : Number(row.floor),
    floorLabel: row.floor_label === "suite" ? "suite" : null,
    orientation: (row.orientation as DivarFile["orientation"]) ?? null,
    totalFloors: row.total_floors == null ? null : Number(row.total_floors),
    builtYear: row.built_year == null ? null : Number(row.built_year),
    parking: Boolean(row.parking),
    elevator: Boolean(row.elevator),
    storage: Boolean(row.storage),
    price: row.price == null ? null : String(row.price),
    deposit: row.deposit == null ? null : String(row.deposit),
    rent: row.rent == null ? null : String(row.rent),
    description: String(row.description ?? ""),
    features: parseJsonArray(row.features),
    images: parseJsonArray(row.images),
    sourceImageCount: Number(row.source_image_count) || parseJsonArray(row.images).length,
    publishedImageCount: Number(row.published_image_count) || 0,
    publishedHostedImageCount: (() => {
      const publishedImages = parseJsonArray(row.published_images);
      return publishedImages.filter((url) => !isDivarSourceUrl(url)).length;
    })(),
    publishedRemoteImageCount: (() => {
      const publishedImages = parseJsonArray(row.published_images);
      return publishedImages.filter(isDivarSourceUrl).length;
    })(),
    sellerName: row.seller_name == null ? null : String(row.seller_name),
    sellerType: row.seller_type == null ? null : String(row.seller_type),
    sourceUrl: String(row.source_url),
    filterStatus: row.filter_status as DivarFilterStatus,
    importedPropertyId: row.imported_property_id == null ? null : String(row.imported_property_id),
    propertySlug: row.imported_property_slug == null ? null : String(row.imported_property_slug),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    importedAt: row.imported_at ? new Date(String(row.imported_at)).toISOString() : null,
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    rejectReason: row.reject_reason == null ? null : String(row.reject_reason),
    manualOverride: Boolean(row.manual_override),
  };
}

function mapSyncRun(row: Record<string, unknown>): DivarSyncRun {
  const status = String(row.status ?? "running");
  return {
    id: String(row.id),
    status: (["running", "completed", "failed"].includes(status)
      ? status
      : "failed") as DivarSyncStatus,
    requestedLimit: Number(row.requested_limit) || 0,
    inspected: Number(row.inspected) || 0,
    accepted: Number(row.accepted) || 0,
    newlyVisible: Number(row.newly_visible) || 0,
    rejected: Number(row.rejected) || 0,
    requests: Number(row.requests) || 0,
    detailFailures: Number(row.detail_failures) || 0,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    error: row.error == null ? null : String(row.error),
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
  };
}

/** A run that never closed (process died mid-crawl) is dropped from the history. */
function isStaleSyncRun(run: DivarSyncRun): boolean {
  return (
    run.status === "running" &&
    Date.now() - new Date(run.startedAt).getTime() > SYNC_RUN_STALE_MS
  );
}

type RejectedCandidateInput = {
  token: string;
  title: string;
  transactionType: DivarTransaction;
  propertyType: DivarPropertyType;
  neighborhood: string;
  sellerName: string | null;
  reason: string;
};

/**
 * Records a listing the agency filter rejected.
 *
 * Two invariants use the same statement so they can never drift apart: a file
 * that is already published on the site is never demoted off it by a later
 * sync, and a file an admin approved by hand keeps that decision.
 */
async function upsertRejectedDivarFile(sql: Sql, input: RejectedCandidateInput) {
  await sql.query(
    `insert into divar_files (
      id, token, title, transaction_type, property_type, neighborhood,
      description, images, seller_name, seller_type, source_url,
      filter_status, reject_reason, manual_override, last_seen_at, updated_at
    ) values (
      $1, $2, $3, $4, $5, $6,
      '', '[]'::jsonb, $7, 'مشاور املاک', $8,
      'rejected', $9, false, current_timestamp, current_timestamp
    )
    on conflict (token) do update set
      title = excluded.title,
      neighborhood = excluded.neighborhood,
      seller_name = excluded.seller_name,
      filter_status = case
        when divar_files.filter_status = 'imported' then 'imported'
        when divar_files.manual_override then 'accepted'
        else 'rejected'
      end,
      seller_type = case
        when divar_files.manual_override then divar_files.seller_type
        else 'مشاور املاک'
      end,
      reject_reason = case
        when divar_files.manual_override then divar_files.reject_reason
        else excluded.reject_reason
      end,
      last_seen_at = current_timestamp,
      updated_at = current_timestamp`,
    [
      crypto.randomUUID(),
      input.token,
      input.title,
      input.transactionType,
      input.propertyType,
      input.neighborhood,
      input.sellerName,
      `${DIVAR_WEB}/v/${input.token}`,
      input.reason,
    ],
  );
}

const listSchema = z.object({
  status: z.enum(["accepted", "imported", "rejected"]).optional().default("accepted"),
  limit: z.number().int().min(1).max(100).optional().default(60),
  /** The list used to be hard-capped at the first 100 rows with no way to page. */
  offset: z.number().int().min(0).max(20_000).optional().default(0),
});

export const listDivarFiles = createServerFn({ method: "POST" })
  .validator(listSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const fetchRows = async (limit: number, offset: number) =>
      sql.query<Record<string, unknown>>(
        `select divar_files.*,
                p.slug as imported_property_slug,
                p.images as published_images,
                case
                  when jsonb_typeof(coalesce(divar_files.images, '[]'::jsonb)) = 'array'
                    then jsonb_array_length(coalesce(divar_files.images, '[]'::jsonb))
                  else 0
                end as source_image_count,
                case
                  when jsonb_typeof(coalesce(p.images, '[]'::jsonb)) = 'array'
                    then jsonb_array_length(coalesce(p.images, '[]'::jsonb))
                  else 0
                end as published_image_count
         from divar_files
         left join properties p on p.id = divar_files.imported_property_id
         where divar_files.filter_status = $1
         order by divar_files.last_seen_at desc, divar_files.created_at desc
         limit $2 offset $3`,
        [data.status, limit, offset],
      );

    if (data.status !== "accepted") {
      return (await fetchRows(data.limit, data.offset)).map(mapRow);
    }

    // Older accepted rows may have been stored before the stricter seller
    // filter existed. Re-check each accepted batch as it is opened, persist
    // matches in the rejected queue, and keep fetching until the requested
    // number of eligible rows is filled.
    const eligibleRows: Record<string, unknown>[] = [];
    while (eligibleRows.length < data.limit) {
      const take = Math.min(data.limit - eligibleRows.length, 100);
      const batch = await fetchRows(take, data.offset + eligibleRows.length);
      if (batch.length === 0) break;

      const classified = batch.map((row) => ({
        row,
        reason: row.manual_override
          ? null
          : getDivarAgencyReason({
              title: row.title,
              description: row.description,
              seller_name: row.seller_name,
              seller_type: row.seller_type,
              source_url: row.source_url,
            }),
      }));
      const rejected = classified.filter(
        (item): item is { row: Record<string, unknown>; reason: string } =>
          Boolean(item.reason),
      );

      if (rejected.length > 0) {
        await sql.query(
          `update divar_files as file
              set filter_status = 'rejected',
                  reject_reason = flagged.reason,
                  updated_at = current_timestamp
            from unnest($1::text[], $2::text[]) as flagged(id, reason)
           where file.id = flagged.id
             and file.filter_status = 'accepted'
             and file.manual_override = false`,
          [rejected.map(({ row }) => String(row.id)), rejected.map(({ reason }) => reason)],
        );
      }

      eligibleRows.push(...classified.filter((item) => !item.reason).map((item) => item.row));
      if (batch.length < take) break;
    }

    return eligibleRows.map(mapRow);
  });

export const getDivarStats = createServerFn({ method: "POST" })
  .validator(adminInput)
  .handler(async () => {
    await requireAdmin();
    if (dbSource === "unconfigured") {
      return {
        accepted: 0,
        imported: 0,
        rejected: 0,
        totalSeen: 0,
        lastSyncAt: null,
        syncRuns: [],
      } satisfies DivarStats;
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(`
      select
        count(*) filter (where filter_status = 'accepted')::int as accepted,
        count(*) filter (where filter_status = 'imported')::int as imported,
        count(*) filter (where filter_status = 'rejected')::int as rejected,
        count(*)::int as total_seen,
        max(updated_at) as last_activity_at
      from divar_files
    `);
    const row = rows[0] ?? {};

    // The sync log is authoritative for "last check"; `max(updated_at)` also
    // moves when a file is imported or approved, so it is only a fallback.
    let syncRuns: DivarSyncRun[] = [];
    try {
      const runRows = await sql.query<Record<string, unknown>>(
        `select * from divar_sync_runs order by started_at desc limit $1`,
        [MAX_SYNC_RUNS],
      );
      syncRuns = runRows.map(mapSyncRun).filter((run) => !isStaleSyncRun(run));
    } catch (error) {
      // Migration 0044 not applied yet: the panel still works, just without history.
      console.warn("[divar] sync history unavailable", error);
    }

    const lastRun = syncRuns.find((run) => run.finishedAt);
    return {
      accepted: Number(row.accepted) || 0,
      imported: Number(row.imported) || 0,
      rejected: Number(row.rejected) || 0,
      totalSeen: Number(row.total_seen) || 0,
      lastSyncAt:
        lastRun?.finishedAt ??
        (row.last_activity_at ? new Date(String(row.last_activity_at)).toISOString() : null),
      syncRuns,
    } satisfies DivarStats;
  });

const syncSchema = z.object({
  limit: z.number().int().min(4).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
});

/** Closes a sync-run row with its counters, or with the failure message. */
async function finishDivarSyncRun(
  sql: Sql,
  runId: string,
  status: "completed" | "failed",
  summary: Omit<DivarSyncSummary, "durationMs"> | null,
  durationMs: number,
  error?: unknown,
) {
  const message =
    error == null
      ? summary?.detailFailures
        ? `${summary.detailFailures} درخواست جزئیات آگهی ناموفق بود.`
        : null
      : error instanceof Error
        ? error.message
        : String(error);
  await sql.query(
    `update divar_sync_runs
        set status = $2,
            inspected = $3,
            accepted = $4,
            newly_visible = $5,
            rejected = $6,
            requests = $7,
            detail_failures = $8,
            duration_ms = $9,
            error = $10,
            finished_at = current_timestamp
      where id = $1`,
    [
      runId,
      status,
      summary?.inspected ?? 0,
      summary?.accepted ?? 0,
      summary?.visible ?? 0,
      summary?.rejected ?? 0,
      summary?.requests ?? 0,
      summary?.detailFailures ?? 0,
      Math.max(0, Math.round(durationMs)),
      message ? message.slice(0, 500) : null,
    ],
  );
}

/** The crawl itself. Sync-run bookkeeping is the caller's job. */
async function runDivarSync(
  sql: Sql,
  data: { limit: number },
): Promise<Omit<DivarSyncSummary, "durationMs">> {
    let requests = 0;
    let detailFailures = 0;
    const cityId = await resolveIsfahanCityId();
    requests += 1;
    const target = data.limit;
    const seenTokens = new Set<string>();
    const acceptedRows: ParsedListing[] = [];
    let rejected = 0;

    for (const category of CATEGORIES) {
      let cursor: unknown = undefined;
      let page = 0;
      while (acceptedRows.length < target && page < 3) {
        const dataPage = await fetchCategoryPage(cityId, category, cursor);
        requests += 1;
        const rows = extractListRows(dataPage, category);
        if (!rows.length) break;

        const candidates = rows.filter((row) => !seenTokens.has(row.token));
        for (const row of candidates) seenTokens.add(row.token);

        const preRejected = candidates.filter((row) => {
          const reason = getDivarAgencyReason(row.webInfo);
          return Boolean(reason);
        });

        for (const row of preRejected) {
          const reason = getDivarAgencyReason(row.webInfo) ?? "مشکوک به آگهی املاک";
          rejected += 1;
          await upsertRejectedDivarFile(sql, {
            token: row.token,
            title: String(row.webInfo.title ?? "فایل دیوار"),
            transactionType: category.includes("rent") ? "rent" : "sell",
            propertyType: category.includes("villa") ? "villa" : "apartment",
            neighborhood: String(row.webInfo.district_persian ?? row.webInfo.district ?? "اصفهان"),
            sellerName: firstStringByKey(row.webInfo, /seller|owner|user|business/i),
            reason,
          });
        }

        const pending = candidates.filter((row) => !preRejected.some((r) => r.token === row.token));
        for (let offset = 0; offset < pending.length && acceptedRows.length < target; offset += DETAIL_BATCH) {
          const batch = pending.slice(offset, offset + DETAIL_BATCH);
          requests += batch.length;
          const results = await Promise.all(
            batch.map(async (row) => {
              try {
                const detail = await fetchJson<Record<string, unknown>>(
                  `${DIVAR_API}/posts-v2/web/${encodeURIComponent(row.token)}`,
                );
                const reason = getDivarAgencyReason(detail);
                if (reason) return { row, reason, parsed: null, failed: false as const };
                return {
                  row,
                  reason: null,
                  parsed: parseDivarListing(detail, row.webInfo, row.category, row.token),
                  failed: false as const,
                };
              } catch (error) {
                console.warn("[divar] detail failed", row.token, error);
                return { row, failed: true as const };
              }
            }),
          );

          for (const result of results) {
            if (result.failed) {
              detailFailures += 1;
              continue;
            }
            if (result.reason) {
              rejected += 1;
              await upsertRejectedDivarFile(sql, {
                token: result.row.token,
                title: String(result.row.webInfo.title ?? "فایل دیوار"),
                transactionType: result.row.category.includes("rent") ? "rent" : "sell",
                propertyType: result.row.category.includes("villa") ? "villa" : "apartment",
                neighborhood: String(
                  result.row.webInfo.district_persian ?? result.row.webInfo.district ?? "اصفهان",
                ),
                sellerName: firstStringByKey(result.row.webInfo, /seller|owner|user|business/i),
                reason: result.reason,
              });
              continue;
            }

            if (!result.parsed) continue;
            acceptedRows.push(result.parsed);
            if (acceptedRows.length >= target) break;
          }
        }

        const pag = getPagination(dataPage);
        if (!pag.hasNext || !pag.cursor || pag.cursor === cursor) break;
        cursor = pag.cursor;
        page += 1;
      }
      if (acceptedRows.length >= target) break;
    }

    let accepted = 0;
    for (const item of acceptedRows) {
      const rows = await sql.query<Record<string, unknown>>(
        `select filter_status from divar_files where token = $1 limit 1`,
        [item.token],
      );
      const existing = rows[0]?.filter_status;
      await sql.query(
        `insert into divar_files (
          id, token, title, transaction_type, property_type, neighborhood,
          area_m2, bedrooms, bathrooms, floor, total_floors, built_year,
          parking, elevator, storage, price, deposit, rent, description,
          features, images, seller_name, seller_type, source_url,
          latitude, longitude, floor_label, filter_status, orientation, last_seen_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,
          $7::integer,$8::smallint,$9::smallint,$10::smallint,$11::smallint,$12::smallint,
          $13,$14,$15,$16::numeric(20,0),$17::numeric(20,0),$18::numeric(20,0),
          $19,
          $20::jsonb,$21::jsonb,$22,$23,$24,
          $25::double precision,$26::double precision,$27::text,$28::text,$29::text,
          current_timestamp,current_timestamp
        )
        on conflict (token) do update set
          title = excluded.title,
          transaction_type = excluded.transaction_type,
          property_type = excluded.property_type,
          neighborhood = excluded.neighborhood,
          area_m2 = excluded.area_m2,
          bedrooms = excluded.bedrooms,
          bathrooms = excluded.bathrooms,
          floor = excluded.floor,
          total_floors = excluded.total_floors,
          built_year = excluded.built_year,
          parking = excluded.parking,
          elevator = excluded.elevator,
          storage = excluded.storage,
          price = excluded.price,
          deposit = excluded.deposit,
          rent = excluded.rent,
          description = excluded.description,
          features = excluded.features,
          images = excluded.images,
          seller_name = excluded.seller_name,
          seller_type = excluded.seller_type,
          source_url = excluded.source_url,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          floor_label = excluded.floor_label,
          filter_status = case when divar_files.filter_status = 'imported' then 'imported' else 'accepted' end,
          orientation = excluded.orientation,
          reject_reason = null,
          last_seen_at = current_timestamp,
          updated_at = current_timestamp`,
        [
          crypto.randomUUID(),
          item.token,
          item.title,
          item.transactionType,
          item.propertyType,
          item.neighborhood,
          nullableInteger(item.areaM2),
          nullableInteger(item.bedrooms),
          nullableInteger(item.bathrooms),
          nullableInteger(item.floor),
          nullableInteger(item.totalFloors),
          nullableInteger(item.builtYear),
          item.parking,
          item.elevator,
          item.storage,
          strictNullableMoney(item.price),
          strictNullableMoney(item.deposit),
          strictNullableMoney(item.rent),
          item.description,
          JSON.stringify(item.features),
          JSON.stringify(item.images),
          item.sellerName,
          item.sellerType,
          item.sourceUrl,
          item.latitude,
          item.longitude,
          item.floorLabel,
          existing === "imported" ? "imported" : "accepted",
          item.orientation,
        ],
      );
      accepted += existing === "imported" ? 0 : 1;
    }

    return {
      accepted: acceptedRows.length,
      visible: accepted,
      rejected,
      inspected: seenTokens.size,
      requests,
      detailFailures,
      syncedAt: new Date().toISOString(),
    };
}

export const syncDivarFiles = createServerFn({ method: "POST" })
  .validator(syncSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") {
      throw new Error("DATABASE_URL تنظیم نشده است. اول PostgreSQL/Neon را به پروژه وصل کنید.");
    }

    const sql = await getSql();
    const startedAt = Date.now();

    // Bookkeeping is best-effort on purpose: an unapplied migration 0044 must
    // degrade to "no history", never to a broken crawl.
    let runId: string | null = null;
    try {
      runId = crypto.randomUUID();
      await sql.query(
        `insert into divar_sync_runs (id, status, requested_limit)
         values ($1, 'running', $2)`,
        [runId, data.limit],
      );
    } catch (error) {
      runId = null;
      console.warn("[divar] could not open a sync run", error);
    }

    try {
      const summary = await runDivarSync(sql, { limit: data.limit });
      const durationMs = Date.now() - startedAt;
      if (runId) {
        await finishDivarSyncRun(sql, runId, "completed", summary, durationMs).catch((error) => {
          console.warn("[divar] could not close the sync run", error);
        });
      }
      return { ...summary, durationMs } satisfies DivarSyncSummary;
    } catch (error) {
      if (runId) {
        await finishDivarSyncRun(sql, runId, "failed", null, Date.now() - startedAt, error).catch(
          () => undefined,
        );
      }
      throw error;
    }
  });

const idSchema = z.object({
  id: z.string().min(1),
  repair: z.boolean().optional().default(false),
});

export const importDivarFile = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdmin();
    const staffImport = normalizeAdminRole(claims?.role) === "staff";
    if (staffImport && data.repair) {
      throw new Error("تعمیر گالری فایل‌های قبلی فقط برای مدیر مجاز است.");
    }
    if (dbSource === "unconfigured") {
      throw new Error("DATABASE_URL تنظیم نشده است.");
    }

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select * from divar_files where id = $1 limit 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new Error("فایل دیوار پیدا نشد.");

    const existingPropertyId = row.imported_property_id ? String(row.imported_property_id) : null;
    if (staffImport && existingPropertyId) {
      throw new Error("کارکنان فقط می‌توانند آگهی جدید را به پیش‌نویس تبدیل کنند؛ اصلاح فایل‌های واردشده فقط برای مدیر مجاز است.");
    }
    if (row.filter_status === "rejected") {
      throw new Error("این فایل به دلیل نشانه‌های مشاور/آژانس قابل ورود نیست.");
    }

    // A hand-approved file keeps its approval. The agency filter exists to keep
    // brokers off the site, not to silently overrule the admin who reviewed the
    // ad — without this, "تأیید دستی" would be undone by the very next publish.
    const manualOverride = Boolean(row.manual_override);
    if (!manualOverride) {
      const detailText = [row.title, row.description, row.seller_name, row.seller_type].join("\n");
      const reason = getDivarAgencyReason(detailText);
      if (reason) {
        await sql.query(
          `update divar_files set filter_status='rejected', reject_reason=$2, updated_at=current_timestamp where id=$1`,
          [data.id, reason],
        );
        throw new Error("این فایل دوباره توسط فیلتر مشاور/آژانس رد شد.");
      }
    }

    const token = String(row.token);
    let originalImages = parseJsonArray(row.images);

    if (data.repair === true || originalImages.length === 0) {
      try {
        const detail = await fetchJson<Record<string, unknown>>(
          `${DIVAR_API}/posts-v2/web/${encodeURIComponent(token)}`,
        );
        const detailReason = manualOverride ? null : getDivarAgencyReason(detail);
        if (detailReason) {
          await sql.query(
            `update divar_files
             set filter_status = 'rejected',
                 reject_reason = $2,
                 updated_at = current_timestamp
             where id = $1`,
            [data.id, detailReason],
          );
          throw new Error("این فایل دوباره توسط فیلتر مشاور/آژانس رد شد.");
        }

        const freshImages = extractDivarMediaUrls(detail);
        if (freshImages.length) {
          originalImages = freshImages;
          await sql.query(
            `update divar_files
             set images = $2::jsonb,
                 updated_at = current_timestamp
             where id = $1`,
            [data.id, JSON.stringify(freshImages)],
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("دوباره توسط فیلتر")) throw error;
        console.warn("[divar] image refresh failed", token, error);
      }
    }

    const images = originalImages.slice(0, MAX_IMAGES);

    if (existingPropertyId) {
      const propertyRows = await sql.query<Record<string, unknown>>(
        "select id, slug, status, images from properties where id = $1 limit 1",
        [existingPropertyId],
      );
      const existingProperty = propertyRows[0];
      if (!existingProperty) {
        await sql.query(
          "update divar_files set imported_property_id = null, imported_at = null, filter_status = 'accepted', updated_at = current_timestamp where id = $1",
          [data.id],
        );
      } else {
        const currentImages = parseJsonArray(existingProperty.images);
        const hostedCurrentImages = currentImages.filter((url) => !isDivarSourceUrl(url));
        const hasRemoteSourceImages = currentImages.some(isDivarSourceUrl);
        const missingImages = Math.max(0, images.length - currentImages.length);
        const shouldRefreshImages =
          data.repair === true ||
          currentImages.length === 0 ||
          missingImages > 0 ||
          hasRemoteSourceImages;
        const uploadResult = shouldRefreshImages
          ? await uploadDivarImages(token, images)
          : { images: [] as string[], stored: 0, failures: [] as { source: string; reason: string }[], sourceImages: images };
        // Hosted copies first, then any source still needed to keep the gallery
        // complete. Nothing that already worked is dropped.
        const fallbackSourceImages = uploadResult.sourceImages.filter((url) =>
          uploadResult.failures.some((failure) => failure.source === url),
        );
        const finalImages = Array.from(
          new Set([
            ...hostedCurrentImages,
            ...uploadResult.images.filter((url) => !isDivarSourceUrl(url)),
            ...fallbackSourceImages,
          ]),
        ).slice(0, MAX_IMAGES);

        await sql.query(
          `update properties
           set status = 'published',
               published_at = coalesce(published_at, current_timestamp),
               images = $2::jsonb,
               latitude = $3::double precision,
               longitude = $4::double precision,
               floor = $5::smallint,
               floor_label = $6::text,
               orientation = $7::text,
               updated_at = current_timestamp
           where id = $1`,
          [
            existingPropertyId,
            JSON.stringify(finalImages),
            nullableNumber(row.latitude),
            nullableNumber(row.longitude),
            row.floor_label === "suite" ? null : nullableInteger(row.floor),
            row.floor_label === "suite" ? "suite" : null,
            row.orientation == null ? null : String(row.orientation),
          ],
        );

        await sql.query(
          `update divar_files
           set filter_status='imported',
               imported_at=coalesce(imported_at, current_timestamp),
               updated_at=current_timestamp
           where id=$1`,
          [data.id],
        );

        return {
          propertyId: existingPropertyId,
          propertySlug: String(existingProperty.slug ?? ""),
          alreadyImported: true,
          imageCount: finalImages.length,
          hostedImageCount: uploadResult.stored,
          imageFailures: uploadResult.failures.length,
        };
      }
    }

    const importedResult = await uploadDivarImages(token, images);
    // Hosted copies come first; sources we could not copy keep the gallery
    // complete and are rendered through our own image proxy.
    const failedSourceImages = importedResult.sourceImages.filter((url) =>
      importedResult.failures.some((failure) => failure.source === url),
    );
    const importedImages = Array.from(
      new Set([
        ...importedResult.images.filter((url) => !isDivarSourceUrl(url)),
        ...failedSourceImages,
      ]),
    ).slice(0, MAX_IMAGES);

    const id = existingPropertyId ? existingPropertyId : crypto.randomUUID();
    const propertyType = propertyTypeToSite(String(row.property_type) as DivarPropertyType);
    const title = String(row.title).trim() || "فایل دیوار";
    const slug = `${slugify(title)}-${id.slice(0, 8)}`;
    const transactionType = row.transaction_type === "rent" ? "rent" : "sell";
    const description = String(row.description ?? "").trim() || "فایل واردشده از دیوار.";

    await sql.query(
      `insert into properties (
        id, slug, status, featured, title, transaction_type, property_type, city,
        neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
        built_year, parking, elevator, storage, price, deposit, rent, description,
        features, images, contact_name, contact_phone, latitude, longitude, floor_label, orientation, published_at
      ) values (
        $1,$2,$28,false,$3,$4,$5,'اصفهان',
        $6,null,$7::integer,$8::smallint,$9::smallint,$10::smallint,$11::smallint,
        $12::smallint,$13,$14,$15,$16::numeric(20,0),$17::numeric(20,0),$18::numeric(20,0),$19,
        $20::jsonb,$21::jsonb,$22,$23,$24::double precision,$25::double precision,$26::text,$27::text,
        case when $28 = 'published' then current_timestamp else null end
      )`,
      [
        id,
        slug,
        title,
        transactionType,
        propertyType,
        String(row.neighborhood ?? "اصفهان"),
        nullableInteger(row.area_m2),
        nullableInteger(row.bedrooms),
        nullableInteger(row.bathrooms),
        nullableInteger(row.floor),
        nullableInteger(row.total_floors),
        nullableInteger(row.built_year),
        Boolean(row.parking),
        Boolean(row.elevator),
        Boolean(row.storage),
        strictNullableMoney(row.price),
        strictNullableMoney(row.deposit),
        strictNullableMoney(row.rent),
        description,
        JSON.stringify(parseJsonArray(row.features)),
        JSON.stringify(importedImages),
        TEAM[0]?.name ?? "مشاور هیرمند",
        TEAM[0]?.phone ?? SITE.phone.mobile,
        nullableNumber(row.latitude),
        nullableNumber(row.longitude),
        row.floor_label === "suite" ? "suite" : null,
        row.orientation == null ? null : String(row.orientation),
        staffImport ? "draft" : "published",
      ],
    );

    await sql.query(
      `update divar_files
       set filter_status='imported',
           imported_property_id=$2,
           imported_at=current_timestamp,
           updated_at=current_timestamp
       where id=$1`,
      [data.id, id],
    );

    return {
      propertyId: id,
      propertySlug: slug,
      alreadyImported: false,
      imageCount: importedImages.length,
      hostedImageCount: importedResult.stored,
      imageFailures: importedResult.failures.length,
    };
  });
