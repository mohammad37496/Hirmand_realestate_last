import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

export type SiteSettings = {
  siteTitle: string;
  siteDescription: string;
  seoKeywords: string;
  googleSiteVerification: string;
  noindex: boolean;
  announcementEnabled: boolean;
  announcementText: string;
  phoneMobile: string;
  phoneOffice: string;
  whatsappUrl: string;
  instagramUrl: string;
  telegramUrl: string;
  eitaaUrl: string;
  address: string;
  officeHours: string;
  footerTagline: string;
  updatedAt: string | null;
};

const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: "املاک هیرمند | خرید، فروش، رهن و اجاره ملک در اصفهان",
  siteDescription: "گروه مشاورین املاک هیرمند در اصفهان؛ خرید، فروش، رهن و اجاره آپارتمان، ویلا، زمین، اداری و تجاری با مشاوره تخصصی و همراهی از انتخاب تا قرارداد.",
  seoKeywords: "املاک اصفهان, املاک هیرمند, خرید خانه اصفهان, فروش آپارتمان اصفهان, رهن و اجاره اصفهان",
  googleSiteVerification: "",
  noindex: false,
  announcementEnabled: false,
  announcementText: "",
  phoneMobile: "09131056029",
  phoneOffice: "03137850615",
  whatsappUrl: "https://wa.me/989131056029",
  instagramUrl: "https://www.instagram.com/hirmand.realestate/",
  telegramUrl: "https://t.me/Hirmand_realestate",
  eitaaUrl: "https://eitaa.com/Hirmand_realestate",
  address: "اصفهان، سه راه سیمین، خیابان جانبازان، بلوار شهید بخشی",
  officeHours: "",
  footerTagline: "همراه شما برای انتخاب خانه‌ای بهتر",
  updatedAt: null,
};

async function requireAdminAsync() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "settings.manage")) {
    throw new Error("سطح دسترسی تنظیمات برای این حساب فعال نیست.");
  }
}

function mapRow(row: Record<string, unknown>): SiteSettings {
  return {
    siteTitle: String(row.site_title ?? DEFAULT_SETTINGS.siteTitle),
    siteDescription: String(row.site_description ?? DEFAULT_SETTINGS.siteDescription),
    seoKeywords: String(row.seo_keywords ?? DEFAULT_SETTINGS.seoKeywords),
    googleSiteVerification: String(row.google_site_verification ?? ""),
    noindex: Boolean(row.noindex),
    announcementEnabled: Boolean(row.announcement_enabled),
    announcementText: String(row.announcement_text ?? ""),
    phoneMobile: String(row.phone_mobile ?? DEFAULT_SETTINGS.phoneMobile),
    phoneOffice: String(row.phone_office ?? DEFAULT_SETTINGS.phoneOffice),
    whatsappUrl: String(row.whatsapp_url ?? ""),
    instagramUrl: String(row.instagram_url ?? ""),
    telegramUrl: String(row.telegram_url ?? ""),
    eitaaUrl: String(row.eitaa_url ?? ""),
    address: String(row.address ?? ""),
    officeHours: String(row.office_hours ?? ""),
    footerTagline: String(row.footer_tagline ?? ""),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

export const getPublicSiteSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    if (dbSource === "unconfigured") return DEFAULT_SETTINGS;
    try {
      const sql = await getSql();
      const rows = await sql.query<Record<string, unknown>>(
        `select *
         from site_settings
         where id = 1
         limit 1`,
      );
      return rows[0] ? mapRow(rows[0]) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

export const getAdminSiteSettings = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireAdminAsync();
    if (dbSource === "unconfigured") return DEFAULT_SETTINGS;
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select *
       from site_settings
       where id = 1
       limit 1`,
    );
    return rows[0] ? mapRow(rows[0]) : DEFAULT_SETTINGS;
  });

export const updateAdminSiteSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      siteTitle: z.string().trim().min(10).max(180),
      siteDescription: z.string().trim().min(30).max(320),
      seoKeywords: z.string().trim().max(1200),
      googleSiteVerification: z.string().trim().max(300),
      noindex: z.boolean(),
      announcementEnabled: z.boolean(),
      announcementText: z.string().trim().max(500),
      phoneMobile: z.string().trim().max(30),
      phoneOffice: z.string().trim().max(30),
      whatsappUrl: z.string().trim().max(500),
      instagramUrl: z.string().trim().max(500),
      telegramUrl: z.string().trim().max(500),
      eitaaUrl: z.string().trim().max(500),
      address: z.string().trim().max(500),
      officeHours: z.string().trim().max(300),
      footerTagline: z.string().trim().max(300),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdminAsync();
    if (dbSource === "unconfigured") return { ...data, updatedAt: null } as SiteSettings;
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into site_settings (
        id, site_title, site_description, seo_keywords, google_site_verification,
        noindex, announcement_enabled, announcement_text,
        phone_mobile, phone_office, whatsapp_url, instagram_url, telegram_url, eitaa_url,
        address, office_hours, footer_tagline, updated_at
      ) values (
        1, $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, current_timestamp
      )
      on conflict (id) do update set
        site_title = excluded.site_title,
        site_description = excluded.site_description,
        seo_keywords = excluded.seo_keywords,
        google_site_verification = excluded.google_site_verification,
        noindex = excluded.noindex,
        announcement_enabled = excluded.announcement_enabled,
        announcement_text = excluded.announcement_text,
        phone_mobile = excluded.phone_mobile,
        phone_office = excluded.phone_office,
        whatsapp_url = excluded.whatsapp_url,
        instagram_url = excluded.instagram_url,
        telegram_url = excluded.telegram_url,
        eitaa_url = excluded.eitaa_url,
        address = excluded.address,
        office_hours = excluded.office_hours,
        footer_tagline = excluded.footer_tagline,
        updated_at = current_timestamp
      returning *`,
      [
        data.siteTitle,
        data.siteDescription,
        data.seoKeywords,
        data.googleSiteVerification,
        data.noindex,
        data.announcementEnabled,
        data.announcementText,
        data.phoneMobile,
        data.phoneOffice,
        data.whatsappUrl,
        data.instagramUrl,
        data.telegramUrl,
        data.eitaaUrl,
        data.address,
        data.officeHours,
        data.footerTagline,
      ],
    );
    return mapRow(rows[0]);
  });
