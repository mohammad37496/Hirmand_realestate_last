import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  await enforcePhoneBridgeRateLimit(event, "update-check", "public", {
    windowMs: 10 * 60 * 1000,
    maxHits: 30,
    blockMs: 10 * 60 * 1000,
  });

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "اطلاعات بروزرسانی Phone Bridge در دسترس نیست." });
  }

  const query = getQuery(event);
  const currentVersionCode = Number(query.versionCode ?? 0);
  if (!Number.isInteger(currentVersionCode) || currentVersionCode < 0 || currentVersionCode > 1000000) {
    throw createError({ statusCode: 400, statusMessage: "versionCode نامعتبر است." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select version_name,version_code,download_url,release_notes,force_update,updated_at
     from phone_bridge_release_settings where id=1 limit 1`,
  );
  const row = rows[0];

  const latestVersionCode = Number(row?.version_code ?? 20);
  const updateAvailable = latestVersionCode > currentVersionCode;
  const forceUpdate = updateAvailable && Boolean(row?.force_update);
  const downloadUrl = String(row?.download_url ?? "");

  return {
    ok: true,
    currentVersionCode,
    latest: {
      versionName: String(row?.version_name ?? "0.2.0"),
      versionCode: latestVersionCode,
      downloadUrl,
      releaseNotes: String(row?.release_notes ?? ""),
      forceUpdate,
      publishedAt: row?.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    },
    updateAvailable,
  };
});
