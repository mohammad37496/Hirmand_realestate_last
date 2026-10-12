import { getSql } from "@/lib/db";
import { DEFAULT_MATCH_RAHN_RATE } from "@/lib/budget-matching";

type MatchMode = "price" | "amenities" | "both" | "smart";
type SqlClient = Awaited<ReturnType<typeof getSql>>;

const TYPE_LABELS: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا",
  office: "اداری",
  heritage: "کلنگی",
  land: "زمین",
  commercial: "تجاری",
};

const PROPERTY_COLUMNS = `
  id, slug, title, transaction_type, property_type, neighborhood,
  area_m2, bedrooms, bathrooms, floor, floor_label, total_floors,
  built_year, parking, elevator, storage, painted, wallpaper, convertible,
  cabinet_type, flooring_type, cooling_system, heating_system, wall_closet_type,
  other_amenities, price, deposit, rent, published_at, created_at, updated_at, price_drop_percent
`;

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number {
  const parsed = num(value);
  return parsed != null && parsed > 0 ? parsed : 0;
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
  const deal = String(lead.deal ?? "").trim();

  if (deal === "خرید" || deal === "فروش") {
    const min = positive(deal === "خرید"
      ? lead.budget_purchase_min ?? lead.budget_purchase
      : lead.budget_sale_min ?? lead.budget_sale);
    const max = positive(deal === "خرید"
      ? lead.budget_purchase_max ?? lead.budget_purchase
      : lead.budget_sale_max ?? lead.budget_sale);

    if (!min && !max) return null;
    return { min: min || max, max: max || min };
  }

  const depositMin = positive(lead.budget_deposit_min ?? lead.budget_deposit);
  const depositMax = positive(lead.budget_deposit_max ?? lead.budget_deposit);
  const rentMin = positive(lead.budget_rent_min ?? lead.budget_rent);
  const rentMax = positive(lead.budget_rent_max ?? lead.budget_rent);

  if (!depositMin && !depositMax && !rentMin && !rentMax) return null;

  return {
    min: totalEquivalent(depositMin, rentMin),
    max: totalEquivalent(depositMax || depositMin, rentMax || rentMin),
  };
}

function propertyComparableValue(row: Record<string, unknown>) {
  const transactionType = String(row.transaction_type);
  if (transactionType === "rent" || transactionType === "mortgage") {
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

function scoreProperty(
  row: Record<string, unknown>,
  lead: Record<string, unknown>,
  mode: MatchMode,
  learned: {
    likedProperties: Set<string>;
    rejectedProperties: Set<string>;
    likedNeighborhoods: Set<string>;
    rejectedNeighborhoods: Set<string>;
    likedTypes: Set<string>;
    rejectedTypes: Set<string>;
    likedTransactions: Set<string>;
    rejectedTransactions: Set<string>;
  },
) {
  const requestedAmenities = jsonArray(lead.requested_amenities);
  const requestedBedrooms = num(lead.requested_bedrooms);
  const neighborhood = String(lead.neighborhood ?? "").trim();
  const range = requestedPriceRange(lead);

  const amenities = propertyAmenitySet(row);
  const coveredAmenities = requestedAmenities.filter((value) => amenities.has(value)).length;
  const amenityCoverage = requestedAmenities.length
    ? safeMatchCount(coveredAmenities, requestedAmenities.length)
    : null;
  const price = priceScore(propertyComparableValue(row), range);
  const sameNeighborhood = neighborhood
    ? String(row.neighborhood ?? "").trim() === neighborhood
    : null;
  const bedrooms = num(row.bedrooms);
  const sameBedrooms = requestedBedrooms == null || bedrooms == null
    ? null
    : requestedBedrooms === 0
      ? bedrooms === 0
      : bedrooms >= requestedBedrooms;

  let score = 0;
  const reasons: string[] = [];

  if (price != null) {
    score += price * (
      mode === "price" ? 0.68
        : mode === "amenities" ? 0.15
          : mode === "both" ? 0.45
            : 0.3
    );
    if (price >= 95) reasons.push("قیمت بسیار نزدیک به بودجه");
    else if (price >= 70) reasons.push("قیمت نزدیک به بودجه");
  }

  if (amenityCoverage != null) {
    score += amenityCoverage * (
      mode === "amenities" ? 0.7
        : mode === "price" ? 0.12
          : mode === "both" ? 0.35
            : 0.25
    );
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

  if (String(row.transaction_type) === "mortgage" && (String(lead.deal) === "رهن" || String(lead.deal) === "اجاره")) {
    score += 3;
  }

  if (mode === "smart") {
    if (sameNeighborhood === true) score += 6;
    if (sameBedrooms === true) score += 4;

    const preferredFloor = String(lead.floor_preference ?? "").trim();
    if (preferredFloor && String(row.floor ?? "") === preferredFloor) {
      score += 5;
      reasons.push("طبقه مطابق درخواست");
    }
  }

  if (learned.likedProperties.has(String(row.id))) {
    score += 8;
    reasons.push("مورد پسند قبلی مشتری");
  }
  if (learned.rejectedProperties.has(String(row.id))) {
    score -= 10;
  }

  const rowNeighborhood = String(row.neighborhood ?? "").trim();
  const rowType = String(row.property_type ?? "").trim();
  const rowTransaction = String(row.transaction_type ?? "").trim();

  if (learned.likedNeighborhoods.has(rowNeighborhood)) {
    score += 5;
    reasons.push("ترجیح یادگرفته‌شده از محله");
  }
  if (learned.rejectedNeighborhoods.has(rowNeighborhood)) {
    score -= 4;
  }
  if (learned.likedTypes.has(rowType)) {
    score += 3;
    reasons.push("ترجیح یادگرفته‌شده از نوع ملک");
  }
  if (learned.rejectedTypes.has(rowType)) {
    score -= 2;
  }
  if (learned.likedTransactions.has(rowTransaction)) {
    score += 2;
  }
  if (learned.rejectedTransactions.has(rowTransaction)) {
    score -= 2;
  }

  const hasMeaningfulSignal =
    price != null ||
    (amenityCoverage != null && amenityCoverage > 0) ||
    sameNeighborhood === true ||
    sameBedrooms === true;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    amenityCoverage,
    priceMatch: price,
    hasMeaningfulSignal,
  };
}

function serializeMatch(row: Record<string, unknown>, scored: ReturnType<typeof scoreProperty>) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    score: scored.score,
    priceMatch: scored.priceMatch,
    amenityCoverage: scored.amenityCoverage,
    reasons: scored.reasons,
    neighborhood: String(row.neighborhood ?? ""),
    propertyType: String(row.property_type ?? ""),
    propertyTypeLabel: TYPE_LABELS[String(row.property_type)] ?? String(row.property_type ?? ""),
    transactionType: String(row.transaction_type ?? ""),
    areaM2: num(row.area_m2),
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    floor: num(row.floor),
    price: row.price == null ? null : String(row.price),
    deposit: row.deposit == null ? null : String(row.deposit),
    rent: row.rent == null ? null : String(row.rent),
    publishedAt: row.published_at == null ? null : new Date(String(row.published_at)).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function autoMatchLead(
  sql: SqlClient,
  leadId: string,
  options: { limit?: number; mode?: MatchMode } = {},
) {
  const mode = options.mode ?? "smart";
  const limit = Math.min(12, Math.max(3, Number(options.limit) || 8));

  const leadRows = await sql.query<Record<string, unknown>>(
    `select
       id, deal, property_type, neighborhood, floor_preference,
       requested_bedrooms, requested_amenities,
       budget_deposit, budget_rent, budget_purchase, budget_sale,
       budget_deposit_min, budget_deposit_max,
       budget_rent_min, budget_rent_max,
       budget_purchase_min, budget_purchase_max,
       budget_sale_min, budget_sale_max
     from leads
     where id = $1
     limit 1`,
    [leadId],
  );
  const lead = leadRows[0];
  if (!lead) return { count: 0, matches: [] };

  const propertyType = requestedPropertyType(lead);
  const deal = String(lead.deal ?? "").trim();
  if (!deal) return { count: 0, matches: [] };

  const transactionTypes =
    deal === "خرید" ? ["sell"]
      : deal === "فروش" ? ["buy"]
        : deal === "رهن" || deal === "اجاره" ? ["rent", "mortgage"]
          : [];

  if (!transactionTypes.length) return { count: 0, matches: [] };

  const feedbackRows = await sql.query<Record<string, unknown>>(
    `select
       metadata->>'propertyId' as property_id,
       metadata->>'feedback' as feedback
     from lead_activities
     where lead_id=$1
       and activity_type='match'
       and metadata->>'feedback' in ('liked','rejected')
     order by created_at desc
     limit 100`,
    [leadId],
  );

  const feedbackIds = feedbackRows
    .map((row) => row.property_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const feedbackProperties = feedbackIds.length
    ? await sql.query<Record<string, unknown>>(
        `select id, neighborhood, property_type, transaction_type
         from properties
         where id = any($1::text[])`,
        [feedbackIds],
      )
    : [];

  const feedbackById = new Map(feedbackProperties.map((row) => [String(row.id), row]));
  const learned = {
    likedProperties: new Set(feedbackRows.filter((row) => row.feedback === "liked").map((row) => String(row.property_id))),
    rejectedProperties: new Set(feedbackRows.filter((row) => row.feedback === "rejected").map((row) => String(row.property_id))),
    likedNeighborhoods: new Set<string>(),
    rejectedNeighborhoods: new Set<string>(),
    likedTypes: new Set<string>(),
    rejectedTypes: new Set<string>(),
    likedTransactions: new Set<string>(),
    rejectedTransactions: new Set<string>(),
  };

  for (const row of feedbackRows) {
    const property = feedbackById.get(String(row.property_id));
    if (!property) continue;
    const isLiked = row.feedback === "liked";
    const neighborhood = String(property.neighborhood ?? "").trim();
    const type = String(property.property_type ?? "").trim();
    const transaction = String(property.transaction_type ?? "").trim();
    if (isLiked) {
      if (neighborhood) learned.likedNeighborhoods.add(neighborhood);
      if (type) learned.likedTypes.add(type);
      if (transaction) learned.likedTransactions.add(transaction);
    } else {
      if (neighborhood) learned.rejectedNeighborhoods.add(neighborhood);
      if (type) learned.rejectedTypes.add(type);
      if (transaction) learned.rejectedTransactions.add(transaction);
    }
  }

  const candidateRows = await sql.query<Record<string, unknown>>(
    `select ${PROPERTY_COLUMNS}
     from properties
     where status = 'published'
       and (
         $1::text = ''
         or property_type = $1
       )
       and transaction_type = any($2::text[])
     order by featured desc, published_at desc nulls last, created_at desc
     limit 600`,
    [propertyType, transactionTypes],
  );

  const scored = candidateRows
    .map((row) => ({ row, scored: scoreProperty(row, lead, mode, learned) }))
    .filter((item) => item.scored.hasMeaningfulSignal)
    .sort((a, b) =>
      b.scored.score - a.scored.score ||
      (b.scored.amenityCoverage ?? 0) - (a.scored.amenityCoverage ?? 0) ||
      (b.scored.priceMatch ?? 0) - (a.scored.priceMatch ?? 0),
    )
    .slice(0, limit);

  const matches = scored.map(({ row, scored }) => serializeMatch(row, scored));

  await sql.query(
    `update leads
     set matched_properties = $2::jsonb,
         match_count = $3,
         updated_at = current_timestamp
     where id = $1`,
    [
      leadId,
      JSON.stringify(matches.map((match) => ({
        id: match.id,
        slug: match.slug,
        title: match.title,
        score: match.score,
        priceMatch: match.priceMatch,
        amenityCoverage: match.amenityCoverage,
        mode,
        automatic: true,
        updatedAt: match.updatedAt,
      }))),
      matches.length,
    ],
  );

  await sql.query(
    `insert into lead_activities
      (lead_id, activity_type, title, note, metadata)
     values ($1,'match',$2,$3,$4::jsonb)`,
    [
      leadId,
      "پیشنهاد خودکار فایل‌ها انجام شد",
      "موتور تطبیق هوشمند به‌صورت خودکار " + matches.length + " فایل برای این لید پیشنهاد کرد.",
      JSON.stringify({
        mode,
        automatic: true,
        count: matches.length,
        topScore: matches[0]?.score ?? null,
      }),
    ],
  ).catch(() => {});

  return { count: matches.length, matches };
}
