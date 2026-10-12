import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { getSql } from "@/lib/db";
import { NEIGHBORHOOD_GROUPS } from "@/lib/site";

export type NeighborhoodCatalogItem = {
  name: string;
  groupTitle: string;
};

const sortFa = (a: NeighborhoodCatalogItem, b: NeighborhoodCatalogItem) =>
  a.name.localeCompare(b.name, "fa", { sensitivity: "base", numeric: true });

export const listNeighborhoodCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<NeighborhoodCatalogItem[]> => {
    setResponseHeader("cache-control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    return cachedPropertyRead("neighborhood-catalog", 30 * 60_000, async () => {
      try {
        const sql = await getSql();
        const rows = await sql.query<{ name: string; group_title: string }>(
          "select name, group_title from neighborhoods where is_active = true order by group_title asc, name asc",
        );
        if (rows.length) {
          return rows.map((row) => ({
            name: String(row.name),
            groupTitle: String(row.group_title),
          }));
        }
      } catch (error) {
        console.warn("[neighborhoods] database catalog unavailable; using bundled catalog", error);
      }

      return NEIGHBORHOOD_GROUPS.flatMap((group) =>
        group.items.map((item) => ({ name: item.name, groupTitle: group.title })),
      ).sort(sortFa);
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
