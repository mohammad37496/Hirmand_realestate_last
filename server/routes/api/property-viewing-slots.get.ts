import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { getPublicPropertyViewingSlots } from "@/lib/property-viewing-slots";

const querySchema = z.object({
  propertyId: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "تاریخ یا فایل بازدید نامعتبر است." });
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "ظرفیت بازدید در حال حاضر قابل بررسی نیست." });
  }

  const sql = await getSql();
  const result = await getPublicPropertyViewingSlots(sql, parsed.data.propertyId, parsed.data.date);
  if (result.kind === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "فایل مورد نظر در دسترس نیست." });
  }

  return { success: true, occupiedTimes: result.occupiedTimes, checkedAt: new Date().toISOString() };
});
