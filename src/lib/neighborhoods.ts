import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { listDivarNeighborhoodCatalog } from "@/lib/divar-neighborhoods";

export type NeighborhoodCatalogItem = {
  name: string;
  groupTitle: string;
};

export const listNeighborhoodCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<NeighborhoodCatalogItem[]> => {
    setResponseHeader("cache-control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    return cachedPropertyRead("neighborhood-catalog", 30 * 60_000, async () => {
      try {
        const catalog = await listDivarNeighborhoodCatalog();
        return catalog.items.map((item) => ({
          name: item.name,
          groupTitle: "محله‌های دیوار",
        }));
      } catch (error) {
        // Never replace authoritative geography with a guessed/static location list.
        console.warn("[neighborhoods] authoritative Divar catalog unavailable", error);
        return [];
      }
    });
  },
);

export const listNeighborhoodNames = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    setResponseHeader("cache-control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    return cachedPropertyRead("neighborhood-names", 30 * 60_000, async () => {
      const catalog = await listNeighborhoodCatalog();
      return [...new Set(catalog.map((item) => item.name))];
    });
  },
);
