import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { cachedPropertyRead, clearPropertyReadCache } from "@/lib/property-read-cache.server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { nullableMoneyFieldSchema } from "@/lib/property-input-normalization";
import { requireAdminPermission } from "@/lib/admin-role.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { decodeSlugCandidates, legacyIdFragments } from "@/lib/property-slug";
import { calculateBudgetMatch, DEFAULT_MATCH_RAHN_RATE, type BudgetInput, type BudgetMatchDetails } from "@/lib/budget-matching";
import { MAX_PROPERTY_MEDIA, isAllowedMediaRef } from "@/lib/media";
import { deleteStoredMedia } from "@/lib/media-store.server";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";
import { getPublishReadiness } from "@/lib/property-publish-readiness";
import {
  PROPERTY_CABINET_OPTIONS,
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_FLOORING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_WALL_CLOSET_OPTIONS,
  type PropertyCabinetType,
  type PropertyCoolingSystem,
  type PropertyFlooringType,
  type PropertyHeatingSystem,
  type PropertyOtherAmenity,
  type PropertyWallClosetType,
} from "@/lib/property-options";

export type PropertyStatus = "draft" | "published" | "archived";
export type PropertyAvailabilityStatus = "available" | "reserved" | "sold" | "rented" | "unavailable";
export type PropertyTransaction = "buy" | "sell" | "rent" | "mortgage";
export type PropertyType =
  | "apartment"
  | "villa"
  | "office"
  | "heritage"
  | "land"
  | "commercial";

export type PropertyOrientation =
  | "north" | "south" | "east" | "west"
  | "northeast" | "northwest" | "southeast" | "southwest"
  | "two_fronts" | "three_fronts" | "four_fronts" | "other";

export type Property = {
  id: string;
  slug: string;
  status: PropertyStatus;
  availabilityStatus: PropertyAvailabilityStatus;
  featured: boolean;
  featuredUntil?: string | null;
  title: string;
  transactionType: PropertyTransaction;
  propertyType: PropertyType;
  city: string;
  neighborhood: string;
  address: string | null;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floorLabel: "suite" | null;
  orientation: PropertyOrientation | null;
  totalFloors: number | null;
  builtYear: number | null;
  parking: boolean;
  elevator: boolean;
  storage: boolean;
  painted: boolean;
  wallpaper: boolean;
  convertible: boolean;
  cabinetType: PropertyCabinetType | null;
  flooringType: PropertyFlooringType | null;
  coolingSystem: PropertyCoolingSystem | null;
  heatingSystem: PropertyHeatingSystem | null;
  wallClosetType: PropertyWallClosetType | null;
  otherAmenities: PropertyOtherAmenity[];
  price: string | null;
  deposit: string | null;
  rent: string | null;
  description: string;
  features: string[];
  images: string[];
  contactName: string;
  contactPhone: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerInfo?: string;
  publishedAt: string | null;
  scheduledPublishAt?: string | null;
  scheduledUnpublishAt?: string | null;
  deletedAt?: string | null;
  deletedFromStatus?: PropertyStatus | null;
  createdAt: string;
  updatedAt: string;
  virtualTourUrl?: string;
  floorPlanUrl?: string;
  latitude: number | null;
  longitude: number | null;
  priceDropPercent?: number | null;
  lastVerifiedAt?: string | null;
  lastVerifiedBy?: string | null;
  internalPriority?: "low" | "normal" | "high" | "urgent";
  internalNote?: string;
};

export type PropertyHistoryState = {
  title: string | null;
  status: PropertyStatus | null;
  availabilityStatus: PropertyAvailabilityStatus | null;
  featured: boolean | null;
  price: string | null;
  deposit: string | null;
  rent: string | null;
  contactName: string | null;
  contactPhone: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerInfo: string | null;
};

export type PropertyCardData = Pick<
  Property,
  | "id"
  | "slug"
  | "status"
  | "availabilityStatus"
  | "featured"
  | "title"
  | "transactionType"
  | "propertyType"
  | "neighborhood"
  | "areaM2"
  | "bedrooms"
  | "parking"
  | "elevator"
  | "price"
  | "deposit"
  | "rent"
  | "priceDropPercent"
  | "latitude"
  | "longitude"
> & {
  featuredUntil?: string | null;
  image: string | null;
  publishedAt?: string | null;
};

export type PropertySort = "newest" | "price_asc" | "price_desc" | "area_asc" | "area_desc";

export type PropertyFilters = {
  transactionType?: PropertyTransaction;
  propertyType?: PropertyType;
  neighborhood?: string;
  featuredOnly?: boolean;
  search?: string;
  minArea?: number;
  maxArea?: number;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minFloor?: number;
  maxFloor?: number;
  floorType?: "suite";
  orientation?: PropertyOrientation;
  convertibleOnly?: boolean;
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
  sort?: PropertySort;
  offset?: number;
};

const publicFiltersSchema = z.object({
  transactionType: z.enum(["buy", "sell", "rent", "mortgage"]).optional(),
  propertyType: z
    .enum(["apartment", "villa", "office", "heritage", "land", "commercial"])
    .optional(),
  neighborhood: z.string().trim().max(80).optional(),
  featuredOnly: z.boolean().optional(),
  search: z.string().trim().max(80).optional(),
  minArea: z.number().int().min(0).max(100000).optional(),
  maxArea: z.number().int().min(0).max(100000).optional(),
  minPrice: z.number().int().min(0).max(999999999999999).optional(),
  maxPrice: z.number().int().min(0).max(999999999999999).optional(),
  minBedrooms: z.number().int().min(0).max(30).optional(),
  minBathrooms: z.number().int().min(0).max(30).optional(),
  minFloor: z.number().int().min(-60).max(200).optional(),
  maxFloor: z.number().int().min(-60).max(200).optional(),
  floorType: z.literal("suite").optional(),
  orientation: z.enum(["north","south","east","west","northeast","northwest","southeast","southwest","two_fronts","three_fronts","four_fronts","other"]).optional(),
  convertibleOnly: z.boolean().optional(),
  minTotalFloors: z.number().int().min(0).max(200).optional(),
  maxTotalFloors: z.number().int().min(0).max(200).optional(),
  minBuiltYear: z.number().int().min(1200).max(2500).optional(),
  maxBuiltYear: z.number().int().min(1200).max(2500).optional(),
  parkingOnly: z.boolean().optional(),
  elevatorOnly: z.boolean().optional(),
  storageOnly: z.boolean().optional(),
  specFilters: z.array(z.string().trim().min(1).max(100)).max(120).optional(),
  featureSearch: z.string().trim().max(80).optional(),
  hasImagesOnly: z.boolean().optional(),
  hasLocationOnly: z.boolean().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "area_asc", "area_desc"]).optional().default("newest"),
  offset: z.number().int().min(0).max(100000).optional().default(0),
});

const nullableMoneyField = nullableMoneyFieldSchema;



const CABINET_VALUES = PROPERTY_CABINET_OPTIONS.map((item) => item.value) as [
  PropertyCabinetType,
  ...PropertyCabinetType[],
];
const FLOORING_VALUES = PROPERTY_FLOORING_OPTIONS.map((item) => item.value) as [
  PropertyFlooringType,
  ...PropertyFlooringType[],
];
const COOLING_VALUES = PROPERTY_COOLING_OPTIONS.map((item) => item.value) as [
  PropertyCoolingSystem,
  ...PropertyCoolingSystem[],
];
const HEATING_VALUES = PROPERTY_HEATING_OPTIONS.map((item) => item.value) as [
  PropertyHeatingSystem,
  ...PropertyHeatingSystem[],
];
const WALL_CLOSET_VALUES = PROPERTY_WALL_CLOSET_OPTIONS.map((item) => item.value) as [
  PropertyWallClosetType,
  ...PropertyWallClosetType[],
];

export const propertyInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3).max(180),
  transactionType: z.enum(["buy", "sell", "rent", "mortgage"]),
  propertyType: z.enum(["apartment", "villa", "office", "heritage", "land", "commercial"]),
  neighborhood: z.string().trim().min(2).max(80),
  address: z.string().trim().max(240).optional().default(""),
  areaM2: z.number().int().min(0).max(100000).nullable().optional(),
  bedrooms: z.number().int().min(0).max(30).nullable().optional(),
  bathrooms: z.number().int().min(0).max(30).nullable().optional(),
  floor: z.number().int().min(-60).max(200).nullable().optional(),
  floorLabel: z.literal("suite").nullable().optional().default(null),
  orientation: z.enum(["north","south","east","west","northeast","northwest","southeast","southwest","two_fronts","three_fronts","four_fronts","other"]).nullable().optional().default(null),
  totalFloors: z.number().int().min(0).max(200).nullable().optional(),
  builtYear: z.number().int().min(1200).max(2500).nullable().optional(),
  parking: z.boolean().default(false),
  elevator: z.boolean().default(false),
  storage: z.boolean().default(false),
  painted: z.boolean().default(false),
  wallpaper: z.boolean().default(false),
  convertible: z.boolean().default(false),
  cabinetType: z.enum(CABINET_VALUES).nullable().optional().default(null),
  flooringType: z.enum(FLOORING_VALUES).nullable().optional().default(null),
  coolingSystem: z.enum(COOLING_VALUES).nullable().optional().default(null),
  heatingSystem: z.enum(HEATING_VALUES).nullable().optional().default(null),
  wallClosetType: z.enum(WALL_CLOSET_VALUES).nullable().optional().default(null),
  otherAmenities: z.array(z.string().trim().min(1).max(80)).max(80).default([]),
  price: nullableMoneyField,
  deposit: nullableMoneyField,
  rent: nullableMoneyField,
  description: z.string().trim().min(10).max(5000),
  features: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  images: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(2048)
        .refine(isAllowedMediaRef, { message: "نشانی رسانه نامعتبر است." }),
    )
    .max(MAX_PROPERTY_MEDIA)
    .default([]),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().min(8).max(30),
  ownerName: z.string().trim().max(100).optional().default(""),
  ownerPhone: z.string().trim().max(30).optional().default(""),
  ownerInfo: z.string().trim().max(2000).optional().default(""),
  internalPriority: z.enum(["low","normal","high","urgent"]).default("normal"),
  internalNote: z.string().trim().max(3000).default(""),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  availabilityStatus: z.enum(["available","reserved","sold","rented","unavailable"]).default("available"),
  featured: z.boolean().default(false),
  featuredUntil: z.string().trim().max(80).nullable().optional().default(null),
  latitude: z.number().finite().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().finite().min(-180).max(180).nullable().optional().default(null),
  virtualTourUrl: z.string().trim().max(2048).refine(
    (value) => !value || /^https:\/\//i.test(value),
    { message: "لینک تور مجازی باید با https شروع شود." },
  ).default(""),
  floorPlanUrl: z.string().trim().max(2048).refine(
    (value) => !value || /^https:\/\//i.test(value) || isAllowedMediaRef(value),
    { message: "نشانی پلان معتبر نیست." },
  ).default(""),
});

const budgetMatchSchema = z
  .object({
    depositBudget: z.number().int().min(0).max(999999999999999),
    rentBudget: z.number().int().min(0).max(999999999999999),
    propertyType: z
      .enum(["apartment", "villa", "office", "heritage", "land", "commercial"])
      .optional(),
    neighborhood: z.string().trim().max(80).optional(),
    bedrooms: z.number().int().min(1).max(30).optional(),
    limit: z.number().int().min(1).max(24).optional().default(12),
  })
  .refine((value) => value.depositBudget > 0 || value.rentBudget > 0, {
    message: "حداقل یکی از مبالغ بودجه باید بیشتر از صفر باشد.",
  });

const adminKeySchema = z.object({});

const idSchema = z.object({
  id: z.string().min(1),
});

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "property";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isFeaturedActive(property: { featured: boolean; featuredUntil?: string | null }) {
  return property.featured && (!property.featuredUntil || new Date(property.featuredUntil).getTime() >= Date.now());
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function roundPublicCoordinate(value: number | null): number | null {
  return value == null ? null : Math.round(value * 1000) / 1000;
}

function mapProperty(row: Record<string, unknown>, options: { admin?: boolean } = {}): Property {
  const isAdmin = options.admin === true;
  const latitude = numberOrNull(row.latitude);
  const longitude = numberOrNull(row.longitude);

  return {
    id: String(row.id),
    slug: String(row.slug),
    status: row.status as PropertyStatus,
    availabilityStatus:
      row.availability_status === "reserved" || row.availability_status === "sold" || row.availability_status === "rented" || row.availability_status === "unavailable"
        ? row.availability_status
        : "available",
    featured: Boolean(row.featured),
    featuredUntil: row.featured_until ? new Date(String(row.featured_until)).toISOString() : null,
    title: String(row.title),
    transactionType: row.transaction_type as PropertyTransaction,
    propertyType: row.property_type as PropertyType,
    city: String(row.city),
    neighborhood: String(row.neighborhood),
    address: isAdmin ? (row.address ? String(row.address) : null) : null,
    areaM2: numberOrNull(row.area_m2),
    bedrooms: numberOrNull(row.bedrooms),
    bathrooms: numberOrNull(row.bathrooms),
    floor: numberOrNull(row.floor),
    floorLabel: row.floor_label === "suite" ? "suite" : null,
    orientation: (row.orientation as PropertyOrientation | null) ?? null,
    totalFloors: numberOrNull(row.total_floors),
    builtYear: numberOrNull(row.built_year),
    parking: Boolean(row.parking),
    elevator: Boolean(row.elevator),
    storage: Boolean(row.storage),
    painted: Boolean(row.painted),
    wallpaper: Boolean(row.wallpaper),
    convertible: Boolean(row.convertible),
    cabinetType: (row.cabinet_type as PropertyCabinetType | null) ?? null,
    flooringType: (row.flooring_type as PropertyFlooringType | null) ?? null,
    coolingSystem: (row.cooling_system as PropertyCoolingSystem | null) ?? null,
    heatingSystem: (row.heating_system as PropertyHeatingSystem | null) ?? null,
    wallClosetType: (row.wall_closet_type as PropertyWallClosetType | null) ?? null,
    otherAmenities: parseJsonArray(row.other_amenities) as PropertyOtherAmenity[],
    price: row.price == null ? null : String(row.price),
    deposit: row.deposit == null ? null : String(row.deposit),
    rent: row.rent == null ? null : String(row.rent),
    description: String(row.description),
    features: parseJsonArray(row.features),
    images: parseJsonArray(row.images),
    contactName: String(row.contact_name),
    contactPhone: String(row.contact_phone),
    ...(isAdmin ? {
      ownerName: row.owner_name == null ? "" : String(row.owner_name),
      ownerPhone: row.owner_phone == null ? "" : String(row.owner_phone),
      ownerInfo: row.owner_info == null ? "" : String(row.owner_info),
      internalPriority:
        row.internal_priority === "low" || row.internal_priority === "high" || row.internal_priority === "urgent"
          ? row.internal_priority
          : "normal",
      internalNote: row.internal_note == null ? "" : String(row.internal_note),
    } : {}),
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
    scheduledPublishAt: row.publish_at ? new Date(String(row.publish_at)).toISOString() : null,
    scheduledUnpublishAt: row.unpublish_at ? new Date(String(row.unpublish_at)).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : null,
    deletedFromStatus:
      row.deleted_from_status === "draft" || row.deleted_from_status === "published" || row.deleted_from_status === "archived"
        ? row.deleted_from_status
        : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    virtualTourUrl:
      typeof row.virtual_tour_url === "string" && /^https:\/\//i.test(row.virtual_tour_url.trim())
        ? row.virtual_tour_url.trim()
        : "",
    floorPlanUrl:
      typeof row.floor_plan_url === "string" ? row.floor_plan_url.trim() : "",
    latitude: isAdmin ? latitude : roundPublicCoordinate(latitude),
    longitude: isAdmin ? longitude : roundPublicCoordinate(longitude),
    priceDropPercent: numberOrNull(row.price_drop_percent),
    lastVerifiedAt: row.last_verified_at ? new Date(String(row.last_verified_at)).toISOString() : null,
    lastVerifiedBy: row.last_verified_by ? String(row.last_verified_by) : null,
  };
}

const LIST_COLUMNS = `
  id, slug, status, availability_status, featured, featured_until, title, transaction_type, property_type, city,
  neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
  built_year, parking, elevator, storage, painted, wallpaper, convertible, cabinet_type, flooring_type, cooling_system,
  heating_system, wall_closet_type, other_amenities, price, deposit, rent,
  features, images, contact_name, contact_phone, published_at, created_at, updated_at,
  latitude, longitude, price_drop_percent, virtual_tour_url, floor_plan_url, floor_label, orientation,
  owner_name, owner_phone, owner_info, internal_priority, internal_note,
  publish_at, unpublish_at, deleted_at, deleted_from_status,
  last_verified_at, last_verified_by,
  left(description, 280) as description
`;

const CARD_COLUMNS = `
  id, slug, status, availability_status, featured, featured_until, title, transaction_type, property_type,
  neighborhood, area_m2, bedrooms, parking, elevator, price, deposit, rent,
  nullif(images->>0, '') as image,
  price_drop_percent,
  latitude, longitude, published_at
`;

function mapPropertyCard(row: Record<string, unknown>): PropertyCardData {
  return {
    id: String(row.id),
    slug: String(row.slug),
    status: row.status as PropertyStatus,
    availabilityStatus:
      row.availability_status === "reserved" || row.availability_status === "sold" || row.availability_status === "rented" || row.availability_status === "unavailable"
        ? row.availability_status
        : "available",
    featured: Boolean(row.featured),
    featuredUntil: row.featured_until ? new Date(String(row.featured_until)).toISOString() : null,
    title: String(row.title),
    transactionType: row.transaction_type as PropertyTransaction,
    propertyType: row.property_type as PropertyType,
    neighborhood: String(row.neighborhood),
    areaM2: numberOrNull(row.area_m2),
    bedrooms: numberOrNull(row.bedrooms),
    parking: Boolean(row.parking),
    elevator: Boolean(row.elevator),
    price: row.price == null ? null : String(row.price),
    deposit: row.deposit == null ? null : String(row.deposit),
    rent: row.rent == null ? null : String(row.rent),
    image: row.image ? String(row.image) : null,
    priceDropPercent: numberOrNull(row.price_drop_percent),
    latitude: roundPublicCoordinate(numberOrNull(row.latitude)),
    longitude: roundPublicCoordinate(numberOrNull(row.longitude)),
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
  };
}

const DETAIL_COLUMNS = `
  id, slug, status, availability_status, featured, featured_until, title, transaction_type, property_type, city,
  neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
  built_year, parking, elevator, storage, painted, wallpaper, convertible, cabinet_type, flooring_type, cooling_system,
  heating_system, wall_closet_type, other_amenities, price, deposit, rent, description,
  features, images, contact_name, contact_phone, published_at, created_at, updated_at,
  latitude, longitude, price_drop_percent, virtual_tour_url, floor_plan_url, floor_label, orientation,
  owner_name, owner_phone, owner_info, internal_priority, internal_note,
  publish_at, unpublish_at, deleted_at, deleted_from_status,
  last_verified_at, last_verified_by
`;

function publicFilterParams(data: z.infer<typeof publicFiltersSchema>) {
  const neighborhood = data.neighborhood?.trim() || null;
  const exactNeighborhood = Boolean(
    neighborhood && neighborhood.length >= 2 && !neighborhood.includes("%"),
  );
  return [
    data.transactionType ?? null,
    data.propertyType ?? null,
    neighborhood,
    data.featuredOnly ?? false,
    exactNeighborhood,
    data.search?.trim() || null,
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
    data.featureSearch?.trim() || null,
    data.hasImagesOnly ?? false,
    data.hasLocationOnly ?? false,
    data.floorType ?? null,
    data.orientation ?? null,
    data.convertibleOnly ?? false,
    data.offset ?? 0,
  ];
}

const PUBLIC_PUBLICATION_WHERE =
  "(deleted_at is null) and (" +
  "status = 'published' or (status = 'draft' and publish_at is not null and publish_at <= current_timestamp)" +
  ") and (unpublish_at is null or unpublish_at > current_timestamp)";

const PRICE_EXPR =
  "case when transaction_type = 'rent' then coalesce(rent, deposit) " +
  "when transaction_type = 'mortgage' then deposit else price end";

function publicPropertyWhereSql() {
  return [
    PUBLIC_PUBLICATION_WHERE,
    "and ($1::text is null or transaction_type = $1)",
    "and ($2::text is null or property_type = $2)",
    "and ($3::text is null or ($5::boolean is true and neighborhood = $3) or ($5::boolean is false and neighborhood ilike '%' || $3 || '%'))",
    "and ($4::boolean is false or (featured = true and (featured_until is null or featured_until >= current_timestamp)))",
    "and ($6::text is null or title ilike '%' || $6 || '%' or neighborhood ilike '%' || $6 || '%' or address ilike '%' || $6 || '%')",
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
    "and ($22::text[] is null or cardinality($22::text[]) = 0 or exists (select 1 from unnest($22::text[]) as selected(value) where " +
      "(selected.value like 'cabinet:%' and cabinet_type = substring(selected.value from 9)) or " +
      "(selected.value like 'flooring:%' and flooring_type = substring(selected.value from 10)) or " +
      "(selected.value like 'cooling:%' and cooling_system = substring(selected.value from 9)) or " +
      "(selected.value like 'heating:%' and heating_system = substring(selected.value from 9)) or " +
      "(selected.value like 'closet:%' and wall_closet_type = substring(selected.value from 8)) or " +
      "coalesce(other_amenities, '[]'::jsonb) ? selected.value))",
    "and ($23::text is null or exists (select 1 from jsonb_array_elements_text(coalesce(features, '[]'::jsonb)) as feature(value) where feature.value ilike '%' || $23 || '%'))",
    "and ($24::boolean is false or (jsonb_typeof(coalesce(images, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(images, '[]'::jsonb)) > 0))",
    "and ($25::boolean is false or (latitude is not null and longitude is not null))",
    "and ($26::text is null or floor_label = $26)",
    "and ($27::text is null or orientation = $27)",
    "and ($28::boolean is false or convertible = true)",
  ].join(" ");
}

export const listPublishedPropertyCards = createServerFn({ method: "GET" })
  .validator(publicFiltersSchema)
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    setResponseHeader("cache-control", "public, max-age=15, s-maxage=60, stale-while-revalidate=300");
    return cachedPropertyRead(
      `property-cards:${JSON.stringify(data)}`,
      15_000,
      async () => {
        const sql = await getSql();
        const params = publicFilterParams(data);
        const rows = await sql.query<Record<string, unknown>>(
          [
            "select " + CARD_COLUMNS,
            "from properties where " + publicPropertyWhereSql(),
            "order by case when $30::text = 'newest' then case when featured and (featured_until is null or featured_until >= current_timestamp) then 0 else 1 end else 0 end,",
            "case when $30::text = 'price_asc' then " + PRICE_EXPR + " end asc nulls last,",
            "case when $30::text = 'price_desc' then " + PRICE_EXPR + " end desc nulls last,",
            "case when $30::text = 'area_asc' then area_m2 end asc nulls last,",
            "case when $30::text = 'area_desc' then area_m2 end desc nulls last,",
            "published_at desc nulls last, created_at desc",
            "limit 48 offset $29",
          ].join(" "),
          [...params, data.sort],
        );
        return rows.map(mapPropertyCard);
      },
    );
  });

export const listPublishedProperties = createServerFn({ method: "GET" })
  .validator(publicFiltersSchema)
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const params = publicFilterParams(data);
    const rows = await sql.query<Record<string, unknown>>(
      [
        "select " + LIST_COLUMNS,
        "from properties where " + publicPropertyWhereSql(),
        "order by case when $30::text = 'newest' then case when featured then 0 else 1 end else 0 end,",
        "case when $30::text = 'price_asc' then " + PRICE_EXPR + " end asc nulls last,",
        "case when $30::text = 'price_desc' then " + PRICE_EXPR + " end desc nulls last,",
        "case when $30::text = 'area_asc' then area_m2 end asc nulls last,",
        "case when $30::text = 'area_desc' then area_m2 end desc nulls last,",
        "published_at desc nulls last, created_at desc",
        "limit 48 offset $29",
      ].join(" "),
      [...params, data.sort],
    );
    return rows.map((row) => mapProperty(row));
  });

export const countPublishedProperties = createServerFn({ method: "GET" })
  .validator(publicFiltersSchema)
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return 0;
    setResponseHeader("cache-control", "public, max-age=15, s-maxage=60, stale-while-revalidate=300");
    return cachedPropertyRead(
      `property-count:${JSON.stringify(data)}`,
      20_000,
      async () => {
        const sql = await getSql();
        const params = publicFilterParams(data).slice(0, 28);
        const rows = await sql.query<{ count: number }>(
          "select count(*)::int as count from properties where " + publicPropertyWhereSql(),
          params,
        );
        return Number(rows[0]?.count) || 0;
      },
    );
  });

export const listPublishedPropertiesByContact = createServerFn({ method: "GET" })
  .validator(z.object({ phone: z.string().trim().min(8).max(30) }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS}
       from properties
       where ${PUBLIC_PUBLICATION_WHERE} and contact_phone = $1
       order by featured desc, published_at desc nulls last, created_at desc
       limit 48`,
      [data.phone],
    );
    return rows.map((row) => mapProperty(row));
  });

export const getPublishedPropertyByFileCode = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().trim().regex(/^[a-f0-9]{6}$/i) }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return null;
    const code = data.code.trim().toLowerCase();
    setResponseHeader("cache-control", "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
    return cachedPropertyRead(
      `property-code:${code}`,
      30_000,
      async () => {
        const sql = await getSql();
        const rows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE}
             and lower(right(replace(id::text, '-', ''), 6)) = $1
           order by published_at desc nulls last, created_at desc
           limit 1`,
          [code],
        );
        return rows[0] ? mapProperty(rows[0]) : null;
      },
    );
  });

export const getPublishedPropertyById = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return null;
    const id = data.id.trim();
    setResponseHeader("cache-control", "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
    return cachedPropertyRead(
      `property-id:${id}`,
      60_000,
      async () => {
        const sql = await getSql();

        const exactRows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE} and id::text = $1
           limit 1`,
          [id],
        );
        if (exactRows[0]) return mapProperty(exactRows[0]);

        // Legacy /file/:id links may contain the visible 8-hex fragment.
        // Keep this fallback isolated from the normal UUID lookup so the common
        // detail path uses the primary-key index.
        if (!/^[0-9a-f]{8}$/i.test(id)) return null;

        const fragment = id.toLowerCase();
        const fragmentRows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE}
             and (
               lower(left(id::text, 8)) = $1
               or lower(right(id::text, 8)) = $1
             )
           order by case when lower(left(id::text, 8)) = $1 then 0 else 1 end
           limit 1`,
          [fragment],
        );
        return fragmentRows[0] ? mapProperty(fragmentRows[0]) : null;
      },
    );
  });

export const getPublishedProperty = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(220) }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return null;
    setResponseHeader("cache-control", "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
    return cachedPropertyRead(
      `property-slug:${data.slug}`,
      60_000,
      async () => {
        const sql = await getSql();
        const decodedCandidates = decodeSlugCandidates(data.slug);

        // Canonical/encoded slugs hit the unique slug index first.
        const slugRows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE} and slug = any($1::text[])
           order by case when slug = $2 then 0 else 1 end
           limit 1`,
          [decodedCandidates, decodedCandidates[0]],
        );
        if (slugRows[0]) return mapProperty(slugRows[0]);

        // Old links sometimes contain a full id alongside a title.
        const idRows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE} and id::text = any($1::text[])
           limit 1`,
          [decodedCandidates],
        );
        if (idRows[0]) return mapProperty(idRows[0]);

        // The expensive function-on-id fallback is now only used for legacy
        // 8-hex fragments, and the migration provides matching functional indexes.
        const legacyIdPrefixes = legacyIdFragments(decodedCandidates);
        if (!legacyIdPrefixes.length) return null;

        const fragmentRows = await sql.query<Record<string, unknown>>(
          `select ${DETAIL_COLUMNS}
           from properties
           where ${PUBLIC_PUBLICATION_WHERE}
             and (
               lower(left(id::text, 8)) = any($1::text[])
               or lower(right(id::text, 8)) = any($1::text[])
             )
           order by case when lower(left(id::text, 8)) = any($1::text[]) then 0 else 1 end
           limit 1`,
          [legacyIdPrefixes],
        );
        return fragmentRows[0] ? mapProperty(fragmentRows[0]) : null;
      },
    );
  });

export type PropertyPriceHistoryItem = {
  changedAt: string;
  previousPrice: string | null;
  newPrice: string | null;
  previousDeposit: string | null;
  newDeposit: string | null;
  previousRent: string | null;
  newRent: string | null;
};

export const getPublishedPropertyPriceHistory = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(220) }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    setResponseHeader("cache-control", "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
    const sql = await getSql();
    const propertyRows = await sql.query<{ id: string }>(`select id::text as id from properties where ${PUBLIC_PUBLICATION_WHERE} and slug=$1 limit 1`, [data.slug]);
    const propertyId = propertyRows[0]?.id;
    if (!propertyId) return [];

    const rows = await sql.query<Record<string, unknown>>(      "select changed_at, before_state->>'price' as previous_price, after_state->>'price' as new_price, " +
      "before_state->>'deposit' as previous_deposit, after_state->>'deposit' as new_deposit, " +
      "before_state->>'rent' as previous_rent, after_state->>'rent' as new_rent " +
      "from property_change_history " +
      "where property_id=$1 and action='updated' and (" +
      "before_state->>'price' is distinct from after_state->>'price' " +
      "or before_state->>'deposit' is distinct from after_state->>'deposit' " +
      "or before_state->>'rent' is distinct from after_state->>'rent') " +
      "order by changed_at desc limit 12"
      , [propertyId],
    );

    return rows.map((row) => ({
      changedAt: new Date(String(row.changed_at)).toISOString(),
      previousPrice: row.previous_price == null ? null : String(row.previous_price),
      newPrice: row.new_price == null ? null : String(row.new_price),
      previousDeposit: row.previous_deposit == null ? null : String(row.previous_deposit),
      newDeposit: row.new_deposit == null ? null : String(row.new_deposit),
      previousRent: row.previous_rent == null ? null : String(row.previous_rent),
      newRent: row.new_rent == null ? null : String(row.new_rent),
    }));
  });

export const listPublishedPropertyCardsBySlugs = createServerFn({ method: "GET" })
  .validator(z.object({
    slugs: z.array(z.string().trim().min(1).max(220)).max(8),
  }))
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured" || data.slugs.length === 0) return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${CARD_COLUMNS}
       from properties
       where ${PUBLIC_PUBLICATION_WHERE}
         and slug = any($1::text[])
       order by featured desc, published_at desc nulls last, created_at desc`,
      [data.slugs],
    );
    const bySlug = new Map(rows.map((row) => [String(row.slug), mapPropertyCard(row)]));
    return data.slugs.map((slug) => bySlug.get(slug)).filter((property): property is PropertyCardData => Boolean(property));
  });

export const listPublishedPropertiesBySlugs = createServerFn({ method: "GET" })
  .validator(
    z.object({
      slugs: z.array(z.string().trim().min(1).max(220)).max(100),
    }),
  )
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured" || data.slugs.length === 0) return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS}
       from properties
       where ${PUBLIC_PUBLICATION_WHERE}
         and slug = any($1::text[])
       order by featured desc, published_at desc nulls last, created_at desc`,
      [data.slugs],
    );

    const bySlug = new Map(rows.map((row) => [String(row.slug), mapProperty(row)]));
    return data.slugs
      .map((slug) => bySlug.get(slug))
      .filter((property): property is Property => Boolean(property));
  });

export const listRelatedProperties = createServerFn({ method: "GET" })
  .validator(
    z.object({
      slug: z.string().min(1),
      neighborhood: z.string().trim().min(1).max(80),
      propertyType: z.enum([
        "apartment",
        "villa",
        "office",
        "heritage",
        "land",
        "commercial",
      ]),
      limit: z.number().int().min(1).max(12).optional().default(6),
    }),
  )
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    setResponseHeader("cache-control", "public, max-age=20, s-maxage=90, stale-while-revalidate=300");
    return cachedPropertyRead(
      `property-related:${JSON.stringify(data)}`,
      30_000,
      async () => {
      const sql = await getSql();
      const rows = await sql.query<Record<string, unknown>>(
        `select ${LIST_COLUMNS}
         from properties
         where ${PUBLIC_PUBLICATION_WHERE}
           and slug <> $1
           and (
             neighborhood = $2
             or property_type = $3
           )
         order by
           case when neighborhood = $2 then 0 else 1 end,
           case when featured and (featured_until is null or featured_until >= current_timestamp) then 0 else 1 end,
           published_at desc nulls last,
           created_at desc
         limit $4`,
        [data.slug, data.neighborhood, data.propertyType, data.limit],
      );
      return rows.map((row) => mapProperty(row));
      },
    );
  });

export type PropertyBudgetMatch = BudgetMatchDetails & {
  property: Property;
};

export const matchPublishedPropertiesByBudget = createServerFn({ method: "GET" })
  .validator(budgetMatchSchema)
  .handler(async ({ data }) => {
    if (dbSource === "unconfigured") return [];
    setResponseHeader("cache-control", "public, max-age=10, s-maxage=30, stale-while-revalidate=120");
    return cachedPropertyRead(
      `property-budget:${JSON.stringify(data)}`,
      10_000,
      async () => {

      const sql = await getSql();
      const rate = DEFAULT_MATCH_RAHN_RATE;
      const budgetTotal = data.depositBudget + (data.rentBudget * 1_000_000) / rate;
      const totalExpr =
        "(coalesce(deposit, 0)::numeric + (coalesce(rent, 0)::numeric * 1000000 / $1::numeric))";

      const rows = await sql.query<Record<string, unknown>>(
        [
          "select " + DETAIL_COLUMNS,
          "from properties",
          `where ${PUBLIC_PUBLICATION_WHERE}`,
          "and transaction_type in ('rent', 'mortgage')",
          "and (coalesce(deposit, 0) > 0 or coalesce(rent, 0) > 0)",
          "and ($5::text is null or property_type = $5)",
          "and ($6::text is null or neighborhood = $6 or neighborhood ilike '%' || $6 || '%')",
          "and ($7::int is null or bedrooms >= $7)",
          "and " + totalExpr + " <= $4::numeric * 1.15",
          "order by",
          "case",
          "  when coalesce(deposit, 0) <= $2 and coalesce(rent, 0) <= $3 then 0",
          "  when " + totalExpr + " <= $4::numeric then 1",
          "  else 2",
          "end asc,",
          "case when featured and (featured_until is null or featured_until >= current_timestamp) then 0 else 1 end asc,",
          "abs(" + totalExpr + " - $4::numeric) asc,",
          "published_at desc nulls last, created_at desc",
          "limit greatest($8, 36)",
        ].join(" "),
        [
          rate,
          data.depositBudget,
          data.rentBudget,
          budgetTotal,
          data.propertyType ?? null,
          data.neighborhood?.trim() || null,
          data.bedrooms ?? null,
          data.limit,
        ],
      );

      const budget: BudgetInput = {
        depositBudget: data.depositBudget,
        rentBudget: data.rentBudget,
      };

      return rows
        .map((row) => mapProperty(row))
        .map((property) => {
          const details = calculateBudgetMatch(property, budget, rate);
          return details ? { property, ...details } : null;
        })
        .filter((match): match is PropertyBudgetMatch => Boolean(match))
        .sort((a, b) => {
          const tierOrder = { within: 0, convertible: 1, near: 2 } as const;
          return tierOrder[a.tier] - tierOrder[b.tier]
            || b.score - a.score
            || a.gapEquivalent - b.gapEquivalent;
        })
        .slice(0, data.limit);
      },
    );
  });

const adminListSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).max(100000).optional().default(0),
  status: z.enum(["draft", "published", "archived"]).optional(),
  transactionType: z.enum(["buy", "sell", "rent", "mortgage"]).optional(),
  propertyType: z.enum(["apartment", "villa", "office", "heritage", "land", "commercial"]).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  featuredOnly: z.boolean().optional().default(false),
  search: z.string().trim().max(80).optional(),
  /** Tri-state: true = only rows with media, false = only rows without. */
  hasImages: z.boolean().optional(),
  minPrice: z.number().int().min(0).max(999999999999999).optional(),
  maxPrice: z.number().int().min(0).max(999999999999999).optional(),
  minArea: z.number().int().min(0).max(100000).optional(),
  maxArea: z.number().int().min(0).max(100000).optional(),
  minBedrooms: z.number().int().min(0).max(30).optional(),
  sort: z
    .enum([
      "newest",
      "oldest",
      "updated",
      "title",
      "price_asc",
      "price_desc",
      "area_desc",
    ])
    .optional()
    .default("newest"),
});

const adminBulkSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(160)).min(1).max(2000),
});

const adminBulkStatusSchema = adminBulkSchema.extend({
  status: z.enum(["draft", "published", "archived"]),
});

const adminBulkFeaturedSchema = adminBulkSchema.extend({
  featured: z.boolean(),
});

const adminBulkConsultantSchema = adminBulkSchema.extend({
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().min(8).max(30),
});

function adminFilterParams(data: z.infer<typeof adminListSchema>) {
  return [
    data.status ?? null,
    data.transactionType ?? null,
    data.propertyType ?? null,
    data.neighborhood?.trim() || null,
    data.featuredOnly ?? false,
    data.search?.trim() || null,
    data.hasImages ?? null,
    data.minPrice ?? null,
    data.maxPrice ?? null,
    data.minArea ?? null,
    data.maxArea ?? null,
    data.minBedrooms ?? null,
  ];
}

const ADMIN_PRICE_EXPR =
  "case when transaction_type = 'rent' then coalesce(rent, deposit) " +
  "when transaction_type = 'mortgage' then deposit else price end";

function adminPropertyWhereSql() {
  return [
    "deleted_at is null",
    "and ($1::text is null or status = $1)",
    "and ($2::text is null or transaction_type = $2)",
    "and ($3::text is null or property_type = $3)",
    "and ($4::text is null or neighborhood = $4)",
    "and ($5::boolean is false or (featured = true and (featured_until is null or featured_until >= current_timestamp)))",
    "and ($6::text is null or title ilike '%' || $6 || '%' or neighborhood ilike '%' || $6 || '%' or coalesce(address, '') ilike '%' || $6 || '%' or contact_name ilike '%' || $6 || '%' or contact_phone ilike '%' || $6 || '%' or owner_name ilike '%' || $6 || '%' or owner_phone ilike '%' || $6 || '%' or owner_info ilike '%' || $6 || '%' or id ilike '%' || $6 || '%')",
    // Media is a jsonb array, so `jsonb_array_length` needs an empty-array
    // guard — a null column would otherwise raise instead of returning 0.
    "and ($7::boolean is null or (coalesce(jsonb_array_length(images), 0) > 0) = $7)",
    `and ($8::bigint is null or ${ADMIN_PRICE_EXPR} >= $8)`,
    `and ($9::bigint is null or ${ADMIN_PRICE_EXPR} <= $9)`,
    "and ($10::int is null or area_m2 >= $10)",
    "and ($11::int is null or area_m2 <= $11)",
    "and ($12::int is null or bedrooms >= $12)",
  ].join(" ");
}

const ADMIN_SORT_CLAUSE = `
  order by
    case when $13::text = 'title' then title end asc nulls last,
    case when $13::text = 'price_desc' then ${ADMIN_PRICE_EXPR} end desc nulls last,
    case when $13::text = 'price_asc' then ${ADMIN_PRICE_EXPR} end asc nulls last,
    case when $13::text = 'area_desc' then area_m2 end desc nulls last,
    case when $13::text = 'oldest' then created_at end asc nulls last,
    case when $13::text = 'updated' then updated_at end desc nulls last,
    case when $13::text = 'newest' then created_at end desc nulls last,
    updated_at desc,
    created_at desc`;

export const listAdminProperties = createServerFn({ method: "POST" })
  .validator(adminListSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const filters = adminFilterParams(data);
    const rows = await sql.query<Record<string, unknown>>(
      `select ${LIST_COLUMNS}
       from properties
       where ${adminPropertyWhereSql()}
       ${ADMIN_SORT_CLAUSE}
       limit $14 offset $15`,
      [...filters, data.sort, data.limit, data.offset],
    );
    return rows.map((row) => mapProperty(row, { admin: true }));
  });

export const countAdminProperties = createServerFn({ method: "POST" })
  .validator(adminKeySchema)
  .handler(async () => {
    await requireAdminPermission("reports.view");
    if (dbSource === "unconfigured") {
      return { total: 0, published: 0, draft: 0, archived: 0, featured: 0 };
    }
    const sql = await getSql();
    const rows = await sql.query<{
      total: number;
      published: number;
      draft: number;
      archived: number;
      featured: number;
    }>(
      `select
         count(*) filter (where deleted_at is null)::int as total,
         count(*) filter (where status = 'published' and deleted_at is null)::int as published,
         count(*) filter (where status = 'draft' and deleted_at is null)::int as draft,
         count(*) filter (where status = 'archived' and deleted_at is null)::int as archived,
         count(*) filter (where featured = true and deleted_at is null and (featured_until is null or featured_until >= current_timestamp))::int as featured
       from properties`,
    );
    const row = rows[0];
    return {
      total: Number(row?.total) || 0,
      published: Number(row?.published) || 0,
      draft: Number(row?.draft) || 0,
      archived: Number(row?.archived) || 0,
      featured: Number(row?.featured) || 0,
    };
  });

export const countFilteredAdminProperties = createServerFn({ method: "POST" })
  .validator(adminListSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") return 0;
    const sql = await getSql();
    const rows = await sql.query<{ count: number }>(
      `select count(*)::int as count
       from properties
       where ${adminPropertyWhereSql()}`,
      adminFilterParams(data),
    );
    return Number(rows[0]?.count) || 0;
  });

export const bulkUpdatePropertyStatus = createServerFn({ method: "POST" })
  .validator(adminBulkStatusSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (data.status === "published") {
      await requireAdminPermission("property.publish");
    }
    const sql = await getSql();

    const beforeRows = await sql.query<Record<string, unknown>>(
      `select id, title, status, featured, price, deposit, rent, contact_name, contact_phone,
              owner_name, owner_phone, owner_info, neighborhood, transaction_type, description,
              area_m2, features, images, latitude, longitude
       from properties
       where id = any($1::text[])
         and deleted_at is null`,
      [data.ids],
    );

    if (data.status === "published") {
      const blocked = beforeRows
        .map((row) => {
          const readiness = getPublishReadiness({
            transactionType: String(row.transaction_type ?? "sell") as "sell" | "buy" | "rent" | "mortgage",
            title: String(row.title ?? ""),
            neighborhood: String(row.neighborhood ?? ""),
            description: String(row.description ?? ""),
            contactName: String(row.contact_name ?? ""),
            contactPhone: String(row.contact_phone ?? ""),
            price: row.price == null ? "" : String(row.price),
            deposit: row.deposit == null ? "" : String(row.deposit),
            rent: row.rent == null ? "" : String(row.rent),
            imageCount: parseJsonArray(row.images).length,
            areaM2: row.area_m2 == null ? "" : String(row.area_m2),
            features: parseJsonArray(row.features).join("\n"),
            latitude: numberOrNull(row.latitude),
            longitude: numberOrNull(row.longitude),
          });
          return readiness.ready ? null : { title: String(row.title ?? "فایل"), blockers: readiness.blockers };
        })
        .filter((item): item is { title: string; blockers: string[] } => Boolean(item));

      if (blocked.length) {
        const detail = blocked.slice(0, 5).map((item) => item.title + ": " + item.blockers.join(" ")).join(" | ");
        throw new Error("انتشار گروهی متوقف شد. " + detail);
      }
    }

    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set status = $1,
           publish_at = case when $1 = 'draft' then publish_at else null end,
           unpublish_at = case when $1 = 'published' then unpublish_at else null end,
           published_at = case
             when $1 = 'published' then coalesce(published_at, current_timestamp)
             else null
           end,
           updated_at = current_timestamp
       where id = any($2::text[])
         and deleted_at is null
       returning id, title, status, featured, price, deposit, rent, contact_name, contact_phone, owner_name, owner_phone, owner_info`,
      [data.status, data.ids],
    );

    if (rows.length) {
      const beforePayload = JSON.stringify(
        beforeRows.map((row) => ({
          id: String(row.id),
          before_state: {
            title: row.title == null ? null : String(row.title),
            status: row.status == null ? null : String(row.status),
            featured: Boolean(row.featured),
            price: row.price == null ? null : String(row.price),
            deposit: row.deposit == null ? null : String(row.deposit),
            rent: row.rent == null ? null : String(row.rent),
            contactName: row.contact_name == null ? null : String(row.contact_name),
            contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
            ownerName: row.owner_name == null ? null : String(row.owner_name),
            ownerPhone: row.owner_phone == null ? null : String(row.owner_phone),
            ownerInfo: row.owner_info == null ? null : String(row.owner_info),
          },
        })),
      );
      await sql.query(
        `with before as (
           select *
           from jsonb_to_recordset($1::jsonb)
             as b(id text, before_state jsonb)
         )
         insert into property_change_history (property_id, action, before_state, after_state)
         select
           p.id,
           'updated',
           before.before_state,
           jsonb_build_object(
             'title', p.title,
             'status', p.status,
             'availabilityStatus', p.availability_status,
             'featured', p.featured,
             'price', p.price,
             'deposit', p.deposit,
             'rent', p.rent,
             'contactName', p.contact_name,
             'contactPhone', p.contact_phone,
             'ownerName', p.owner_name,
             'ownerPhone', p.owner_phone,
             'ownerInfo', p.owner_info
           )
         from properties p
         join before on before.id = p.id`,
        [beforePayload],
      );
    }
    await writeAdminAuditLog({
      action: "property.bulk_status",
      entityType: "property",
      metadata: { ids: data.ids, count: rows.length, status: data.status },
    });
    clearPropertyReadCache();
    return { success: true, updated: rows.length };
  });

export const bulkSetPropertyFeatured = createServerFn({ method: "POST" })
  .validator(adminBulkFeaturedSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    const sql = await getSql();

    const beforeRows = await sql.query<Record<string, unknown>>(
      `select id, title, status, featured, price, deposit, rent, contact_name, contact_phone
       from properties
       where id = any($1::text[])`,
      [data.ids],
    );

    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set featured = $1,
           featured_until = null,
           updated_at = current_timestamp
       where id = any($2::text[])
       returning id, title, status, featured, price, deposit, rent, contact_name, contact_phone`,
      [data.featured, data.ids],
    );

    if (rows.length) {
      const beforePayload = JSON.stringify(
        beforeRows.map((row) => ({
          id: String(row.id),
          before_state: {
            title: row.title == null ? null : String(row.title),
            status: row.status == null ? null : String(row.status),
            featured: Boolean(row.featured),
            price: row.price == null ? null : String(row.price),
            deposit: row.deposit == null ? null : String(row.deposit),
            rent: row.rent == null ? null : String(row.rent),
            contactName: row.contact_name == null ? null : String(row.contact_name),
            contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
          },
        })),
      );
      await sql.query(
        `with before as (
           select *
           from jsonb_to_recordset($1::jsonb)
             as b(id text, before_state jsonb)
         )
         insert into property_change_history (property_id, action, before_state, after_state)
         select
           p.id,
           'updated',
           before.before_state,
           jsonb_build_object(
             'title', p.title,
             'status', p.status,
             'availabilityStatus', p.availability_status,
             'featured', p.featured,
             'price', p.price,
             'deposit', p.deposit,
             'rent', p.rent,
             'contactName', p.contact_name,
             'contactPhone', p.contact_phone,
             'ownerName', p.owner_name,
             'ownerPhone', p.owner_phone,
             'ownerInfo', p.owner_info
           )
         from properties p
         join before on before.id = p.id`,
        [beforePayload],
      );
    }
    clearPropertyReadCache();
    return { success: true, updated: rows.length };
  });

export const bulkAssignPropertyConsultant = createServerFn({ method: "POST" })
  .validator(adminBulkConsultantSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    const sql = await getSql();

    const beforeRows = await sql.query<Record<string, unknown>>(
      `select id, contact_name, contact_phone
       from properties
       where id = any($1::text[])`,
      [data.ids],
    );

    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set contact_name = $1,
           contact_phone = $2,
           updated_at = current_timestamp
       where id = any($3::text[])
         and deleted_at is null
       returning id, contact_name, contact_phone`,
      [data.contactName, data.contactPhone, data.ids],
    );

    if (rows.length) {
      const beforePayload = JSON.stringify(
        beforeRows.map((row) => ({
          id: String(row.id),
          before_state: {
            contactName: row.contact_name == null ? null : String(row.contact_name),
            contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
          },
        })),
      );
      const afterById = new Map(
        rows.map((row) => [
          String(row.id),
          {
            contactName: row.contact_name == null ? null : String(row.contact_name),
            contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
          },
        ]),
      );
      const auditRows = beforeRows
        .map((row) => {
          const id = String(row.id);
          const after = afterById.get(id);
          if (!after) return null;
          return { id, before_state: JSON.parse(JSON.stringify(
            beforeRows.find((item) => String(item.id) === id)
              ? {
                  contactName: row.contact_name == null ? null : String(row.contact_name),
                  contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
                }
              : null,
          )), after_state: after };
        })
        .filter((row): row is { id: string; before_state: { contactName: string | null; contactPhone: string | null }; after_state: { contactName: string | null; contactPhone: string | null } } => Boolean(row));
      if (auditRows.length) {
        await sql.query(
          `with audit as (
             select *
             from jsonb_to_recordset($1::jsonb)
               as a(id text, before_state jsonb, after_state jsonb)
           )
           insert into property_change_history (property_id, action, before_state, after_state)
           select id, 'updated', before_state, after_state
           from audit`,
          [JSON.stringify(auditRows)],
        );
      }
    }

    clearPropertyReadCache();
    return { success: true, updated: rows.length };
  });

export const bulkDeleteProperties = createServerFn({ method: "POST" })
  .validator(adminBulkSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    const sql = await getSql();

    const existingRows = await sql.query<Record<string, unknown>>(
      `select id, title, status, featured, price, deposit, rent, contact_name, contact_phone,
              owner_name, owner_phone, owner_info, images
       from properties
       where id = any($1::text[])`,
      [data.ids],
    );

    const rows = await sql.query<{ id: string }>(
      `update properties
       set deleted_at = current_timestamp,
           deleted_from_status = status,
           status = 'archived',
           featured = false,
           featured_until = null,
           updated_at = current_timestamp
       where id = any($1::text[]) and deleted_at is null
       returning id`,
      [data.ids],
    );

    if (existingRows.length) {
      const deletedPayload = JSON.stringify(
        existingRows.map((row) => ({
          id: String(row.id),
          before_state: {
            title: row.title == null ? null : String(row.title),
            status: row.status == null ? null : String(row.status),
            featured: Boolean(row.featured),
            price: row.price == null ? null : String(row.price),
            deposit: row.deposit == null ? null : String(row.deposit),
            rent: row.rent == null ? null : String(row.rent),
            contactName: row.contact_name == null ? null : String(row.contact_name),
            contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
          },
        })),
      );
      await sql.query(
        `with deleted as (
           select *
           from jsonb_to_recordset($1::jsonb)
             as d(id text, before_state jsonb)
         )
         insert into property_change_history (property_id, action, before_state, after_state)
         select id, 'deleted', before_state, null
         from deleted`,
        [deletedPayload],
      );
    }

    await writeAdminAuditLog({
      action: "property.bulk_trashed",
      entityType: "property",
      metadata: { ids: data.ids, count: rows.length },
    });
    clearPropertyReadCache();
    return { success: true, deleted: rows.length };
  });

export const listAdminTrashProperties = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(200).optional().default(100) }))
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS}
       from properties
       where deleted_at is not null
       order by deleted_at desc
       limit $1`,
      [data.limit],
    );
    return rows.map((row) => mapProperty(row, { admin: true }));
  });

export const restoreDeletedProperty = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdminPermission("property.manage");
    const canPublish = hasAdminPermission(normalizeAdminRole(claims?.role), "property.publish");
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set status = case
         when deleted_from_status = 'published' and $2::boolean = false then 'draft'
         when deleted_from_status in ('draft','published','archived') then deleted_from_status
         else 'draft'
       end,
       deleted_at = null,
       deleted_from_status = null,
       updated_at = current_timestamp
       where id = $1 and deleted_at is not null
       returning id, title, status`,
      [data.id, canPublish],
    );
    if (!rows[0]) return { success: false, restored: 0 };
    await sql.query(
      `insert into property_change_history (property_id, action, before_state, after_state)
       values ($1, 'updated', $2::jsonb, $3::jsonb)`,
      [
        data.id,
        JSON.stringify({ status: "trash" }),
        JSON.stringify({ status: String(rows[0].status ?? "draft") }),
      ],
    ).catch(() => {});
    await writeAdminAuditLog({
      action: "property.restored",
      entityType: "property",
      entityId: data.id,
      entityTitle: String(rows[0].title ?? ""),
      metadata: { restoredStatus: String(rows[0].status ?? "draft") },
    });
    clearPropertyReadCache();
    return { success: true, restored: 1, title: String(rows[0].title ?? "") };
  });

export const permanentlyDeleteProperty = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select images, floor_plan_url, title from properties where id = $1 and deleted_at is not null limit 1`,
      [data.id],
    );
    const existing = rows[0];
    if (!existing) return { success: false, deleted: 0 };
    await sql.query("delete from properties where id = $1 and deleted_at is not null", [data.id]);
    const mediaUrls = [
      ...(Array.isArray(existing.images)
        ? existing.images.filter((item): item is string => typeof item === "string")
        : []),
      ...(typeof existing.floor_plan_url === "string" && existing.floor_plan_url.trim()
        ? [existing.floor_plan_url.trim()]
        : []),
    ];
    await Promise.all(Array.from(new Set(mediaUrls)).map((url) => deleteStoredMedia(url)));
    await writeAdminAuditLog({
      action: "property.permanently_deleted",
      entityType: "property",
      entityId: data.id,
      entityTitle: String(existing.title ?? ""),
    });
    clearPropertyReadCache();
    return { success: true, deleted: 1, title: String(existing.title ?? "") };
  });

export const listAdminPropertySchedules = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(200).optional().default(100) }))
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id, title, status, publish_at, unpublish_at, published_at, updated_at
       from properties
       where deleted_at is null
       order by
         case when publish_at is not null then 0 else 1 end,
         publish_at asc nulls last,
         unpublish_at asc nulls last,
         updated_at desc
       limit $1`,
      [data.limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      status: row.status as PropertyStatus,
      scheduledPublishAt: row.publish_at ? new Date(String(row.publish_at)).toISOString() : null,
      scheduledUnpublishAt: row.unpublish_at ? new Date(String(row.unpublish_at)).toISOString() : null,
      publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    }));
  });

export const updatePropertySchedule = createServerFn({ method: "POST" })
  .validator(z.object({
    id: z.string().min(1).max(120),
    publishAt: z.string().datetime({ offset: true }).nullable().optional(),
    unpublishAt: z.string().datetime({ offset: true }).nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const claims = await requireAdminPermission("property.manage");
    if (data.publishAt && !hasAdminPermission(normalizeAdminRole(claims?.role), "property.publish")) {
      throw new Error("تنظیم زمان انتشار نهایی فقط برای مدیران مجاز است.");
    }
    const sql = await getSql();
    if (data.publishAt && data.unpublishAt && new Date(data.unpublishAt) <= new Date(data.publishAt)) {
      throw new Error("زمان پایان انتشار باید بعد از زمان شروع باشد.");
    }

    const currentRows = await sql.query<Record<string, unknown>>(
      `select transaction_type, title, neighborhood, description, contact_name, contact_phone,
              price, deposit, rent, images, area_m2, features, latitude, longitude, status
       from properties
       where id = $1 and deleted_at is null
       limit 1`,
      [data.id],
    );
    const current = currentRows[0];
    if (!current) throw new Error("فایل برای زمان‌بندی پیدا نشد.");

    if (data.publishAt && String(current.status) === "draft") {
      const readiness = getPublishReadiness({
        transactionType: String(current.transaction_type ?? "sell") as "sell" | "buy" | "rent" | "mortgage",
        title: String(current.title ?? ""),
        neighborhood: String(current.neighborhood ?? ""),
        description: String(current.description ?? ""),
        contactName: String(current.contact_name ?? ""),
        contactPhone: String(current.contact_phone ?? ""),
        price: current.price == null ? "" : String(current.price),
        deposit: current.deposit == null ? "" : String(current.deposit),
        rent: current.rent == null ? "" : String(current.rent),
        imageCount: parseJsonArray(current.images).length,
        areaM2: current.area_m2 == null ? "" : String(current.area_m2),
        features: parseJsonArray(current.features).join("\n"),
        latitude: numberOrNull(current.latitude),
        longitude: numberOrNull(current.longitude),
      });
      if (!readiness.ready) {
        throw new Error("زمان‌بندی انتشار متوقف شد: " + readiness.blockers.join(" "));
      }
    }

    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set publish_at = $2::timestamptz,
           unpublish_at = $3::timestamptz,
           updated_at = current_timestamp
       where id = $1 and deleted_at is null
       returning id, title, status, publish_at, unpublish_at`,
      [data.id, data.publishAt ?? null, data.unpublishAt ?? null],
    );
    if (!rows[0]) throw new Error("فایل برای زمان‌بندی پیدا نشد.");
    await writeAdminAuditLog({
      action: "property.schedule_updated",
      entityType: "property",
      entityId: data.id,
      entityTitle: String(rows[0].title ?? ""),
      metadata: {
        publishAt: rows[0].publish_at ?? null,
        unpublishAt: rows[0].unpublish_at ?? null,
      },
    });
    clearPropertyReadCache();
    return {
      success: true,
      id: String(rows[0].id),
      title: String(rows[0].title ?? ""),
      status: String(rows[0].status ?? "draft") as PropertyStatus,
      scheduledPublishAt: rows[0].publish_at ? new Date(String(rows[0].publish_at)).toISOString() : null,
      scheduledUnpublishAt: rows[0].unpublish_at ? new Date(String(rows[0].unpublish_at)).toISOString() : null,
    };
  });

export const saveProperty = createServerFn({ method: "POST" })
  .validator(propertyInputSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdminPermission(data.id ? "property.manage" : "property.create");
    const role = normalizeAdminRole(claims?.role);
    if (role === "staff" && (data.id || data.status !== "draft" || data.featured || Boolean(data.featuredUntil))) {
      throw new Error("کارکنان فقط مجاز به ثبت فایل جدید به‌صورت پیش‌نویس هستند.");
    }
    const sql = await getSql();
    if (data.status === "published") {
      const publicationRole = String(claims?.role ?? "owner");
      if (publicationRole !== "owner" && publicationRole !== "manager") {
        throw new Error("این حساب اجازه انتشار نهایی ندارد؛ فایل را برای تأیید مدیر ارسال کنید.");
      }
    }

    const id = data.id ?? crypto.randomUUID();
    const existingRows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS} from properties where id = $1 and deleted_at is null limit 1`,
      [id],
    );
    const existing = existingRows[0] ?? null;
    if (data.status === "published" && (!existing || existing.status !== "published")) {
      const readiness = getPublishReadiness({
        transactionType: data.transactionType,
        title: data.title,
        neighborhood: data.neighborhood,
        description: data.description,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        price: data.price ?? "",
        deposit: data.deposit ?? "",
        rent: data.rent ?? "",
        imageCount: data.images.length,
        areaM2: data.areaM2 == null ? "" : String(data.areaM2),
        features: data.features.join("\n"),
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      });
      if (!readiness.ready) {
        throw new Error("انتشار فایل متوقف شد: " + readiness.blockers.join(" "));
      }
    }

    const existingSlug = typeof existing?.slug === "string" ? existing.slug.trim() : "";
    const slug = existingSlug || `${slugify(data.title)}-${id.slice(0, 8)}`;
    const featuredUntil = data.featured && data.featuredUntil
      ? (() => {
          const parsed = new Date(data.featuredUntil!);
          if (!Number.isFinite(parsed.getTime())) {
            throw new Error("تاریخ پایان ویژه نامعتبر است.");
          }
          return parsed.toISOString();
        })()
      : null;

    const publishedAt = data.status === "published" ? new Date().toISOString() : null;
    const savedFloor = data.floorLabel === "suite" ? null : data.floor ?? null;
    const savedFloorLabel = data.floorLabel === "suite" ? "suite" : null;
    const savedConvertible =
      (data.transactionType === "rent" || data.transactionType === "mortgage") ? data.convertible : false;

    await sql.query(
      `insert into properties (
        id, slug, status, featured, title, transaction_type, property_type, city,
        neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
        built_year, parking, elevator, storage, cabinet_type, flooring_type, cooling_system,
        heating_system, wall_closet_type, other_amenities, price, deposit, rent, description,
        features, images, contact_name, contact_phone, published_at, featured_until,
        latitude, longitude, virtual_tour_url, floor_label, painted, wallpaper, convertible, orientation,
        owner_name, owner_phone, owner_info, availability_status, internal_priority, internal_note, floor_plan_url
      ) values (
        $1, $2, $3, $4, $5, $6, $7, 'اصفهان',
        $8, $9, $10::integer, $11::smallint, $12::smallint, $13::smallint, $14::smallint,
        $15::smallint, $16::boolean, $17::boolean, $18::boolean, $19::text, $20::text, $21::text,
        $22::text, $23::text, $24::jsonb, $25::numeric, $26::numeric, $27::numeric, $28::text,
        $29::jsonb, $30::jsonb, $31::text, $32::text, $33::timestamptz, $34::timestamptz,
        $35::double precision, $36::double precision, $37::text, $38::text, $39::boolean, $40::boolean, $41::boolean, $42::text,
        $43::text, $44::text, $45::text, $46::text, $47::text, $48::text, $49::text
      )
      on conflict (id) do update set
        slug = excluded.slug,
        status = excluded.status,
        featured = excluded.featured,
        featured_until = excluded.featured_until,
        title = excluded.title,
        transaction_type = excluded.transaction_type,
        property_type = excluded.property_type,
        neighborhood = excluded.neighborhood,
        address = excluded.address,
        area_m2 = excluded.area_m2,
        bedrooms = excluded.bedrooms,
        bathrooms = excluded.bathrooms,
        floor = excluded.floor,
        total_floors = excluded.total_floors,
        built_year = excluded.built_year,
        parking = excluded.parking,
        elevator = excluded.elevator,
        storage = excluded.storage,
        cabinet_type = excluded.cabinet_type,
        flooring_type = excluded.flooring_type,
        cooling_system = excluded.cooling_system,
        heating_system = excluded.heating_system,
        wall_closet_type = excluded.wall_closet_type,
        other_amenities = excluded.other_amenities,
        price = excluded.price,
        deposit = excluded.deposit,
        rent = excluded.rent,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        virtual_tour_url = excluded.virtual_tour_url,
        floor_label = excluded.floor_label,
        painted = excluded.painted,
        wallpaper = excluded.wallpaper,
        convertible = excluded.convertible,
        orientation = excluded.orientation,
        owner_name = excluded.owner_name,
        owner_phone = excluded.owner_phone,
        owner_info = excluded.owner_info,
        availability_status = excluded.availability_status,
        internal_priority = excluded.internal_priority,
        internal_note = excluded.internal_note,
        floor_plan_url = excluded.floor_plan_url,
        previous_price = properties.price,
        previous_deposit = properties.deposit,
        previous_rent = properties.rent,
        price_changed_at = case
          when (
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          ) is not null
          and (
            case
              when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
              when excluded.transaction_type = 'mortgage' then excluded.deposit
              else excluded.price
            end
          ) is not null
          and (
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          ) > 0
          and (
            case
              when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
              when excluded.transaction_type = 'mortgage' then excluded.deposit
              else excluded.price
            end
          ) < (
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          )
          then current_timestamp
          else properties.price_changed_at
        end,
        price_drop_percent = case
          when (
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          ) > 0
          and (
            case
              when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
              when excluded.transaction_type = 'mortgage' then excluded.deposit
              else excluded.price
            end
          ) < (
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          )
          then round((
            (
              case
                when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
                when properties.transaction_type = 'mortgage' then properties.deposit
                else properties.price
              end
            ) - (
              case
                when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
                when excluded.transaction_type = 'mortgage' then excluded.deposit
                else excluded.price
              end
            )
          ) / nullif((
            case
              when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
              when properties.transaction_type = 'mortgage' then properties.deposit
              else properties.price
            end
          ), 0) * 100, 2)
          else null
        end,
        description = excluded.description,
        features = excluded.features,
        images = excluded.images,
        contact_name = excluded.contact_name,
        contact_phone = excluded.contact_phone,
        published_at = case
          when excluded.status = 'published' and properties.published_at is null then excluded.published_at
          when excluded.status <> 'published' then null
          else properties.published_at
        end,
        updated_at = current_timestamp`,
      [
        id,
        slug,
        data.status,
        data.featured,
        data.title,
        data.transactionType,
        data.propertyType,
        data.neighborhood,
        role === "staff" ? null : data.address || null,
        data.areaM2 ?? null,
        data.bedrooms ?? null,
        data.bathrooms ?? null,
        savedFloor,
        data.totalFloors ?? null,
        data.builtYear ?? null,
        data.parking,
        data.elevator,
        data.storage,
        data.cabinetType,
        data.flooringType,
        data.coolingSystem,
        data.heatingSystem,
        data.wallClosetType,
        JSON.stringify(data.otherAmenities),
        data.price,
        data.deposit,
        data.rent,
        data.description,
        JSON.stringify(data.features),
        JSON.stringify(data.images),
        data.contactName,
        data.contactPhone,
        publishedAt,
        featuredUntil,
        data.latitude ?? null,
        data.longitude ?? null,
        data.virtualTourUrl.trim(),
        savedFloorLabel,
        data.painted,
        data.wallpaper,
        savedConvertible,
        data.orientation,
        // Migration 0038 declares these three columns `not null default ''`, so
        // "no owner details" has to be written as an empty string. Sending NULL
        // violated the NOT NULL constraint and made every property create or
        // update from /admin fail with
        // `null value in column "owner_name" of relation "properties"`.
        role === "staff" ? "" : data.ownerName.trim(),
        role === "staff" ? "" : data.ownerPhone.trim(),
        role === "staff" ? "" : data.ownerInfo.trim(),
        data.availabilityStatus,
        data.internalPriority,
        data.internalNote,
        data.floorPlanUrl.trim(),
      ],
    );

    const rows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS} from properties where id = $1 and deleted_at is null limit 1`,
      [id],
    );
    if (!rows[0]) throw new Error("فایل ثبت نشد.");

    if (existing) {
      const asNumber = (value: unknown) => {
        if (value == null || value === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const oldPrice = asNumber(existing.price);
      const oldDeposit = asNumber(existing.deposit);
      const oldRent = asNumber(existing.rent);
      const newPrice = asNumber(rows[0].price);
      const newDeposit = asNumber(rows[0].deposit);
      const newRent = asNumber(rows[0].rent);
      const changed = oldPrice !== newPrice || oldDeposit !== newDeposit || oldRent !== newRent;
      if (changed) {
        await sql.query(
          `insert into admin_property_price_history (
             property_id, price_before, price_after, deposit_before, deposit_after,
             rent_before, rent_after, created_by
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            oldPrice,
            newPrice,
            oldDeposit,
            newDeposit,
            oldRent,
            newRent,
            String(claims?.displayName ?? "مدیریت"),
          ],
        );
      }
    }

    const action = existing ? "updated" : "created";
    await sql.query(
      `insert into property_change_history (property_id, action, before_state, after_state)
       values ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        id,
        action,
        existing ? JSON.stringify(mapProperty(existing, { admin: true })) : null,
        JSON.stringify(mapProperty(rows[0], { admin: true })),
      ],
    );
    await writeAdminAuditLog({
      action: action === "created" ? "property.created" : "property.updated",
      entityType: "property",
      entityId: id,
      entityTitle: String(rows[0]?.title ?? ""),
      metadata: { status: rows[0]?.status ?? null },
    });

    clearPropertyReadCache();
    return mapProperty(rows[0], { admin: true });
  });

export const listPropertyChangeHistory = createServerFn({ method: "POST" })
  .validator(z.object({
    id: z.string().min(1),
    limit: z.number().int().min(1).max(30).optional().default(12),
  }))
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<{
      id: number;
      action: "created" | "updated" | "deleted";
      before_state: unknown;
      after_state: unknown;
      changed_at: string | Date;
    }>(
      `select id, action, before_state, after_state, changed_at
       from property_change_history
       where property_id = $1
       order by changed_at desc, id desc
       limit $2`,
      [data.id, data.limit],
    );

    const state = (value: unknown): PropertyHistoryState => {
      if (!value || typeof value !== "object") {
        return {
          title: null,
          status: null,
          availabilityStatus: null,
          featured: null,
          price: null,
          deposit: null,
          rent: null,
          contactName: null,
          contactPhone: null,
          ownerName: null,
          ownerPhone: null,
          ownerInfo: null,
        };
      }
      const row = value as Record<string, unknown>;
      return {
        title: typeof row.title === "string" ? row.title : null,
        status:
          row.status === "draft" || row.status === "published" || row.status === "archived"
            ? row.status
            : null,
        availabilityStatus:
          row.availabilityStatus === "reserved" || row.availabilityStatus === "sold" || row.availabilityStatus === "rented" || row.availabilityStatus === "unavailable" || row.availabilityStatus === "available"
            ? row.availabilityStatus
            : null,
        featured: typeof row.featured === "boolean" ? row.featured : null,
        price: row.price == null ? null : String(row.price),
        deposit: row.deposit == null ? null : String(row.deposit),
        rent: row.rent == null ? null : String(row.rent),
        contactName: typeof row.contactName === "string" ? row.contactName : null,
        contactPhone: typeof row.contactPhone === "string" ? row.contactPhone : null,
        ownerName: typeof row.ownerName === "string" ? row.ownerName : null,
        ownerPhone: typeof row.ownerPhone === "string" ? row.ownerPhone : null,
        ownerInfo: typeof row.ownerInfo === "string" ? row.ownerInfo : null,
      };
    };

    return rows.map((row) => {
      const before = state(row.before_state);
      const after = state(row.after_state);
      return {
        id: Number(row.id),
        action: row.action,
        changedAt: new Date(String(row.changed_at)).toISOString(),
        beforeTitle: before.title,
        beforeStatus: before.status,
        beforeAvailabilityStatus: before.availabilityStatus,
        beforeFeatured: before.featured,
        beforePrice: before.price,
        beforeDeposit: before.deposit,
        beforeRent: before.rent,
        beforeState: state(row.before_state),
        beforeContactName: before.contactName,
        beforeContactPhone: before.contactPhone,
        afterTitle: after.title,
        afterStatus: after.status,
        afterAvailabilityStatus: after.availabilityStatus,
        afterFeatured: after.featured,
        afterPrice: after.price,
        afterDeposit: after.deposit,
        afterRent: after.rent,
        afterContactName: after.contactName,
        afterContactPhone: after.contactPhone,
        beforeOwnerName: before.ownerName,
        beforeOwnerPhone: before.ownerPhone,
        beforeOwnerInfo: before.ownerInfo,
        afterOwnerName: after.ownerName,
        afterOwnerPhone: after.ownerPhone,
        afterOwnerInfo: after.ownerInfo,
      };
    });
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    const sql = await getSql();
    const existingRows = await sql.query<Record<string, unknown>>(
      `select ${DETAIL_COLUMNS} from properties where id = $1 limit 1`,
      [data.id],
    );
    const existing = existingRows[0] ?? null;
    const rows = await sql.query<Record<string, unknown>>(
      `update properties
       set deleted_at = current_timestamp,
           deleted_from_status = status,
           status = 'archived',
           featured = false,
           featured_until = null,
           updated_at = current_timestamp
       where id = $1 and deleted_at is null
       returning id`,
      [data.id],
    );

    if (!rows.length) {
      clearPropertyReadCache();
      return { success: false, deleted: 0 };
    }

    if (existing) {
      await sql.query(
        `insert into property_change_history (property_id, action, before_state, after_state)
         values ($1, 'deleted', $2::jsonb, null)`,
        [data.id, JSON.stringify(mapProperty(existing, { admin: true }))],
      );
      await writeAdminAuditLog({
        action: "property.trashed",
        entityType: "property",
        entityId: data.id,
        entityTitle: String(existing.title ?? ""),
        metadata: { fromStatus: existing.status ?? null },
      });
    }

    clearPropertyReadCache();
    return { success: true, deleted: 1 };
  });
