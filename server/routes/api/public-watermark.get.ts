import { defineEventHandler, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";

const DEFAULTS = {
  enabled: true,
  showLogo: true,
  showText: true,
  text: "املاک هیرمند",
  opacity: 0.82,
  size: 1,
};

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "public, max-age=60, stale-while-revalidate=300");
  if (dbSource === "unconfigured") return DEFAULTS;
  try {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "select enabled,show_logo,show_text,text,opacity,size from property_media_watermark_settings where id=1 limit 1",
    );
    const row = rows[0];
    if (!row) return DEFAULTS;
    return {
      enabled: row.enabled !== false,
      showLogo: row.show_logo !== false,
      showText: row.show_text !== false,
      text: typeof row.text === "string" && row.text.trim() ? row.text.trim().slice(0, 80) : DEFAULTS.text,
      opacity: Math.min(1, Math.max(0.2, Number(row.opacity) || DEFAULTS.opacity)),
      size: Math.min(1.6, Math.max(0.6, Number(row.size) || DEFAULTS.size)),
    };
  } catch {
    return DEFAULTS;
  }
});
