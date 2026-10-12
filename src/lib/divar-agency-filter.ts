/**
 * Strict, data-shape-tolerant filter for professional real-estate advertisers.
 *
 * Divar has changed its web response shape more than once. We inspect both
 * field names and string values, while distinguishing a professional seller
 * from an owner who merely asks brokers not to call.
 */

type TextEntry = { key: string; value: string };

function normalizeAgencyText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\u0670/g, "")
    .replace(/\u200c/g, "")
    .replace(/\u200d/g, "")
    .replace(/\u200e/g, "")
    .replace(/\u200f/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u00a0]+/g, " ")
    .replace(/[ـ]/g, "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectEntries(value: unknown, out: TextEntry[] = [], parentKey = "", depth = 0): TextEntry[] {
  if (depth > 12 || out.length >= 5000 || value == null) return out;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push({ key: parentKey, value: String(value) });
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectEntries(item, out, parentKey, depth + 1);
    return out;
  }

  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out.push({ key: parentKey, value: key });
      collectEntries(item, out, key, depth + 1);
    }
  }

  return out;
}

const MACHINE_AGENCY_MARKERS =
  /real[\s_-]*estate[\s_-]*(?:business|agency|agent|consultant|broker)|realestate(?:business|agency|agent|consultant|broker)|(?:agency|agent|broker)[\s_-]*real[\s_-]*estate/i;

const AGENCY_TERMS =
  /(?:مشاور(?:ین|ان)?\s*(?:املاک|ملک|مسکن)|کارشناس(?:ان)?\s*(?:املاک|ملک|مسکن)|آژانس|اژانس|دپارتمان|بنگاه\s*(?:املاک|ملک)?|دفتر\s*(?:مشاور(?:ین)?\s*)?املاک|گروه\s*(?:مشاور(?:ین)?\s*)?املاک|تیم\s*(?:مشاور(?:ین)?\s*)?املاک|شرکت\s*املاک|هلدینگ\s*املاک|مجموعه\s*املاک|املاک\s*و\s*مستغلات|real\s*estate|real-estate|realestate|realty|real\s*estate\s*(?:agency|agent|consultant)|\bagency\b|\bdepartment\b)/iu;

const AFFILIATION_CLAIMS =
  /(?:مشاور(?:ین|ان)?\s*(?:املاک|ملک|مسکن)|کارشناس(?:ان)?\s*(?:املاک|ملک|مسکن))\s*(?:هستم|هستیم|میباشم|می باشم|فعال|مشغول|ارائه\s*خدمات|دفتر|دپارتمان)?|(?:فعال|شاغل|متخصص)\s*(?:در\s*)?(?:حوزه|زمینه|بخش)?\s*(?:خرید\s*و\s*فروش\s*)?(?:املاک|ملک|مسکن)/iu;

const ORGANIZATION_REAL_ESTATE =
  /(?:(?:آژانس|اژانس|دپارتمان|department|agency|بنگاه|دفتر|گروه|تیم|شرکت|هلدینگ|مجموعه)\s*(?:مشاور(?:ین)?\s*)?(?:[\p{L}\p{N}-]+\s*){0,3}(?:املاک|ملک|مسکن|مستغلات))|(?:املاک\s*(?:و\s*مستغلات|دپارتمان|گروه|آژانس|اژانس|شرکت))|^(?:املاک|آژانس|اژانس|دپارتمان|department|agency|realty)\s+[\p{L}\p{N}]/iu;

const OWNER_NO_AGENT_REQUEST =
  /(?:لطفا|لطفاً)?\s*(?:با\s*)?(?:مشاور(?:ین|ان)?\s*(?:املاک|ملک|مسکن)?|آژانس(?:های)?(?:\s*املاک)?|اژانس(?:های)?(?:\s*املاک)?|بنگاه(?:های)?(?:\s*املاک)?)(?:\s*(?:و|،)\s*(?:مشاور(?:ین|ان)?\s*(?:املاک|ملک|مسکن)?|آژانس(?:های)?(?:\s*املاک)?|اژانس(?:های)?(?:\s*املاک)?|بنگاه(?:های)?(?:\s*املاک)?)){0,2}\s*(?:تماس\s*(?:نگیرید|نگیرند|نگیرد|نزنید|نزنند|نزند)|زنگ\s*(?:نزنید|نزنند|نزند)|پیام\s*(?:ندهید|ندهند|ندهد)|مراجعه\s*(?:نکنید|نکنند|نکند)|مزاحم\s*(?:نشوید|نشوند|نشود))/giu;

const SELLER_OR_IDENTITY_KEY =
  /(?:seller|advertiser|author|owner|user|profile|account|business|agency|company|brand|contact|agent|dealer|publisher|آگهی.?دهنده|فروشنده|مالک|نام.?کاربری|پروفایل|حساب|آژانس|شرکت|دپارتمان|نام)/iu;

function isNameOrAffiliation(value: string): boolean {
  const text = normalizeAgencyText(value);
  if (!text) return false;
  if (MACHINE_AGENCY_MARKERS.test(text)) return true;

  // A common phrase in genuine owner listings is "real-estate agents don't
  // call". Remove only that request before checking for professional affiliation.
  const withoutNoAgentRequest = text.replace(OWNER_NO_AGENT_REQUEST, " ").replace(/\s+/g, " ").trim();
  if (!withoutNoAgentRequest) return false;

  if (AGENCY_TERMS.test(withoutNoAgentRequest)) {
    return true;
  }

  // Catch short brand names such as "املاک آریا" and "دپارتمان سپاهان".
  if (/^(?:املاک|آژانس|اژانس|دپارتمان|department|agency|realty)\s+[\p{L}\p{N}]/iu.test(withoutNoAgentRequest)) {
    return true;
  }

  return AFFILIATION_CLAIMS.test(withoutNoAgentRequest);
}

export function getDivarAgencyReason(value: unknown): string | null {
  const entries = collectEntries(value);
  for (const entry of entries) {
    const key = normalizeAgencyText(entry.key);
    const text = normalizeAgencyText(entry.value);

    if (MACHINE_AGENCY_MARKERS.test(text)) {
      return "نوع حساب یا آگهی‌دهنده در داده‌های دیوار متعلق به مشاور/آژانس املاک تشخیص داده شد.";
    }

    // Explicit seller/profile/business fields are especially trustworthy: the
    // word "املاک" in a person's own name is enough to flag for rejection.
    if (SELLER_OR_IDENTITY_KEY.test(key) && isNameOrAffiliation(text)) {
      return "نام یا اطلاعات هویتی آگهی‌دهنده نشانهٔ آژانس، دپارتمان، دفتر یا مشاور املاک دارد.";
    }
  }

  const allText = entries.map((entry) => entry.value).join("\n");
  const normalizedAllText = normalizeAgencyText(allText);
  if (MACHINE_AGENCY_MARKERS.test(normalizedAllText)) {
    return "نوع حساب یا آگهی‌دهنده در داده‌های دیوار متعلق به مشاور/آژانس املاک تشخیص داده شد.";
  }

  // Whole-ad text catches claims like "ما یک دپارتمان تخصصی املاک هستیم",
  // but ignores an owner's request that agents not contact them.
  const cleanedPieces = entries
    .map((entry) => normalizeAgencyText(entry.value).replace(OWNER_NO_AGENT_REQUEST, " ").trim())
    .filter(Boolean);

  for (const piece of cleanedPieces) {
    if (AFFILIATION_CLAIMS.test(piece) || ORGANIZATION_REAL_ESTATE.test(piece)) {
      return "در متن آگهی نشانهٔ فعالیت آژانس، دپارتمان یا مشاور املاک دیده شد.";
    }
  }

  return null;
}
