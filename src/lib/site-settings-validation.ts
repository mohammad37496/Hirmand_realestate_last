import { z } from "zod";

const optionalHttpsUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "لینک باید یک نشانی کامل و معتبر HTTPS باشد یا خالی بماند.");

export const siteSettingsInputSchema = z.object({
  siteTitle: z.string().trim().min(10).max(180),
  siteDescription: z.string().trim().min(30).max(320),
  seoKeywords: z.string().trim().max(1200),
  googleSiteVerification: z.string().trim().max(300),
  noindex: z.boolean(),
  announcementEnabled: z.boolean(),
  announcementText: z.string().trim().max(500),
  phoneMobile: z.string().trim().max(30),
  phoneOffice: z.string().trim().max(30),
  whatsappUrl: optionalHttpsUrl,
  instagramUrl: optionalHttpsUrl,
  telegramUrl: optionalHttpsUrl,
  eitaaUrl: optionalHttpsUrl,
  address: z.string().trim().max(500),
  officeHours: z.string().trim().max(300),
  footerTagline: z.string().trim().max(300),
});
