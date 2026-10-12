import { createError, defineEventHandler, getCookie } from "h3";
import { handleChunkedUpload } from "@/lib/chunked-upload.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import {
  ALLOWED_AUDIO_TYPE_SET,
  AUDIO_CHUNK_BYTES,
  MAX_AUDIO_BYTES,
  insertMusicTrack,
  mimeFromFilename,
} from "@/lib/music-library.server";

/**
 * Chunked audio upload for the admin music library.
 *
 * The browser posts the song in slices and reports progress from the bytes it
 * actually sent, so the button never sits at 0% while an external store is
 * being contacted, and a stuck upload always ends in a message that names the
 * failing step.
 */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "content.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی آپلود موسیقی برای این حساب فعال نیست." });
  }
  assertSameOrigin(event);
  return handleChunkedUpload(event, {
    kind: "audio",
    pathPrefix: "music",
    maxBytes: MAX_AUDIO_BYTES,
    chunkSize: AUDIO_CHUNK_BYTES,
    resolveContentType: ({ filename, declared }) => {
      if (ALLOWED_AUDIO_TYPE_SET.has(declared)) return declared;
      const derived = mimeFromFilename(filename);
      return ALLOWED_AUDIO_TYPE_SET.has(derived) ? derived : null;
    },
    unsupportedTypeMessage:
      "فرمت فایل صوتی پشتیبانی نمی‌شود. MP3، OGG، WAV، M4A یا AAC انتخاب کنید.",
    sizeLimitMessage: (limitMb) =>
      `حجم فایل موسیقی باید کمتر از ${limitMb} مگابایت باشد. برای آهنگ طولانی‌تر، فایل را با نرخ بیت پایین‌تر یا فرمت فشرده‌تر آماده کنید.`,
    textFields: [
      { column: "title", label: "عنوان آهنگ", required: true, maxLength: 160 },
      { column: "artist", label: "نام هنرمند", maxLength: 120 },
    ],
    finish: async ({ stored, session, text, totalBytes }) => {
      const track = await insertMusicTrack({
        title: text.title.trim() || "آهنگ بدون عنوان",
        artist: text.artist.trim(),
        url: stored.url,
        mimeType: String(session.content_type),
        sizeBytes: totalBytes,
      });
      return { track };
    },
  });
});
