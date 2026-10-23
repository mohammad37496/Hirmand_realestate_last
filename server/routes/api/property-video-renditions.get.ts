import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";

type RenditionMap = Record<string, unknown>;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const query = getQuery(event);
  const sourceUrl = typeof query.src === "string" ? query.src.trim() : "";

  if (
    !sourceUrl ||
    sourceUrl.length > 8192 ||
    !(sourceUrl.startsWith("/") || /^https:\/\//i.test(sourceUrl))
  ) {
    throw createError({ statusCode: 400, statusMessage: "آدرس ویدئو معتبر نیست." });
  }

  if (dbSource === "unconfigured") {
    return { available: false, renditions: {} };
  }

  // Older property records may store the raw Liara URL while the browser uses
  // the same-origin proxy (or vice versa). Try both equivalent forms so the
  // quality manifest is not silently missed because of URL representation.
  const sourceCandidates = new Set([sourceUrl]);
  try {
    const parsedSource = new URL(sourceUrl, "https://hirmand.invalid");
    if (parsedSource.origin === "https://hirmand.invalid" && parsedSource.pathname === "/api/liara-media") {
      const target = parsedSource.searchParams.get("url");
      if (target && /^https:\/\//i.test(target)) sourceCandidates.add(target);
    } else if (/^https:\/\//i.test(sourceUrl)) {
      const proxy = "/api/liara-media?url=" + encodeURIComponent(sourceUrl) + "&type=video";
      sourceCandidates.add(proxy);
    }
  } catch {
    // The original validation above already rejects malformed source URLs.
  }

  const sql = await getSql();
  let value: unknown;
  for (const candidate of sourceCandidates) {
    const rows = await sql.query<{ renditions?: unknown }>(
      "select renditions from property_video_renditions where source_url = $1 limit 1",
      [candidate],
    );
    if (rows[0]?.renditions != null) {
      value = rows[0].renditions;
      break;
    }
  }
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { available: false, renditions: {} };
  }

  const record = parsed as RenditionMap;
  const renditions: Record<string, string> = {};
  for (const quality of ["480", "720", "1080"] as const) {
    const url = record[quality];
    if (typeof url === "string" && url.length <= 8192) renditions[quality] = url;
  }

  return {
    available: Object.keys(renditions).length > 0,
    renditions,
    processing: record.processing === true,
  };
});
