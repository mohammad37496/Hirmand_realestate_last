import type { DivarBbox, DivarNeighborhoodClientItem } from "./divar-neighborhood-geometry.ts";

export type DirectoryAreaBase = {
  name: string;
  slug: string;
  groupTitle: string;
  address?: string;
  searchQuery?: string;
  lat?: number;
  lng?: number;
  label?: string;
};

export type DirectoryAreaSource = {
  divarDistrictId?: string;
  divarBbox?: DivarBbox;
  /** Official Divar slugs remain valid aliases when a curated Persian URL is canonical. */
  divarSlug?: string;
  divarSecondSlug?: string | null;
};

/**
 * Only spelling/label variants known to refer to the same local area belong here.
 * Broader/nearby neighborhoods are deliberately not aliased to avoid wrong pins.
 */
const AREA_NAME_ALIASES = new Map<string, string>(
  [
    ["درب‌کوش", "درب کوشک"],
    ["شهزاده ابراهیم", "شاهزاده ابراهیم"],
    ["پوزوه", "پزوه"],
    ["پنارت", "پینارت"],
    ["عسکریه", "عسگریه"],
    ["آندوان", "اندوان"],
    ["والدان", "ولدان"],
    ["کاردالان", "کارلادان"],
    ["لادان", "جنیران (لادان)"],
    ["اسلامی", "محله اسلامی"],
    ["شهید کشوری", "کوی شهید کشوری"],
    ["گل‌نرگس", "شهرک گل نرگس"],
    ["جوان", "جاوان"],
    ["قلعه تبرک", "قلعه طبره"],
  ].map(([source, target]) => [areaDirectoryKey(source), target] as [string, string]),
);

export function areaDirectoryKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e\u0640]/g, "")
    .replace(/[\s\u00a0‐‑–—_/،,-]+/g, "")
    .toLocaleLowerCase("fa");
}

/**
 * Merge the curated directory with Divar's stored catalog.
 * Direct name matches are assigned first; only then are vetted aliases used.
 * That keeps an alias from stealing a district that has an exact site match.
 * Every remaining Divar record is included with its own coordinates and bbox.
 */
export function mergeAreaDirectory<T extends DirectoryAreaBase>(
  curatedAreas: T[],
  catalogItems: DivarNeighborhoodClientItem[],
  extraGroupTitle: string,
): Array<T & DirectoryAreaBase & DirectoryAreaSource> {
  const catalogByName = new Map<string, DivarNeighborhoodClientItem[]>();
  for (const item of catalogItems) {
    const key = areaDirectoryKey(item.name);
    const current = catalogByName.get(key) ?? [];
    current.push(item);
    catalogByName.set(key, current);
  }

  const matchedByIndex = new Map<number, DivarNeighborhoodClientItem>();
  const representedDistrictIds = new Set<string>();

  // Pass 1: exact normalized names always win.
  curatedAreas.forEach((area, index) => {
    const matches = catalogByName.get(areaDirectoryKey(area.name)) ?? [];
    if (matches.length !== 1 || representedDistrictIds.has(matches[0].id)) return;
    matchedByIndex.set(index, matches[0]);
    representedDistrictIds.add(matches[0].id);
  });

  // Pass 2: map known spelling/label aliases only to a unique, not-yet-used record.
  curatedAreas.forEach((area, index) => {
    if (matchedByIndex.has(index)) return;
    const aliasTarget = AREA_NAME_ALIASES.get(areaDirectoryKey(area.name));
    if (!aliasTarget) return;
    const matches = catalogByName.get(areaDirectoryKey(aliasTarget)) ?? [];
    if (matches.length !== 1 || representedDistrictIds.has(matches[0].id)) return;
    matchedByIndex.set(index, matches[0]);
    representedDistrictIds.add(matches[0].id);
  });

  const mergedCurated = curatedAreas.map((area, index) => {
    const source = matchedByIndex.get(index);
    if (!source) return area;
    return {
      ...area,
      lat: source.defaultLocation.latitude,
      lng: source.defaultLocation.longitude,
      divarDistrictId: source.id,
      divarBbox: source.bbox,
      divarSlug: source.slug,
      divarSecondSlug: source.secondSlug,
    };
  }) as Array<T & DirectoryAreaBase & DirectoryAreaSource>;

  const usedSlugs = new Set(mergedCurated.map((area) => area.slug));
  const additionalAreas = catalogItems
    .filter((item) => !representedDistrictIds.has(item.id))
    .map((item) => {
      const baseSlug = item.slug || areaDirectoryKey(item.name);
      let slug = baseSlug;
      let suffix = 0;
      while (usedSlugs.has(slug)) {
        suffix += 1;
        slug = `${baseSlug}-${item.id}-${suffix}`;
      }
      usedSlugs.add(slug);

      return {
        name: item.name,
        slug,
        address: `${item.name}، اصفهان`,
        searchQuery: `${item.name}، اصفهان`,
        lat: item.defaultLocation.latitude,
        lng: item.defaultLocation.longitude,
        groupTitle: extraGroupTitle,
        divarDistrictId: item.id,
        divarBbox: item.bbox,
        divarSlug: item.slug,
        divarSecondSlug: item.secondSlug,
      } as T & DirectoryAreaBase & DirectoryAreaSource;
    });

  return [...mergedCurated, ...additionalAreas];
}
