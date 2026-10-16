import { z } from "zod";
import { compactSearchText } from "./property-search-utils.ts";

export const publicPropertyFiltersSchema = z.object({
  transactionType: z.enum(["buy", "sell", "rent", "mortgage"]).optional(),
  propertyType: z.enum(["apartment", "villa", "office", "heritage", "land", "commercial"]).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  mapBounds: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]).refine(([west, south, east, north]) => west < east && south < north, {
    message: "محدوده نقشه نامعتبر است.",
  }).optional(),
  featuredOnly: z.boolean().optional(),
  search: z.string().trim().max(80).refine((value) => !value || compactSearchText(value).length > 0, {
    message: "عبارت جست‌وجو باید شامل حرف یا عدد باشد.",
  }).optional(),
  minArea: z.number().int().min(0).max(100000).optional(),
  maxArea: z.number().int().min(0).max(100000).optional(),
  minPrice: z.number().int().min(0).max(999999999999999).optional(),
  maxPrice: z.number().int().min(0).max(999999999999999).optional(),
  minDeposit: z.number().int().min(0).max(999999999999999).optional(),
  maxDeposit: z.number().int().min(0).max(999999999999999).optional(),
  minRent: z.number().int().min(0).max(999999999999999).optional(),
  maxRent: z.number().int().min(0).max(999999999999999).optional(),
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
  featureSearch: z.string().trim().max(80).refine((value) => !value || compactSearchText(value).length > 0, {
    message: "عبارت ویژگی باید شامل حرف یا عدد باشد.",
  }).optional(),
  hasImagesOnly: z.boolean().optional(),
  hasLocationOnly: z.boolean().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "area_asc", "area_desc"]).optional().default("newest"),
  offset: z.number().int().min(0).max(100000).optional().default(0),
}).superRefine((data, ctx) => {
  const ranges = [
    ["minArea", "maxArea", "متراژ"],
    ["minPrice", "maxPrice", "قیمت"],
    ["minDeposit", "maxDeposit", "ودیعه"],
    ["minRent", "maxRent", "اجاره"],
    ["minFloor", "maxFloor", "طبقه"],
    ["minTotalFloors", "maxTotalFloors", "تعداد طبقات"],
    ["minBuiltYear", "maxBuiltYear", "سال ساخت"],
  ] as const;

  for (const [minKey, maxKey, label] of ranges) {
    const minimum = data[minKey];
    const maximum = data[maxKey];
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      ctx.addIssue({
        code: "custom",
        path: [maxKey],
        message: `حداکثر ${label} باید بزرگ‌تر یا مساوی حداقل باشد.`,
      });
    }
  }
});

export type PublicPropertyFilters = z.infer<typeof publicPropertyFiltersSchema>;
