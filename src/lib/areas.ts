import { NEIGHBORHOOD_GROUPS, type Neighborhood } from "@/lib/site";
import { SITE } from "@/lib/site";
import { absoluteUrl, socialMeta } from "@/lib/seo";

export type AreaInfo = Neighborhood & {
  slug: string;
  groupTitle: string;
};

/** Stable URL slug for Persian neighborhood names. */
export function areaSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/‌/g, "") // zero-width non-joiner
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function allAreas(): AreaInfo[] {
  const out: AreaInfo[] = [];
  for (const group of NEIGHBORHOOD_GROUPS) {
    for (const item of group.items) {
      out.push({
        ...item,
        slug: areaSlug(item.name),
        groupTitle: group.title,
      });
    }
  }
  return out;
}

export function findAreaBySlug(slug: string): AreaInfo | null {
  const normalized = areaSlug(decodeURIComponent(slug));
  return allAreas().find((a) => a.slug === normalized) ?? null;
}

export function areaPath(nameOrSlug: string): string {
  const slug = areaSlug(nameOrSlug);
  return `/areas/${encodeURIComponent(slug)}`;
}

export function areaHead(area: AreaInfo | null, slug: string) {
  if (!area) {
    return {
      meta: [
        { title: `محله یافت نشد | ${SITE.nameFa}` },
        { name: "description", content: "این محله در فهرست هیرمند نیست." },
        { name: "robots", content: "noindex, follow" },
      ],
      links: [{ rel: "canonical", href: absoluteUrl(`/areas/${slug}`) }],
    };
  }

  const title = `املاک ${area.name} اصفهان | خرید، فروش و اجاره | ${SITE.shortName}`;
  const description = `مشاوره خرید، فروش، رهن و اجاره ملک در محله ${area.name} اصفهان. فایل‌های به‌روز گروه مشاورین املاک هیرمند در ${area.name} و محله‌های اطراف.`;
  const url = absoluteUrl(areaPath(area.slug));

  return {
    meta: [
      { title },
      { name: "description", content: description },
      {
        name: "keywords",
        content: `املاک ${area.name}, خرید خانه ${area.name}, فروش آپارتمان ${area.name}, اجاره ${area.name} اصفهان, مشاور املاک ${area.name}, ${SITE.shortName}`,
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "geo.region", content: "IR-04" },
      { name: "geo.placename", content: area.name },
      ...(area.lat != null && area.lng != null ? [{ name: "geo.position", content: `${area.lat};${area.lng}` }] : []),
      ...(area.lat != null && area.lng != null ? [{ name: "ICBM", content: `${area.lat}, ${area.lng}` }] : []),
      ...socialMeta({ title, description, url }),
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "fa-IR", href: url },
    ],
  };
}

export function areaJsonLd(area: AreaInfo) {
  const url = absoluteUrl(areaPath(area.slug));
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": `${url}#place`,
    name: `${area.name}، اصفهان`,
    description: `محله ${area.name} در اصفهان — خدمات املاک هیرمند`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: area.lat,
      longitude: area.lng,
    },
    containedInPlace: {
      "@type": "City",
      name: "اصفهان",
    },
    url,
  };
}
