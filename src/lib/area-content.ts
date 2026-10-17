import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { allAreas, findAreaBySlug, type AreaInfo } from "@/lib/areas";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";

export type AreaContent = {
  slug: string;
  name: string;
  groupTitle: string;
  intro: string;
  about: string;
  highlights: string;
  amenities: string;
  transportation: string;
  marketNote: string;
  heroImage: string;
  gallery: string[];
  seoTitle: string;
  seoDescription: string;
  isPublished: boolean;
  updatedAt: string | null;
};

export type AreaContentDraft = Pick<
  AreaContent,
  | "slug"
  | "intro"
  | "about"
  | "highlights"
  | "amenities"
  | "transportation"
  | "marketNote"
  | "heroImage"
  | "gallery"
  | "seoTitle"
  | "seoDescription"
  | "isPublished"
>;

function emptyContent(area: AreaInfo): AreaContent {
  return {
    slug: area.slug,
    name: area.name,
    groupTitle: area.groupTitle,
    intro: "",
    about: "",
    highlights: "",
    amenities: "",
    transportation: "",
    marketNote: "",
    heroImage: "",
    gallery: [],
    seoTitle: "",
    seoDescription: "",
    isPublished: false,
    updatedAt: null,
  };
}

function parseGallery(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 24);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 24);
    } catch {
      return [];
    }
  }
  return [];
}

function mapContent(area: AreaInfo, row?: Record<string, unknown>): AreaContent {
  if (!row) return emptyContent(area);
  return {
    slug: area.slug,
    name: area.name,
    groupTitle: area.groupTitle,
    intro: String(row.intro ?? ""),
    about: String(row.about ?? ""),
    highlights: String(row.highlights ?? ""),
    amenities: String(row.amenities ?? ""),
    transportation: String(row.transportation ?? ""),
    marketNote: String(row.market_note ?? ""),
    heroImage: String(row.hero_image ?? ""),
    gallery: parseGallery(row.gallery),
    seoTitle: String(row.seo_title ?? ""),
    seoDescription: String(row.seo_description ?? ""),
    isPublished: Boolean(row.is_published),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

function safeAssetUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return true;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function requireAreaManager() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "area.manage")) throw new Error("دسترسی مدیریت اطلاعات محله‌ها برای این حساب فعال نیست.");
  return claims;
}

/** Publicly exposes only explicitly published neighborhood editorial content. */
export const getPublicAreaContent = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(220) }))
  .handler(async ({ data }): Promise<AreaContent | null> => {
    const area = findAreaBySlug(data.slug);
    if (!area || dbSource === "unconfigured") return null;
    try {
      const sql = await getSql();
      const rows = await sql.query<Record<string, unknown>>(
        "select * from area_contents where slug = $1 and is_published = true limit 1",
        [area.slug],
      );
      return rows[0] ? mapContent(area, rows[0]) : null;
    } catch (error) {
      // A missing or temporarily unavailable content table must not take down existing neighborhood pages.
      console.error("[area-content] public read failed", error instanceof Error ? error.message : error);
      return null;
    }
  });

/** Lists the complete neighborhood catalog, including areas with no written content yet. */
export const getAdminAreaContents = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requireAreaManager();
    const catalog = allAreas();
    if (dbSource === "unconfigured") {
      return { databaseConfigured: false, areas: catalog.map((area) => emptyContent(area)) };
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "select * from area_contents order by updated_at desc",
    );
    const bySlug = new Map(rows.map((row) => [String(row.slug ?? ""), row]));
    return {
      databaseConfigured: true,
      areas: catalog.map((area) => mapContent(area, bySlug.get(area.slug))),
    };
  });

const saveSchema = z.object({
  slug: z.string().trim().min(1).max(220),
  intro: z.string().trim().max(600),
  about: z.string().trim().max(12000),
  highlights: z.string().trim().max(6000),
  amenities: z.string().trim().max(6000),
  transportation: z.string().trim().max(6000),
  marketNote: z.string().trim().max(6000),
  heroImage: z.string().trim().max(2000),
  gallery: z.array(z.string().trim().min(1).max(2000)).max(24),
  seoTitle: z.string().trim().max(180),
  seoDescription: z.string().trim().max(320),
  isPublished: z.boolean(),
});

export const saveAdminAreaContent = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    await requireAreaManager();
    if (dbSource === "unconfigured") throw new Error("برای ذخیره اطلاعات محله‌ها، اتصال پایگاه داده باید فعال باشد.");
    const area = findAreaBySlug(data.slug);
    if (!area || area.slug !== data.slug) throw new Error("محله انتخاب‌شده در فهرست رسمی سایت پیدا نشد.");

    const gallery = Array.from(new Set(data.gallery.map((item) => item.trim()).filter(Boolean))).slice(0, 24);
    if (!safeAssetUrl(data.heroImage) || gallery.some((item) => !safeAssetUrl(item))) {
      throw new Error("نشانی تصویر باید یک لینک HTTP/HTTPS یا مسیر داخلی سایت باشد.");
    }

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "insert into area_contents (slug, area_name, group_title, intro, about, highlights, amenities, transportation, market_note, hero_image, gallery, seo_title, seo_description, is_published, updated_at) " +
      "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,current_timestamp) " +
      "on conflict (slug) do update set area_name=excluded.area_name, group_title=excluded.group_title, intro=excluded.intro, about=excluded.about, highlights=excluded.highlights, amenities=excluded.amenities, transportation=excluded.transportation, market_note=excluded.market_note, hero_image=excluded.hero_image, gallery=excluded.gallery, seo_title=excluded.seo_title, seo_description=excluded.seo_description, is_published=excluded.is_published, updated_at=current_timestamp " +
      "returning *",
      [
        area.slug,
        area.name,
        area.groupTitle,
        data.intro,
        data.about,
        data.highlights,
        data.amenities,
        data.transportation,
        data.marketNote,
        data.heroImage,
        JSON.stringify(gallery),
        data.seoTitle,
        data.seoDescription,
        data.isPublished,
      ],
    );

    await writeAdminAuditLog({
      action: "area_content_saved",
      entityType: "neighborhood_content",
      entityId: area.slug,
      entityTitle: area.name,
      metadata: { published: data.isPublished, galleryCount: gallery.length },
    });

    return mapContent(area, rows[0]);
  });
