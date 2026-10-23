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

  const sql = await getSql();
  const rows = await sql.query<{ renditions?: unknown }>(
    "select renditions from property_video_renditions where source_url = $1 limit 1",
    [sourceUrl],
  );
  const value = rows[0]?.renditions;
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
