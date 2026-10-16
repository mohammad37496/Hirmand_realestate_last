export type DivarCatalogEntry = {
  id: string | number;
  name: string;
  slug: string;
  second_slug?: string | null;
  default_location: { latitude: number; longitude: number };
  bbox?: readonly number[];
};

export type DirectoryNeighborhood = {
  name: string;
  address?: string;
  searchQuery?: string;
  lat?: number;
  lng?: number;
  label?: string;
  divarDistrictId?: string;
  divarSlug?: string;
  divarSecondSlug?: string | null;
  divarBbox?: [number, number, number, number];
};

export const DIVAR_EXTRA_AREA_GROUP = "سایر محدوده‌های ثبت‌شده از دیوار";

export function normalizeAreaDirectoryKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/(?:ۀ|ة)/g, "ه")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/(?:[\u064b-\u065f]|\u0670|\u0640)/g, "")
    .replace(/(?:\u200c|\u200d|\u200e|\u200f|[\u202a-\u202e])/g, "")
    .toLocaleLowerCase("fa")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function nameKeys(value: string): string[] {
  return [...new Set(String(value ?? "").split(/[،؛|]/).flatMap((part) => part.split("/")).map(normalizeAreaDirectoryKey).filter(Boolean))];
}

function safeBbox(value: readonly number[] | undefined): [number, number, number, number] | undefined {
  if (!value || value.length !== 4 || !value.every(Number.isFinite)) return undefined;
  const [west, south, east, north] = value;
  if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90 || west >= east || south >= north) return undefined;
  return [west, south, east, north];
}

function safePoint(value: unknown): { lat: number; lng: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const point = value as Record<string, unknown>;
  const toNumber = (raw: unknown) => {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "number" && typeof raw !== "string") return null;
    if (typeof raw === "string" && !raw.trim()) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  };
  const lat = toNumber(point.latitude);
  const lng = toNumber(point.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

/** Carefully reviewed spelling aliases: only names known to refer to the same area. */
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
  ].map(([source, target]) => [normalizeAreaDirectoryKey(source), normalizeAreaDirectoryKey(target)] as [string, string]),
);

/** Enrich every known area with source geometry, and add remaining Divar records. */
export function mergeNeighborhoodGroups(
  curatedGroups: readonly { title: string; items: readonly DirectoryNeighborhood[] }[],
  catalog: readonly DivarCatalogEntry[],
): Array<{ title: string; items: DirectoryNeighborhood[] }> {
  const byName = new Map<string, DivarCatalogEntry[]>();
  for (const district of catalog) {
    const key = normalizeAreaDirectoryKey(district.name);
    byName.set(key, [...(byName.get(key) ?? []), district]);
  }

  const curated = curatedGroups.flatMap((group, groupIndex) =>
    group.items.map((item, itemIndex) => ({ item, groupIndex, itemIndex })),
  );
  const matchedByIndex = new Map<number, DivarCatalogEntry>();
  const usedIds = new Set<string>();

  // Pass one: exact normalized names always take precedence over aliases.
  curated.forEach(({ item }, index) => {
    const matches = [...new Map(
      nameKeys(item.name).flatMap((key) => byName.get(key) ?? []).map((candidate) => [String(candidate.id), candidate]),
    ).values()];
    if (matches.length === 1 && !usedIds.has(String(matches[0].id))) {
      matchedByIndex.set(index, matches[0]);
      usedIds.add(String(matches[0].id));
    }
  });

  // Pass two: map only reviewed alternate spellings when they resolve unambiguously.
  curated.forEach(({ item }, index) => {
    if (matchedByIndex.has(index)) return;
    const alias = AREA_NAME_ALIASES.get(normalizeAreaDirectoryKey(item.name));
    if (!alias) return;
    const matches = byName.get(alias) ?? [];
    if (matches.length === 1 && !usedIds.has(String(matches[0].id))) {
      matchedByIndex.set(index, matches[0]);
      usedIds.add(String(matches[0].id));
    }
  });

  let flatIndex = 0;
  const result = curatedGroups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => {
      const match = matchedByIndex.get(flatIndex++);
      if (!match) return { ...item };
      const point = safePoint(match.default_location);
      const bbox = safeBbox(match.bbox);
      return {
        ...item,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
        divarDistrictId: String(match.id),
        divarSlug: match.slug,
        divarSecondSlug: match.second_slug ?? null,
        ...(bbox ? { divarBbox: bbox } : {}),
      };
    }),
  }));

  const slugs = new Set(result.flatMap((group) => group.items.flatMap((item) => [item.divarSlug, item.divarSecondSlug].filter((slug): slug is string => Boolean(slug)))));
  const extras = catalog.filter((district) => !usedIds.has(String(district.id)))
    .sort((a, b) => a.name.localeCompare(b.name, "fa", { sensitivity: "base", numeric: true }))
    .map((district): DirectoryNeighborhood => {
      const point = safePoint(district.default_location);
      const bbox = safeBbox(district.bbox);
      let slug = district.slug || normalizeAreaDirectoryKey(district.name);
      if (slugs.has(slug)) slug = slug + "-" + district.id;
      slugs.add(slug);
      if (district.second_slug) slugs.add(district.second_slug);
      return {
        name: district.name,
        address: district.name + "، اصفهان",
        searchQuery: district.name + "، اصفهان، ایران",
        label: district.name,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
        divarDistrictId: String(district.id),
        divarSlug: district.slug,
        divarSecondSlug: district.second_slug ?? null,
        ...(bbox ? { divarBbox: bbox } : {}),
      };
    });
  if (extras.length) result.push({ title: DIVAR_EXTRA_AREA_GROUP, items: extras });
  return result;
}
