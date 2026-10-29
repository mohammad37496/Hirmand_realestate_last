import assert from "node:assert/strict";
import { test } from "node:test";
import { siteSettingsInputSchema } from "./site-settings-validation.ts";

const validSettings = {
  siteTitle: "املاک هیرمند | خانه شما",
  siteDescription: "گروه مشاورین املاک هیرمند برای خرید و فروش و اجاره ملک در اصفهان.",
  seoKeywords: "املاک اصفهان",
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
  address: "اصفهان",
  officeHours: "",
  footerTagline: "همراه شما برای انتخاب خانه‌ای بهتر",
};

test("site settings accept valid HTTPS contact links and empty optional links", () => {
  assert.equal(siteSettingsInputSchema.safeParse(validSettings).success, true);
  assert.equal(siteSettingsInputSchema.safeParse({ ...validSettings, whatsappUrl: "", instagramUrl: "" }).success, true);
});

test("site settings reject unsafe, incomplete and non-HTTPS social links", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "//example.com/path", "instagram.com/hirmand", "http://example.com", "https://", "https://user:pass@example.com"]) {
    const result = siteSettingsInputSchema.safeParse({ ...validSettings, instagramUrl: url });
    assert.equal(result.success, false, `expected invalid URL to be rejected: ${url}`);
  }
});
