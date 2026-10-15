import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { getSql } from "@/lib/db";
import { normalizeAreaDirectoryKey } from "@/lib/area-directory-core";
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
      let databaseItems: NeighborhoodCatalogItem[] = [];
      try {
        const sql = await getSql();
        const rows = await sql.query<{ name: string; group_title: string }>(
          "select name, group_title from neighborhoods where is_active = true order by group_title asc, name asc",
        );
        databaseItems = rows.map((row) => ({ name: String(row.name), groupTitle: String(row.group_title) }));
      } catch (error) {
        console.warn("[neighborhoods] database catalog unavailable; using bundled catalog", error);
      }

      // DB keeps legacy spellings for existing files; bundled Divar-backed entries fill gaps.
      const merged = new Map<string, NeighborhoodCatalogItem>();
      for (const item of databaseItems) {
        const key = normalizeAreaDirectoryKey(item.name);
        if (key) merged.set(key, item);
      }
      for (const group of NEIGHBORHOOD_GROUPS) {
        for (const item of group.items) {
          const key = normalizeAreaDirectoryKey(item.name);
          if (key && !merged.has(key)) merged.set(key, { name: item.name, groupTitle: group.title });
        }
      }
      return [...merged.values()].sort(sortFa);
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
