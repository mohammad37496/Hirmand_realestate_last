import { SITE } from "@/lib/site";

export function partnerPortalUrl(partnerCode: string, origin?: string) {
  const base =
    origin?.trim().replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : SITE.url.replace(/\/$/, ""));
  return base + "/tracking?code=" + encodeURIComponent(partnerCode.trim().toUpperCase());
}

export function partnerQrImageUrl(partnerCode: string, origin?: string) {
  const target = partnerPortalUrl(partnerCode, origin);
  return "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=" + encodeURIComponent(target);
}
