import { createError, defineEventHandler, getCookie, readBody, setCookie, setResponseHeader } from "h3";
import { z } from "zod";
import {
  PARTNER_SESSION_COOKIE,
  PARTNER_SESSION_MAX_AGE,
  createPartnerSessionToken,
  verifyPartnerSessionToken,
} from "@/lib/partner-session.server";
import { authenticatePartner, getPartnerOverview } from "@/lib/partner-program.server";

const bodySchema = z.object({
  action: z.enum(["login", "logout", "me"]).optional().default("me"),
  partnerCode: z.string().trim().max(32).optional().default(""),
  pin: z.string().max(16).optional().default(""),
});

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge,
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "اطلاعات نشست نامعتبر است." });
  }
  const body = parsed.data;
  const action = body.action;

  if (action === "logout") {
    setCookie(event, PARTNER_SESSION_COOKIE, "", cookieOptions(0));
    return { success: true };
  }

  const existingId = await verifyPartnerSessionToken(getCookie(event, PARTNER_SESSION_COOKIE));
  if (action === "me") {
    const overview = existingId ? await getPartnerOverview(existingId) : null;
    if (overview?.status === "suspended") {
      setCookie(event, PARTNER_SESSION_COOKIE, "", cookieOptions(0));
      return { authenticated: false, partner: null };
    }
    return { authenticated: Boolean(overview), partner: overview };
  }

  if (existingId) {
    const overview = await getPartnerOverview(existingId);
    if (!overview) {
      setCookie(event, PARTNER_SESSION_COOKIE, "", cookieOptions(0));
      return { success: false, authenticated: false, partner: null };
    }
    if (overview.status === "suspended") {
      setCookie(event, PARTNER_SESSION_COOKIE, "", cookieOptions(0));
      return { success: false, authenticated: false, partner: null };
    }
    return { success: true, authenticated: true, partner: overview };
  }

  const partnerId = await authenticatePartner(body.partnerCode ?? "", body.pin ?? "");
  if (!partnerId) {
    throw createError({
      statusCode: 401,
      statusMessage: "کد همکاری یا رمز ورود نادرست است.",
    });
  }

  const token = await createPartnerSessionToken(partnerId);
  setCookie(event, PARTNER_SESSION_COOKIE, token, cookieOptions(PARTNER_SESSION_MAX_AGE));

  const overview = await getPartnerOverview(partnerId);
  return { success: true, authenticated: true, partner: overview };
});
