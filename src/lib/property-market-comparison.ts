import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listPublishedPropertyCards, type PropertyCardData } from "@/lib/properties";

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type PropertyMarketComparison = {
  comparableCount: number;
  unitMedian: number | null;
  unitAverage: number | null;
  currentUnit: number | null;
  differencePercent: number | null;
  sample: PropertyCardData[];
};

export const getPropertyMarketComparison = createServerFn({ method: "GET" })
  .validator(z.object({
    id: z.string().min(1).max(120),
    propertyType: z.enum(["apartment","villa","office","land","commercial","heritage"]),
    transactionType: z.enum(["sell","buy","rent","mortgage"]),
    neighborhood: z.string().trim().max(80).default(""),
    areaM2: z.number().positive().max(10000).nullable(),
    price: z.number().positive().nullable(),
    rent: z.number().positive().nullable(),
  }))
  .handler(async ({ data }): Promise<PropertyMarketComparison> => {
    const empty = { comparableCount: 0, unitMedian: null, unitAverage: null, currentUnit: null, differencePercent: null, sample: [] };
    if (!data.neighborhood) return empty;

    const rows = await listPublishedPropertyCards({
      data: {
        transactionType: data.transactionType,
        propertyType: data.propertyType,
        neighborhood: data.neighborhood,
        minArea: data.areaM2 ? Math.max(1, Math.round(data.areaM2 * 0.75)) : undefined,
        maxArea: data.areaM2 ? Math.round(data.areaM2 * 1.25) : undefined,
        sort: "newest",
        offset: 0,
      },
    });
    const clean = rows.filter((item) => item.id !== data.id);
    const isSale = data.transactionType === "sell" || data.transactionType === "buy";
    const values = clean.map((item) => {
      if (isSale) {
        const price = positive(item.price);
        const area = positive(item.areaM2);
        return price && area ? price / area : null;
      }
      return positive(item.rent);
    }).filter((value): value is number => value != null);

    if (!values.length) return empty;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const currentUnit = isSale
      ? positive(data.price) && data.areaM2 ? positive(data.price)! / data.areaM2 : null
      : positive(data.rent);
    const differencePercent = currentUnit && median ? ((currentUnit - median) / median) * 100 : null;

    return {
      comparableCount: values.length,
      unitMedian: median,
      unitAverage: average,
      currentUnit,
      differencePercent,
      sample: clean.slice(0, 4),
    };
  });