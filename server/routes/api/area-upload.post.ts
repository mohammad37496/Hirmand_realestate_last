import { createError, defineEventHandler, getCookie } from "h3";
import { handleChunkedUpload } from "@/lib/chunked-upload.server";
import { mediaUrlForBrowser } from "@/lib/media-store.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function mimeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "";
}

export default defineEventHandler(async (event) => {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }

  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "area.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی آپلود تصاویر محله‌ها برای این حساب فعال نیست." });
  }

  assertSameOrigin(event);
  return handleChunkedUpload(event, {
    kind: "media",
    pathPrefix: "areas/uploads",
    maxBytes: MAX_BYTES,
    resolveContentType: ({ filename, declared }) => {
      if (ALLOWED.has(declared)) return declared;
      const derived = mimeFromFilename(filename);
      return ALLOWED.has(derived) ? derived : null;
    },
    unsupportedTypeMessage: "فقط تصاویر JPG، PNG، WebP، GIF و AVIF پذیرفته می‌شوند.",
    sizeLimitMessage: (limitMb) => "حجم تصویر بیش از " + limitMb + " مگابایت است.",
    finish: async ({ stored, session }) => ({
      url: mediaUrlForBrowser(stored.url, String(session.content_type ?? "")),
    }),
  });
});
