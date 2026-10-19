import { defineEventHandler } from "h3";
import { handleChunkedUpload } from "@/lib/chunked-upload.server";
import { getPropertyWatermarkSettingsServer } from "@/lib/property-watermark.server";
import { applyPropertyImageWatermarkServer } from "@/lib/property-image-watermark.server";
import { applyPropertyVideoWatermark } from "@/lib/property-video-watermark.server";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif","video/mp4","video/webm","video/quicktime"]);

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

/** Public property-media uploads. The submission itself still remains pending until an admin approves it. */
export default defineEventHandler((event) => {
  // A watermark dependency/filter failure must never turn a customer upload into
  // an HTTP 500; keep the original and report the degradation in the response.
  let watermarkWarning: string | null = null;

  return handleChunkedUpload(event, {
    access: "public",
    kind: "customer-property-media",
    pathPrefix: "properties/customer-submissions",
    maxBytes: MAX_BYTES,
    resolveContentType: ({ filename, declared }) => {
      if (ALLOWED.has(declared)) return declared;
      const derived = mimeFromFilename(filename);
      return ALLOWED.has(derived) ? derived : null;
    },
    unsupportedTypeMessage: "نوع فایل رسانه‌ای مجاز نیست.",
    sizeLimitMessage: (limitMb) => `حجم هر فایل بیش از ${limitMb} مگابایت است.`,
    // Pending public submissions also use the permanent watermark pipeline so
    // approving a submission cannot expose a raw upload that bypassed the admin API.
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
          return await applyPropertyImageWatermarkServer({ data, contentType, pathname, settings });
        }

        return await applyPropertyVideoWatermark({ data, contentType, pathname, settings });
      } catch (error) {
        console.error(
          "[upload] permanent media watermark failed for customer submission " +
            contentType +
            " at " +
            pathname +
            " — " +
            (error instanceof Error ? error.message : String(error)),
        );
        watermarkWarning =
          "فایل ذخیره شد، اما واترمارک دائمی روی آن اعمال نشد و نسخه اصلی نگه داشته شد.";
        return null;
      }
    },
    finish: async ({ stored, session }) => ({
      url: stored.url + (String(session.content_type ?? "").startsWith("video/") ? "?type=video" : ""),
      ...(watermarkWarning ? { watermarkWarning } : {}),
    }),
  });
});
