import { dbSource, getSql } from "@/lib/db";
import { DEFAULT_PROPERTY_WATERMARK, type PropertyWatermarkSettings } from "@/lib/property-watermark";

export async function getPropertyWatermarkSettingsServer(): Promise<PropertyWatermarkSettings> {
  if (dbSource === "unconfigured") return DEFAULT_PROPERTY_WATERMARK;

  try {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "select enabled,show_logo,show_text,text,opacity,size from property_media_watermark_settings where id=1 limit 1",
    );
    const row = rows[0];
    if (!row) return DEFAULT_PROPERTY_WATERMARK;

    return {
      enabled: row.enabled !== false,
      showLogo: row.show_logo !== false,
      showText: row.show_text !== false,
      text:
        typeof row.text === "string" && row.text.trim()
          ? row.text.trim().slice(0, 80)
          : DEFAULT_PROPERTY_WATERMARK.text,
      opacity: Number.isFinite(Number(row.opacity))
        ? Math.min(1, Math.max(0.2, Number(row.opacity)))
        : DEFAULT_PROPERTY_WATERMARK.opacity,
      size: Number.isFinite(Number(row.size))
        ? Math.min(1.6, Math.max(0.6, Number(row.size)))
        : DEFAULT_PROPERTY_WATERMARK.size,
    };
  } catch {
    return DEFAULT_PROPERTY_WATERMARK;
  }
}
