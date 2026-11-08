import { compactSearchText, normalizeSearchText } from "./property-search-utils.ts";

export type PublicPropertySearchFilterInput = {
  transactionType?: string;
  propertyType?: string;
  neighborhood?: string;
  featuredOnly?: boolean;
  search?: string;
  minArea?: number;
  maxArea?: number;
  minPrice?: number;
  maxPrice?: number;
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minFloor?: number;
  maxFloor?: number;
  minTotalFloors?: number;
  maxTotalFloors?: number;
  minBuiltYear?: number;
  maxBuiltYear?: number;
  parkingOnly?: boolean;
  elevatorOnly?: boolean;
  storageOnly?: boolean;
  specFilters?: string[];
  featureSearch?: string;
  hasImagesOnly?: boolean;
  hasLocationOnly?: boolean;
  floorType?: string;
  orientation?: string;
  convertibleOnly?: boolean;
  mapBounds?: [number, number, number, number];
  offset?: number;
};

export const PRICE_EXPR =
  "case when transaction_type = 'rent' then coalesce(rent, deposit) " +
  "when transaction_type = 'mortgage' then deposit else price end";

/** Shared deterministic ordering for public search cards and area listings. */
export function buildPublicPropertyOrderBySql(sortParameter = "$38::text"): string {
  return [
    `case when ${sortParameter} = 'newest' then case when featured and (featured_until is null or featured_until >= current_timestamp) then 0 else 1 end else 0 end,`,
    `case when ${sortParameter} = 'price_asc' then ${PRICE_EXPR} end asc nulls last,`,
    `case when ${sortParameter} = 'price_desc' then ${PRICE_EXPR} end desc nulls last,`,
    `case when ${sortParameter} = 'area_asc' then area_m2 end asc nulls last,`,
    `case when ${sortParameter} = 'area_desc' then area_m2 end asc nulls last,`,
    "published_at desc nulls last, created_at desc nulls last, id desc",
  ].join(" ");
}

function normalizedTextSql(expression: string): string {
  const canonical = `replace(replace(replace(replace(replace(replace(replace(lower(coalesce(${expression}, '')), 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), chr(8204), ''), chr(8205), ''), chr(8206), ''), chr(8207), '')`;
  const latinDigits = `translate(${canonical}, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')`;
  const withoutDiacritics = `translate(${latinDigits}, 'ًٌٍَُِّْٰٕٔ', '')`;
  return `regexp_replace(${withoutDiacritics}, '[[:space:][:punct:]]+', '', 'g')`;
}

/** Match any selected value within a spec group, while requiring every selected group. */
function buildSpecFilterSql(): string {
  const groups = [
    { selected: "selected.value like 'cabinet:%'", matches: "cabinet_type = substring(selected.value from 9)" },
    { selected: "selected.value like 'flooring:%'", matches: "flooring_type = substring(selected.value from 10)" },
    { selected: "selected.value like 'cooling:%'", matches: "cooling_system = substring(selected.value from 9)" },
    { selected: "selected.value like 'heating:%'", matches: "heating_system = substring(selected.value from 9)" },
    { selected: "selected.value like 'closet:%'", matches: "wall_closet_type = substring(selected.value from 8)" },
    {
      selected: "selected.value not like 'cabinet:%' and selected.value not like 'flooring:%' and selected.value not like 'cooling:%' and selected.value not like 'heating:%' and selected.value not like 'closet:%'",
      matches: "coalesce(other_amenities, '[]'::jsonb) ? selected.value",
    },
  ];

  const groupedMatches = groups.map(({ selected, matches }) =>
    `(not exists (select 1 from unnest($22::text[]) as selected(value) where ${selected}) or ` +
    `exists (select 1 from unnest($22::text[]) as selected(value) where ${selected} and ${matches}))`,
  );

  return `and ($22::text[] is null or cardinality($22::text[]) = 0 or (${groupedMatches.join(" and ")}))`;
}

export function buildPublicPropertyWhereSql(): string {
  return [
    "(deleted_at is null) and (status = 'published' or (status = 'draft' and publish_at is not null and publish_at <= current_timestamp)) and (unpublish_at is null or unpublish_at > current_timestamp)",
    "and (floor is null or floor = -60 or floor between 0 and 20)",
    "and ($1::text is null or transaction_type = $1)",
    "and ($2::text is null or property_type = $2)",
    `and ($3::text is null or ($5::boolean is true and ${normalizedTextSql("neighborhood")} = ${normalizedTextSql("$3::text")}) or ($5::boolean is false and strpos(${normalizedTextSql("neighborhood")}, ${normalizedTextSql("$3::text")}) > 0))`,
    "and ($4::boolean is false or (featured = true and (featured_until is null or featured_until >= current_timestamp)))",
    `and ($6::text is null or (select bool_and(strpos(${normalizedTextSql("concat_ws(' ', title, city, neighborhood, address, description, features::text)")}, ${normalizedTextSql("search_term")}) > 0) from unnest(regexp_split_to_array(trim($6::text), '[[:space:]]+')) as terms(search_term) where ${normalizedTextSql("search_term")} <> ''))`,
    "and ($7::int is null or area_m2 >= $7)",
    "and ($8::int is null or area_m2 <= $8)",
    "and ($9::numeric is null or " + PRICE_EXPR + " >= $9)",
    "and ($10::numeric is null or " + PRICE_EXPR + " <= $10)",
    "and ($11::int is null or bedrooms >= $11)",
    "and ($12::int is null or bathrooms >= $12)",
    "and ($13::int is null or floor >= $13)",
    "and ($14::int is null or floor <= $14)",
    "and ($15::int is null or total_floors >= $15)",
    "and ($16::int is null or total_floors <= $16)",
    "and ($17::int is null or built_year >= $17)",
    "and ($18::int is null or built_year <= $18)",
    "and ($19::boolean is false or parking = true)",
    "and ($20::boolean is false or elevator = true)",
    "and ($21::boolean is false or storage = true)",
    buildSpecFilterSql(),
    `and ($23::text is null or exists (select 1 from jsonb_array_elements_text(coalesce(features, '[]'::jsonb)) as feature(value) where strpos(${normalizedTextSql("feature.value")}, ${normalizedTextSql("$23::text")}) > 0))`,
    "and ($24::boolean is false or (jsonb_typeof(coalesce(images, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(images, '[]'::jsonb)) > 0))",
    "and ($25::boolean is false or (latitude is not null and longitude is not null))",
    "and ($26::text is null or floor_label = $26)",
    "and ($27::text is null or orientation = $27)",
    "and ($28::boolean is false or convertible = true)",
    "and ($29::double precision is null or (longitude is not null and round(longitude::numeric, 3) >= $29))",
    "and ($30::double precision is null or (latitude is not null and round(latitude::numeric, 3) >= $30))",
    "and ($31::double precision is null or (longitude is not null and round(longitude::numeric, 3) <= $31))",
    "and ($32::double precision is null or (latitude is not null and round(latitude::numeric, 3) <= $32))",
    "and ($33::numeric is null or deposit >= $33)",
    "and ($34::numeric is null or deposit <= $34)",
    "and ($35::numeric is null or rent >= $35)",
    "and ($36::numeric is null or rent <= $36)",
  ].join(" ");
}

/** Keep positional parameter order in one tested place for list/count endpoints. */
export function buildPublicPropertyFilterParams(data: PublicPropertySearchFilterInput): unknown[] {
  const neighborhood = data.neighborhood?.trim() || null;
  const exactNeighborhood = Boolean(
    neighborhood && compactSearchText(neighborhood).length >= 2 && !neighborhood.includes("%"),
  );
  return [
    data.transactionType ?? null,
    data.propertyType ?? null,
    neighborhood,
    data.featuredOnly ?? false,
    exactNeighborhood,
    (data.search ? normalizeSearchText(data.search) : "") || null,
    data.minArea ?? null,
    data.maxArea ?? null,
    data.minPrice ?? null,
    data.maxPrice ?? null,
    data.minBedrooms ?? null,
    data.minBathrooms ?? null,
    data.minFloor ?? null,
    data.maxFloor ?? null,
    data.minTotalFloors ?? null,
    data.maxTotalFloors ?? null,
    data.minBuiltYear ?? null,
    data.maxBuiltYear ?? null,
    data.parkingOnly ?? false,
    data.elevatorOnly ?? false,
    data.storageOnly ?? false,
    data.specFilters?.length ? data.specFilters : null,
    (data.featureSearch ? compactSearchText(data.featureSearch) : "") || null,
    data.hasImagesOnly ?? false,
    data.hasLocationOnly ?? false,
    data.floorType ?? null,
    data.orientation ?? null,
    data.convertibleOnly ?? false,
    ...(data.mapBounds ?? [null, null, null, null]),
    data.minDeposit ?? null,
    data.maxDeposit ?? null,
    data.minRent ?? null,
    data.maxRent ?? null,
    data.offset ?? 0,
  ];
}
