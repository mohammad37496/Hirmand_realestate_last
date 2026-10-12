import { SITE, TEAM } from "@/lib/site";
import type { Property } from "@/lib/properties";
import type { SiteSettings } from "@/lib/site-settings";
import { propertyPath } from "@/lib/property-path";
import { DB_MEDIA_PATH, isDivarRemoteHost } from "@/lib/media";
import {
  getPropertyFallbackImage,
  getPropertyFallbackLegacyImage,
} from "@/lib/property-fallback-images";
import { formatToman } from "@/lib/money";

const TX_LABEL: Record<string, string> = {
  buy: "خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

const TYPE_LABEL: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "تجاری",
};

export function absoluteUrl(path = "/"): string {
  const base = SITE.url.replace(/\/$/, "");
  if (!path || path === "/") return base + "/";
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Turn a stored media reference into a URL a crawler outside our origin can
 * actually fetch. Classifieds CDNs reject hotlinking, so their media is routed
 * through our own same-origin proxy; anything non-fetchable returns "".
 */
function shareableImageUrl(src: string | null | undefined): string {
  const value = (src ?? "").trim();
  if (!value) return "";
  if (value.startsWith(DB_MEDIA_PATH)) return absoluteUrl(value);
  try {
    const url = new URL(value);
    if (isDivarRemoteHost(value)) {
      return absoluteUrl(`/api/media-proxy?url=${encodeURIComponent(url.toString())}`);
    }
    if (url.protocol === "https:") return url.toString();
    return "";
  } catch {
    return value.startsWith("/") ? absoluteUrl(value) : "";
  }
}

/** Best available social image for a listing, never an invented one. */
function fileCodeForSeo(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
}

export function propertySocialImage(property: Property): string {
  const own = property.images
    .map(shareableImageUrl)
    .find((candidate) => candidate && !candidate.endsWith(".svg"));
  if (own) return own;

  // Prefer the generated local photo when the build has produced it. The
  // bundled SVG is the guaranteed no-network fallback, so social previews never
  // point at an asset that can be missing after a failed image download.
  const generatedFallback = shareableImageUrl(
    getPropertyFallbackImage(property.propertyType, property.id),
  );
  if (generatedFallback) return generatedFallback;

  const guaranteedFallback = shareableImageUrl(
    getPropertyFallbackLegacyImage(property.propertyType, property.id),
  );
  return guaranteedFallback || ogImageUrl();
}

export function ogImageUrl(path = "/images/isfahan-hero.jpg"): string {
  return absoluteUrl(path);
}

export function socialMeta(input: {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
}) {
  const image = input.image ?? ogImageUrl();
  return [
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:locale", content: "fa_IR" },
    { property: "og:site_name", content: SITE.nameFa },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: input.url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: input.title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
  ] as const;
}

export function homeHead(settings?: SiteSettings) {
  const title = settings?.siteTitle?.trim() || SITE.title;
  const description = settings?.siteDescription?.trim() || SITE.description;
  const keywords = settings?.seoKeywords?.trim() || "املاک اصفهان, مشاور املاک اصفهان, خرید خانه اصفهان, فروش آپارتمان اصفهان, رهن و اجاره اصفهان, املاک هیرمند";
  const url = absoluteUrl("/");
  return {
    meta: [
      { title },
      { name: "description", content: description },
      {
        name: "keywords",
        content: keywords,
      },
      { name: "robots", content: settings?.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { name: "googlebot", content: settings?.noindex ? "noindex, nofollow" : "index, follow" },
      { name: "author", content: SITE.nameFa },
      { name: "geo.region", content: "IR-04" },
      { name: "geo.placename", content: "Isfahan" },
      { name: "language", content: "fa" },
      ...(settings?.googleSiteVerification?.trim()
        ? [{ name: "google-site-verification", content: settings.googleSiteVerification.trim() }]
        : typeof import.meta !== "undefined" && import.meta.env?.VITE_GOOGLE_SITE_VERIFICATION
          ? [{ name: "google-site-verification", content: import.meta.env.VITE_GOOGLE_SITE_VERIFICATION }]
          : []),
      ...socialMeta({ title, description, url }),
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "fa-IR", href: url },
      { rel: "alternate", hrefLang: "x-default", href: url },
    ],
  };
}

export function propertyPageTitle(property: Property): string {
  const tx = TX_LABEL[property.transactionType] ?? "";
  const type = TYPE_LABEL[property.propertyType] ?? "";
  return `${property.title} | ${tx} ${type} در ${property.neighborhood} | ${SITE.shortName}`;
}

export function propertyPageDescription(property: Property): string {
  const tx = TX_LABEL[property.transactionType] ?? "معامله";
  const type = TYPE_LABEL[property.propertyType] ?? "ملک";
  const area = property.areaM2 ? `، ${property.areaM2} متر` : "";
  const beds = property.bedrooms ? `، ${property.bedrooms} خواب` : "";
  const body = property.description.replace(/\s+/g, " ").trim();
  const lead = `${tx} ${type} در ${property.neighborhood}، اصفهان${area}${beds}.`;
  // Keep the opening sentence factual and first: it is what a search result
  // shows, and a truncated tail of ad copy reads worse than the essentials.
  const base = body ? `${lead} ${body}` : lead;
  return base.length > 160 ? base.slice(0, 157).trimEnd() + "…" : base;
}

export function propertyHead(property: Property | null, slug: string) {
  if (!property) {
    const title = `فایل یافت نشد | ${SITE.nameFa}`;
    return {
      meta: [
        { title },
        { name: "description", content: "این فایل دیگر در دسترس نیست." },
        { name: "robots", content: "noindex, follow" },
      ],
      links: [{ rel: "canonical", href: absoluteUrl(`/properties/${slug}`) }],
    };
  }

  const title = propertyPageTitle(property);
  const description = propertyPageDescription(property);
  const url = absoluteUrl(propertyPath(property));
  const image = propertySocialImage(property);

  return {
    meta: [
      { title },
      { name: "description", content: description },
      {
        name: "keywords",
        content: `${property.title}, ${TYPE_LABEL[property.propertyType] ?? ""} ${property.neighborhood}, املاک ${property.neighborhood}, ${TX_LABEL[property.transactionType] ?? ""} اصفهان, املاک هیرمند`,
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "geo.region", content: "IR-04" },
      { name: "geo.placename", content: property.neighborhood },
      ...socialMeta({ title, description, url, image, type: "article" }),
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "fa-IR", href: url },
    ],
  };
}

export function trackingHead() {
  const title = `ثبت قرارداد و کد رهگیری | ${SITE.nameFa}`;
  const description =
    "سامانه باشگاه همکاران هیرمند؛ ورود امن املاک، ثبت قرارداد، دریافت کد رهگیری و مشاهده وضعیت مهرها و پاداش ثبت رایگان.";
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex, follow" },
      ...socialMeta({ title, description, url: absoluteUrl("/tracking") }),
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/tracking") }],
  };
}

export function propertyJsonLd(property: Property) {
  const url = absoluteUrl(propertyPath(property));
  const image = property.images.map(shareableImageUrl).filter(Boolean);
  const availabilityByStatus: Record<Property["availabilityStatus"], string> = {
    available: "https://schema.org/InStock",
    reserved: "https://schema.org/LimitedAvailability",
    sold: "https://schema.org/SoldOut",
    rented: "https://schema.org/OutOfStock",
    unavailable: "https://schema.org/OutOfStock",
  };
  const offers: Record<string, unknown> = {
    "@type": "Offer",
    availability: availabilityByStatus[property.availabilityStatus],
    priceCurrency: "IRR",
    url,
    seller: {
      "@type": "RealEstateAgent",
      name: SITE.nameFa,
      telephone: property.contactPhone.replace(/^0/, "+98"),
    },
  };

  if (property.price) {
    const tomanPrice = Number(property.price);
    offers.price =
      Number.isFinite(tomanPrice) && tomanPrice > 0
        ? String(Math.round(tomanPrice * 10))
        : property.price;
  }

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    name: property.title,
    description: property.description,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    identifier: {
      "@type": "PropertyValue",
      propertyID: fileCodeForSeo(property.id),
      name: "کد فایل هیرمند",
    },
    datePosted: property.publishedAt ?? property.createdAt,
    dateModified: property.updatedAt ?? property.publishedAt ?? property.createdAt,
    image: image.length ? image : [propertySocialImage(property)],
    inLanguage: "fa-IR",
    address: {
      "@type": "PostalAddress",
      addressLocality: property.city || SITE.locality,
      addressRegion: "اصفهان",
      addressCountry: "IR",
      // Keep exact property addresses out of public structured data; the detail UI exposes only the neighborhood/approximate area.
      streetAddress: property.neighborhood,
    },
    ...(property.areaM2
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: property.areaM2,
            unitCode: "MTK",
          },
        }
      : {}),
    ...(property.bedrooms != null
      ? { numberOfRooms: property.bedrooms, numberOfBedrooms: property.bedrooms }
      : {}),
    ...(property.bathrooms != null ? { numberOfBathroomsTotal: property.bathrooms } : {}),
    ...(property.floor != null ? { floorLevel: String(property.floor) } : {}),
    ...(property.builtYear != null ? { yearBuilt: property.builtYear } : {}),
    ...(property.features.length
      ? {
          amenityFeature: property.features.slice(0, 20).map((feature) => ({
            "@type": "LocationFeatureSpecification",
            name: feature,
            value: true,
          })),
        }
      : {}),
    offers,
    provider: {
      "@id": `${SITE.url}#organization`,
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function enhancedOrganizationJsonLd(settings?: SiteSettings) {
  const description = settings?.siteDescription?.trim() || SITE.description;
  const address = settings?.address?.trim() || SITE.address;
  const mobile = settings?.phoneMobile?.trim() || SITE.phone.mobile;
  const office = settings?.phoneOffice?.trim() || SITE.phone.office;
  const sameAs = [
    settings?.instagramUrl?.trim() || SITE.instagram,
    settings?.telegramUrl?.trim() || SITE.telegram,
    settings?.eitaaUrl?.trim() || SITE.eitaa,
    settings?.whatsappUrl?.trim() || SITE.whatsappDirect,
  ].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["RealEstateAgent", "LocalBusiness"],
        "@id": `${SITE.url}#organization`,
        name: SITE.nameFa,
        alternateName: ["Hirmand Real Estate", "Hirmand Real Estate Consultants", "املاک هیرمند"],
        url: SITE.url,
        logo: absoluteUrl("/images/hirmand-logo.png"),
        image: [absoluteUrl("/images/hirmand-logo.png"), ogImageUrl()],
        founder: { "@type": "Person", name: "آقای شیخ" },
        telephone: [
          `+98${mobile.replace(/^0/, "")}`,
          `+98${office.replace(/^0/, "")}`,
          "+989183576883",
        ],
        description,
        slogan: `${SITE.sloganStrong} ${SITE.sloganRest}`,
        address: {
          "@type": "PostalAddress",
          streetAddress: address.replace(/^اصفهان،\s*/,""),
          addressLocality: SITE.locality,
          addressRegion: "اصفهان",
          addressCountry: "IR",
        },
        hasMap: SITE.mapUrl,
        areaServed: [
          { "@type": "City", name: "اصفهان" },
          { "@type": "AdministrativeArea", name: "استان اصفهان" },
        ],
        contactPoint: [
          {
            "@type": "ContactPoint",
            telephone: "+989131056029",
            contactType: "customer service",
            availableLanguage: ["Persian", "fa"],
            areaServed: "IR",
          },
          {
            "@type": "ContactPoint",
            telephone: "+983137850615",
            contactType: "customer service",
            availableLanguage: ["fa"],
          },
        ],
        employee: TEAM.map((person) => ({
          "@type": "Person",
          name: person.name,
          jobTitle: person.role,
          telephone: `+98${person.phone.slice(1)}`,
        })),
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}#website`,
        url: SITE.url,
        name: SITE.nameFa,
        description,
        inLanguage: "fa-IR",
        publisher: { "@id": `${SITE.url}#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE.url}/properties?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export { TX_LABEL, TYPE_LABEL };
