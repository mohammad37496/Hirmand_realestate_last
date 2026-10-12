import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { PARTNER_SESSION_COOKIE, verifyPartnerSessionToken } from "@/lib/partner-session.server";
import {
  getPartnerOverview,
  submitPartnerContract,
} from "@/lib/partner-program.server";

export default defineEventHandler(async (event) => {
  const partnerId = await verifyPartnerSessionToken(getCookie(event, PARTNER_SESSION_COOKIE));
  if (!partnerId) {
    throw createError({ statusCode: 401, statusMessage: "نشست همکار معتبر نیست. دوباره وارد شوید." });
  }

  setResponseHeader(event, "cache-control", "no-store");
  const schema = z.object({
    action: z.enum(["list", "create"]).optional().default("list"),
    contractReference: z.string().trim().max(80).optional().default(""),
    clientName: z.string().trim().max(120).optional().default(""),
    transactionType: z.enum(["buy", "sell", "rent", "mortgage"]).optional(),
    note: z.string().trim().max(500).optional().default(""),
  });
  const parsed = schema.safeParse(await readBody(event).catch(() => ({})));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "اطلاعات قرارداد نامعتبر است." });
  }
  const body = parsed.data;

  if (body.action === "list") {
    const partner = await getPartnerOverview(partnerId);
    if (!partner) throw createError({ statusCode: 404, statusMessage: "حساب همکار پیدا نشد." });
    return { partner };
  }

  if (!body.transactionType) {
    throw createError({ statusCode: 400, statusMessage: "نوع قرارداد را انتخاب کنید." });
  }

  try {
    const contract = await submitPartnerContract({
      partnerId,
      contractReference: body.contractReference,
      clientName: body.clientName,
      transactionType: body.transactionType,
      note: body.note,
    });
    return { success: true, contract };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "ثبت قرارداد انجام نشد.",
    });
  }
});
