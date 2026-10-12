import {
  createError,
  defineEventHandler,
  getCookie,
  readBody,
  setResponseHeader,
} from "h3";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { deleteStoredMedia } from "@/lib/media-store.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import {
  ALLOWED_AUDIO_TYPE_SET,
  MAX_AUDIO_BYTES,
  insertMusicTrack,
  isPlayableMediaUrl,
  mapTrackRow,
  normalizeStoredMediaUrl,
} from "@/lib/music-library.server";

type Action = "list" | "create" | "toggle" | "delete" | "reorder";

type Body = {
  action?: Action;
  id?: string;
  active?: boolean;
  title?: string;
  artist?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  ids?: unknown;
};

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const body = (await readBody(event)) as Body;

  if (!await verifyAdminSessionToken(getCookie(event, ADMIN_SESSION_COOKIE))) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }

  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "content.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت موسیقی برای این حساب فعال نیست." });
  }

  if (dbSource === "unconfigured") {
    if (body.action === "list") return { tracks: [] };
    throw createError({
      statusCode: 503,
      statusMessage: "پایگاه داده برای مدیریت موسیقی تنظیم نشده است.",
    });
  }

  const sql = await getSql();
  const action = body.action ?? "list";

  if (action === "list") {
    const rows = await sql.query<Record<string, unknown>>(
      `select id, title, artist, url, mime_type, size_bytes, active, position, created_at
       from music_tracks order by position asc, created_at desc`,
    );
    return { tracks: rows.map(mapTrackRow) };
  }

  if (action === "create") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    const sizeBytes = Number(body.sizeBytes) || 0;

    if (!title || title.length > 160) {
      throw createError({ statusCode: 400, statusMessage: "عنوان آهنگ نامعتبر است." });
    }
    if (artist.length > 120) {
      throw createError({ statusCode: 400, statusMessage: "نام هنرمند نامعتبر است." });
    }

    const url = normalizeStoredMediaUrl(rawUrl);
    if (!isPlayableMediaUrl(url)) {
      throw createError({
        statusCode: 400,
        statusMessage: "نشانی فایل موسیقی قابل پخش نیست.",
      });
    }
    if (!ALLOWED_AUDIO_TYPE_SET.has(mimeType)) {
      throw createError({ statusCode: 400, statusMessage: "نوع فایل صوتی نامعتبر است." });
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_AUDIO_BYTES) {
      throw createError({ statusCode: 400, statusMessage: "حجم فایل صوتی نامعتبر است." });
    }

    const track = await insertMusicTrack({ title, artist, url, mimeType, sizeBytes });
    return { track };
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    if (ids.length < 2 || ids.length > 500) {
      throw createError({
        statusCode: 400,
        statusMessage: "فهرست ترتیب آهنگ‌ها نامعتبر است.",
      });
    }

    // Positions are rewritten from the submitted order, so the public playlist
    // plays exactly what the admin arranged — and old rows that share a
    // position (the default of every insert) get distinct values too.
    for (let index = 0; index < ids.length; index += 1) {
      await sql.query(
        "update music_tracks set position = $2, updated_at = current_timestamp where id = $1",
        [ids[index], index],
      );
    }

    const rows = await sql.query<Record<string, unknown>>(
      `select id, title, artist, url, mime_type, size_bytes, active, position, created_at
       from music_tracks order by position asc, created_at desc`,
    );
    return { tracks: rows.map(mapTrackRow) };
  }

  if (!body.id) {
    throw createError({ statusCode: 400, statusMessage: "شناسه آهنگ مشخص نیست." });
  }

  if (action === "toggle") {
    await sql.query(
      "update music_tracks set active = $2, updated_at = current_timestamp where id = $1",
      [body.id, body.active === true],
    );
    return { success: true };
  }

  if (action === "delete") {
    const rows = await sql.query<{ url: string }>(
      "select url from music_tracks where id = $1 limit 1",
      [body.id],
    );
    await sql.query("delete from music_tracks where id = $1", [body.id]);
    await deleteStoredMedia(
      rows[0]?.url ? normalizeStoredMediaUrl(rows[0].url) : null,
    );
    return { success: true };
  }

  throw createError({
    statusCode: 400,
    statusMessage: "عملیات مدیریت موسیقی نامعتبر است.",
  });
});
