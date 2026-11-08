import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { loadNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "./neighborhood-market-query";

export type { NeighborhoodMarketSnapshot } from "./neighborhood-market-query";

export const getNeighborhoodMarketSnapshot = createServerFn({ method: "GET" })
  .validator(z.object({ neighborhood: z.string().trim().min(2).max(80) }))
  .handler(async ({ data }): Promise<NeighborhoodMarketSnapshot> => {
    setResponseHeader(
      "cache-control",
      "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
    );

    const empty = (): NeighborhoodMarketSnapshot => ({
      neighborhood: data.neighborhood,
      activeFiles: 0,
      saleFiles: 0,
      rentFiles: 0,
      saleAvgPerM2: null,
      rentAvg: null,
      newFiles30d: 0,
      priceDropFiles: 0,
      views30d: 0,
      favorites30d: 0,
      calls30d: 0,
      viewingRequests30d: 0,
      generatedAt: new Date().toISOString(),
    });

    if (dbSource === "unconfigured") return empty();

    try {
      return await cachedPropertyRead(
        "neighborhood-market:" + data.neighborhood,
        15 * 60_000,
        async () => {
          const sql = await getSql();
          return loadNeighborhoodMarketSnapshot(sql, data.neighborhood);
        },
      );
    } catch (error) {
      console.warn("[neighborhood-market] snapshot unavailable", error);
      return empty();
    }
  });
