import { createError, defineEventHandler, getCookie } from "h3";
import { handleChunkedUpload } from "@/lib/chunked-upload.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { getPropertyWatermarkSettingsServer } from "@/lib/property-watermark.server";
import { applyPropertyImageWatermarkServer } from "@/lib/property-image-watermark.server";
import { applyPropertyVideoWatermark } from "@/lib/property-video-watermark.server";

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

  // Per-request diagnostic. When permanent watermarking cannot run (missing
  // FFmpeg/font/logo, or an FFmpeg filter error) the upload must still succeed,
  // but the operator is told that the original bytes were stored instead. It is
  // deliberately not a silent fallback: the reason is logged server-side and the
  // fact is returned to the admin panel.
  let watermarkWarning: string | null = null;

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
      transform: async ({ data, contentType, pathname }) => {
        if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) return null;

        const settings = await getPropertyWatermarkSettingsServer();
        if (
          !settings.enabled ||
          (!settings.showLogo && !(settings.showText && settings.text.trim()))
        ) {
          return null;
        }

        try {
          if (contentType.startsWith("image/")) {
            return applyPropertyImageWatermarkServer({
              data,
              contentType,
              pathname,
              settings,
            });
          }

          return applyPropertyVideoWatermark({
            data,
            contentType,
            pathname,
            settings,
          });
        } catch (error) {
          // If watermarking fails because ffmpeg, the font, the logo or a filter
          // is unavailable, store the original file instead of failing the upload
          // with HTTP 500. The failure is logged at error level (not buried in a
          // warning) and reported to the caller so the operator knows the media
          // is live without the brand watermark.
          console.error(
            "[upload] permanent media watermark failed for " +
              contentType +
              " at " +
              pathname +
              " — " +
              (error instanceof Error ? error.message : String(error))
          );
          watermarkWarning =
            "فایل ذخیره شد، اما واترمارک دائمی روی آن اعمال نشد و نسخه اصلی نگه داشته شد.";
          return null;
        }
      },
      finish: async ({ stored }) => ({
        url: stored.url,
        ...(watermarkWarning ? { watermarkWarning } : {}),
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
