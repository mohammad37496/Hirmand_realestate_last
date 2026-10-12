import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { DEFAULT_MATCH_RAHN_RATE } from "@/lib/budget-matching";

type MatchMode = "price" | "amenities" | "both" | "smart";

const MATCH_MODES: MatchMode[] = ["price", "amenities", "both", "smart"];
const MODE_META_LABEL: Record<MatchMode, string> = {
  price: "قیمت حدودی",
  amenities: "امکانات",
  both: "قیمت + امکانات",
  smart: "تطبیق هوشمند",
};

const TYPE_LABELS: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا",
  office: "اداری",
  heritage: "کلنگی",
  land: "زمین",
  commercial: "تجاری",
};

const PROPERTY_TX_LABELS: Record<string, string> = {
  buy: "خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

const PROPERTY_COLUMNS = `
  id, slug, status, featured, featured_until, title, transaction_type, property_type, city,
  neighborhood, address, area_m2, bedrooms, bathrooms, floor, floor_label, total_floors,
  built_year, parking, elevator, storage, painted, wallpaper, convertible,
  cabinet_type, flooring_type, cooling_system, heating_system, wall_closet_type,
  other_amenities, price, deposit, rent, description, features, images,
  contact_name, contact_phone, published_at, created_at, updated_at,
  latitude, longitude, price_drop_percent
`;

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number {
  const n = num(value);
  return n != null && n > 0 ? n : 0;
}

function totalEquivalent(deposit: number, rent: number) {
  return Math.max(0, deposit) + (Math.max(0, rent) * 1_000_000) / DEFAULT_MATCH_RAHN_RATE;
}

function propertyAmenitySet(row: Record<string, unknown>) {
  const values = new Set<string>();
  if (row.parking) values.add("parking");
  if (row.elevator) values.add("elevator");
  if (row.storage) values.add("storage");
  if (row.painted) values.add("painted");
  if (row.wallpaper) values.add("wallpaper");
  if (row.convertible) values.add("convertible");

  for (const value of jsonArray(row.other_amenities)) values.add(value);

  const prefixed: Array<[string, unknown]> = [
    ["cabinet", row.cabinet_type],
    ["flooring", row.flooring_type],
    ["cooling", row.cooling_system],
    ["heating", row.heating_system],
    ["wallCloset", row.wall_closet_type],
  ];
  for (const [prefix, value] of prefixed) {
    if (typeof value === "string" && value.trim()) values.add(prefix + ":" + value.trim());
  }

  return values;
}

function requestedPriceRange(lead: Record<string, unknown>) {
  const deal = String(lead.deal ?? "");
  if (deal === "خرید" || deal === "فروش") {
    const min = positive(deal === "خرید" ? lead.budget_purchase_min ?? lead.budget_purchase : lead.budget_sale_min ?? lead.budget_sale);
    const max = positive(deal === "خرید" ? lead.budget_purchase_max ?? lead.budget_purchase : lead.budget_sale_max ?? lead.budget_sale);
    if (!min && !max) return null;
    return { min: min || max, max: max || min, kind: "absolute" as const };
  }

  const depositMin = positive(lead.budget_deposit_min ?? lead.budget_deposit);
  const depositMax = positive(lead.budget_deposit_max ?? lead.budget_deposit);
  const rentMin = positive(lead.budget_rent_min ?? lead.budget_rent);
  const rentMax = positive(lead.budget_rent_max ?? lead.budget_rent);
  if (!depositMin && !depositMax && !rentMin && !rentMax) return null;

  return {
    min: totalEquivalent(depositMin, rentMin),
    max: totalEquivalent(depositMax || depositMin, rentMax || rentMin),
    kind: "rentLike" as const,
  };
}

function propertyComparableValue(row: Record<string, unknown>) {
  const tx = String(row.transaction_type);
  if (tx === "rent" || tx === "mortgage") {
    return totalEquivalent(positive(row.deposit), positive(row.rent));
  }
  return positive(row.price);
}

function requestedPropertyType(lead: Record<string, unknown>) {
  const raw = String(lead.property_type ?? "").trim();
  if (!raw) return "";
  const found = Object.entries(TYPE_LABELS).find(([, label]) => label === raw);
  return found?.[0] ?? raw;
}

function priceScore(value: number, range: ReturnType<typeof requestedPriceRange>) {
  if (!range || value <= 0) return null;
  const min = range.min;
  const max = Math.max(range.max, min);
  if (value >= min && value <= max) return 100;

  const center = (min + max) / 2;
  const span = Math.max(max - min, center * 0.15, 1);
  const distance = Math.abs(value - center);
  return Math.max(0, Math.round(100 - (distance / span) * 100));
}

function safeMatchCount(covered: number, requested: number) {
  if (!requested) return 0;
  return Math.round((covered / requested) * 100);
}

function serializeProperty(row: Record<string, unknown>, score: number, reasons: string[], amenityCoverage: number | null, priceMatch: number | null) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: String(row.status),
    featured: Boolean(row.featured),
    transactionType: String(row.transaction_type),
    transactionLabel: PROPERTY_TX_LABELS[String(row.transaction_type)] ?? String(row.transaction_type),
    propertyType: String(row.property_type),
    propertyTypeLabel: TYPE_LABELS[String(row.property_type)] ?? String(row.property_type),
    neighborhood: String(row.neighborhood ?? ""),
    address: row.address == null ? "" : String(row.address),
    areaM2: num(row.area_m2),
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    floor: num(row.floor),
    floorLabel: row.floor_label === "suite" ? "سوئیت" : null,
    totalFloors: num(row.total_floors),
    builtYear: num(row.built_year),
    parking: Boolean(row.parking),
    elevator: Boolean(row.elevator),
    storage: Boolean(row.storage),
    painted: Boolean(row.painted),
    wallpaper: Boolean(row.wallpaper),
    convertible: Boolean(row.convertible),
    cabinetType: row.cabinet_type == null ? null : String(row.cabinet_type),
    flooringType: row.flooring_type == null ? null : String(row.flooring_type),
    coolingSystem: row.cooling_system == null ? null : String(row.cooling_system),
    heatingSystem: row.heating_system == null ? null : String(row.heating_system),
    wallClosetType: row.wall_closet_type == null ? null : String(row.wall_closet_type),
    otherAmenities: jsonArray(row.other_amenities),
    price: row.price == null ? null : String(row.price),
    deposit: row.deposit == null ? null : String(row.deposit),
    rent: row.rent == null ? null : String(row.rent),
    description: String(row.description ?? ""),
    features: jsonArray(row.features),
    images: jsonArray(row.images),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    publishedAt: row.published_at == null ? null : new Date(String(row.published_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    priceDropPercent: num(row.price_drop_percent),
    score,
    reasons,
    priceMatch,
    amenityCoverage,
  };
}

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مچ کردن فایل‌ها برای مشتریان برای این حساب فعال نیست." });
  }
}

function mapLead(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    peopleCount: num(row.people_count),
    job: String(row.job ?? ""),
    deal: String(row.deal ?? ""),
    propertyType: String(row.property_type ?? ""),
    propertyTypeLabel: TYPE_LABELS[String(row.property_type)] ?? String(row.property_type ?? ""),
    neighborhood: String(row.neighborhood ?? ""),
    floorPreference: String(row.floor_preference ?? ""),
    requestedBedrooms: num(row.requested_bedrooms),
    requestedAmenities: jsonArray(row.requested_amenities),
    consultant: String(row.consultant ?? ""),
    note: String(row.note ?? ""),
    status: String(row.status),
    source: String(row.source ?? "website"),
    leaseDeadline: row.lease_deadline == null ? null : String(row.lease_deadline),
    budgetDeposit: num(row.budget_deposit),
    budgetRent: num(row.budget_rent),
    budgetPurchase: num(row.budget_purchase),
    budgetSale: num(row.budget_sale),
    budgetDepositMin: num(row.budget_deposit_min),
    budgetDepositMax: num(row.budget_deposit_max),
    budgetRentMin: num(row.budget_rent_min),
    budgetRentMax: num(row.budget_rent_max),
    budgetPurchaseMin: num(row.budget_purchase_min),
    budgetPurchaseMax: num(row.budget_purchase_max),
    budgetSaleMin: num(row.budget_sale_min),
    budgetSaleMax: num(row.budget_sale_max),
    budgetEquivalent: num(row.budget_equivalent),
    budgetBedrooms: num(row.budget_bedrooms),
    budgetRate: num(row.budget_rate),
    matchCount: Number(row.match_count) || 0,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

const LEAD_COLUMNS = `
  id,name,phone,people_count,job,deal,property_type,neighborhood,floor_preference,
  requested_bedrooms,requested_amenities,consultant,note,status,source,
  lease_deadline,budget_deposit,budget_rent,budget_purchase,budget_sale,
  budget_deposit_min,budget_deposit_max,budget_rent_min,budget_rent_max,
  budget_purchase_min,budget_purchase_max,budget_sale_min,budget_sale_max,
  budget_equivalent,budget_bedrooms,budget_rate,match_count,created_at
`;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);

  const body = (await readBody(event).catch(() => ({}))) as {
    action?: "list" | "match" | "feedback";
    leadId?: string;
    mode?: MatchMode;
    limit?: number;
    feedback?: "sent" | "liked" | "rejected" | "visited";
    propertyId?: string;
    propertyTitle?: string;
  };

  if (dbSource === "unconfigured") {
    return body.action === "match" ? { lead: null, matches: [] } : { leads: [] };
  }

  const sql = await getSql();

  if (body.action === "feedback") {
    if (!body.leadId || !body.propertyId || !body.feedback) {
      throw createError({ statusCode: 400, statusMessage: "اطلاعات نتیجه مچ ناقص است." });
    }
    const labels = {
      sent: "فایل برای مشتری ارسال شد",
      liked: "مشتری فایل را پسندید",
      rejected: "مشتری فایل را نپسندید",
      visited: "برای فایل بازدید انجام شد",
    } as const;
    const title = body.propertyTitle?.trim().slice(0, 180) || "فایل";
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'match',$2,$3,$4::jsonb)",
      [
        body.leadId,
        labels[body.feedback] + " · " + title,
        "نتیجه مچ برای فایل ثبت شد.",
        JSON.stringify({
          feedback: body.feedback,
          propertyId: body.propertyId,
          propertyTitle: title,
        }),
      ],
    );
    return { success: true };
  }

  if ((body.action ?? "list") === "list") {
    const rows = await sql.query<Record<string, unknown>>(
      `select ${LEAD_COLUMNS}
       from leads
       order by created_at desc
       limit 1000`,
    );
    return { leads: rows.map(mapLead) };
  }

  if (body.action !== "match" || !body.leadId) {
    throw createError({ statusCode: 400, statusMessage: "درخواست مچ کردن نامعتبر است." });
  }

  const mode = MATCH_MODES.includes(body.mode as MatchMode) ? body.mode as MatchMode : "smart";
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 24));

  const leadRows = await sql.query<Record<string, unknown>>(
    `select ${LEAD_COLUMNS} from leads where id = $1 limit 1`,
    [body.leadId],
  );
  const lead = leadRows[0];
  if (!lead) throw createError({ statusCode: 404, statusMessage: "درخواست مشتری پیدا نشد." });

  const propertyType = requestedPropertyType(lead);
  const deal = String(lead.deal ?? "");
  const range = requestedPriceRange(lead);
  const requestedAmenities = jsonArray(lead.requested_amenities);
  const requestedBedrooms = num(lead.requested_bedrooms);
  const neighborhood = String(lead.neighborhood ?? "").trim();

  const candidateRows = await sql.query<Record<string, unknown>>(
    `select ${PROPERTY_COLUMNS}
     from properties
     where status = 'published'
       and (
         $1::text = ''
         or property_type = $1
       )
       and (
         $2::text = ''
         or transaction_type = any($2::text[])
       )
     order by featured desc, published_at desc nulls last, created_at desc
     limit 1500`,
    [
      propertyType,
      deal === "خرید" ? ["sell"] : deal === "فروش" ? ["buy"] : ["rent", "mortgage"],
    ],
  );

  const scored = candidateRows
    .map((row) => {
      const amenities = propertyAmenitySet(row);
      const coveredAmenities = requestedAmenities.filter((value) => amenities.has(value)).length;
      const amenityCoverage = requestedAmenities.length ? safeMatchCount(coveredAmenities, requestedAmenities.length) : null;
      const price = priceScore(propertyComparableValue(row), range);
      const sameNeighborhood = neighborhood ? String(row.neighborhood).trim() === neighborhood : null;
      const sameBedrooms =
        requestedBedrooms == null || num(row.bedrooms) == null
          ? null
          : requestedBedrooms === 0
            ? num(row.bedrooms) === 0
            : (num(row.bedrooms) ?? 0) >= requestedBedrooms;

      let score = 0;
      const reasons: string[] = [];

      if (price != null) {
        score += price * (mode === "price" ? 0.68 : mode === "amenities" ? 0.15 : mode === "both" ? 0.45 : 0.3);
        if (price >= 95) reasons.push("قیمت بسیار نزدیک به بودجه");
        else if (price >= 70) reasons.push("قیمت نزدیک به بودجه");
      }

      if (amenityCoverage != null) {
        score += amenityCoverage * (mode === "amenities" ? 0.7 : mode === "price" ? 0.12 : mode === "both" ? 0.35 : 0.25);
        if (amenityCoverage >= 100) reasons.push("تمام امکانات درخواستی موجود است");
        else if (amenityCoverage > 0) reasons.push(amenityCoverage + "% امکانات درخواستی موجود است");
      }

      if (sameNeighborhood === true) {
        score += mode === "price" ? 10 : 12;
        reasons.push("همان محله");
      } else if (sameNeighborhood === false && mode === "smart") {
        score -= 3;
      }

      if (sameBedrooms === true) {
        score += mode === "smart" ? 12 : 8;
        reasons.push("تعداد خواب مناسب");
      }

      if (String(row.transaction_type) === "mortgage" && (deal === "رهن" || deal === "اجاره")) {
        score += 3;
      }

      if (mode === "smart") {
        if (sameNeighborhood === true) score += 6;
        if (requestedBedrooms != null && sameBedrooms === true) score += 4;
        if (String(row.floor ?? "") === String(lead.floor_preference ?? "").trim() && String(lead.floor_preference ?? "").trim()) {
          score += 5;
          reasons.push("طبقه مطابق درخواست");
        }
      }

      // Never hide a property completely when the user asked for an amenity-first
      // search; the admin needs visibility into near matches. Still require at
      // least one meaningful signal so the list does not become the whole catalog.
      const hasMeaningfulSignal =
        price != null ||
        (amenityCoverage != null && amenityCoverage > 0) ||
        sameNeighborhood === true ||
        sameBedrooms === true;

      return {
        row,
        score: Math.max(0, Math.min(100, Math.round(score))),
        reasons,
        amenityCoverage,
        priceMatch: price,
        hasMeaningfulSignal,
      };
    })
    .filter((item) => item.hasMeaningfulSignal)
    .sort((a, b) => b.score - a.score || (b.amenityCoverage ?? 0) - (a.amenityCoverage ?? 0) || (b.priceMatch ?? 0) - (a.priceMatch ?? 0))
    .slice(0, limit);

  const serializedMatches = scored.map((item) =>
    serializeProperty(item.row, item.score, item.reasons, item.amenityCoverage, item.priceMatch),
  );

  await sql.query(
    "update leads set matched_properties=$2::jsonb, match_count=$3, updated_at=current_timestamp where id=$1",
    [
      body.leadId,
      JSON.stringify(
        serializedMatches.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          score: item.score,
          priceMatch: item.priceMatch,
          amenityCoverage: item.amenityCoverage,
          mode,
          updatedAt: new Date().toISOString(),
        })),
      ),
      serializedMatches.length,
    ],
  );

  await sql.query(
    "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'match',$2,$3,$4::jsonb)",
    [
      body.leadId,
      "مچ فایل‌ها انجام شد",
      "معیار: " + MODE_META_LABEL[mode] + " · " + serializedMatches.length + " فایل پیشنهاد شد.",
      JSON.stringify({ mode, count: serializedMatches.length }),
    ],
  ).catch(() => {});

  return {
    lead: { ...mapLead(lead), matchCount: serializedMatches.length },
    mode,
    matches: serializedMatches,
  };
});
