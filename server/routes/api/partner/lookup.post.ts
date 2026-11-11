import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { isValidTrackingCode, normalizeTrackingCode } from "@/lib/partner-codes";
import { lookupPartnerContract } from "@/lib/partner-program.server";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { TRACKING_TOKEN_MAX_LENGTH } from "@/lib/tracking-token";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("partner-tracking-lookup:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);
  const body = (await readBody(event).catch(() => ({}))) as { trackingCode?: unknown };
  const code = typeof body.trackingCode === "string" ? normalizeTrackingCode(body.trackingCode) : "";
  if (!code || code.length > TRACKING_TOKEN_MAX_LENGTH || !isValidTrackingCode(code)) {
    throw createError({ statusCode: 400, statusMessage: "کد رهگیری را وارد کنید." });
  }
  const result = await lookupPartnerContract(code);
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: "کد رهگیری پیدا نشد." });
  }
  return result;
});
