import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { isValidTrackingCode, normalizeTrackingCode } from "@/lib/partner-codes";
import { lookupPartnerContract } from "@/lib/partner-program.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const body = (await readBody(event).catch(() => ({}))) as { trackingCode?: unknown };
  const code = typeof body.trackingCode === "string" ? normalizeTrackingCode(body.trackingCode) : "";
  if (!code || code.length > 32 || !isValidTrackingCode(code)) {
    throw createError({ statusCode: 400, statusMessage: "کد رهگیری را وارد کنید." });
  }
  const result = await lookupPartnerContract(code);
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: "کد رهگیری پیدا نشد." });
  }
  return result;
});
