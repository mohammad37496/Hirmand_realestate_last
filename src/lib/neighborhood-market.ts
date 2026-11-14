import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { loadNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "./neighborhood-market-query";
import {
  loadMarketSnapshot,
  MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL,
} from "./market-snapshot-availability";

export type { NeighborhoodMarketSnapshot } from "./neighborhood-market-query";

export const getNeighborhoodMarketSnapshot = createServerFn({ method: "GET" })
  .validator(z.object({ neighborhood: z.string().trim().min(2).max(80) }))
  .handler(async ({ data }): Promise<NeighborhoodMarketSnapshot | null> => {
    if (dbSource === "unconfigured") {
      setResponseHeader("cache-control", MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL);
      return null;
    }

    return loadMarketSnapshot(
      () => cachedPropertyRead(
        "neighborhood-market:" + data.neighborhood,
        15 * 60_000,
        async () => {
          const sql = await getSql();
          return loadNeighborhoodMarketSnapshot(sql, data.neighborhood);
        },
      ),
      (value) => setResponseHeader("cache-control", value),
      (error) => console.warn("[neighborhood-market] snapshot unavailable", error),
    );
  });
