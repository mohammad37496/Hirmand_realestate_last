import { createError, defineEventHandler, getCookie } from "h3";
import { handleChunkedUpload } from "@/lib/chunked-upload.server";
import { mediaUrlForBrowser } from "@/lib/media-store.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function mimeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "";
}

/**
 * Property gallery uploads (photos and short clips) for the admin panel.
 * Same chunked protocol as the music library so both behave identically.
 */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (
    !hasAdminPermission(role, "property.manage") &&
    !hasAdminPermission(role, "property.create")
  ) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی آپلود رسانه برای فایل‌های ملک فعال نیست." });
  }
  assertSameOrigin(event);

  try {
    return await handleChunkedUpload(event, {
      kind: "media",
      pathPrefix: "properties/uploads",
      maxBytes: MAX_BYTES,
      resolveContentType: ({ filename, declared }) => {
        if (ALLOWED.has(declared)) return declared;
        const derived = mimeFromFilename(filename);
        return ALLOWED.has(derived) ? derived : null;
      },
      unsupportedTypeMessage: "نوع فایل رسانه‌ای مجاز نیست.",
      sizeLimitMessage: (limitMb) => `حجم فایل بیش از ${limitMb} مگابایت است.`,
      // No server-side watermarking: persist the uploaded media without logo/text overlays.
      transform: async () => null,
      finish: async ({ stored, session }) => ({
        url: mediaUrlForBrowser(stored.url, String(session.content_type ?? "")),
      }),
    });
  } catch (error) {
    // Also report failures that happen before the completion handler's own
    // storage/transform try block (for example database lookup/claim failures).
    console.error(
      `[upload] API request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
});
