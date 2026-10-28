import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { verifyAdminSessionToken, getAdminSessionClaims, ADMIN_SESSION_COOKIE } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import {
  claimPartnerReward,
  createPartnerAccount,
  getPartnerOverview,
  issueNewPartnerCard,
  listAdminPartners,
  listPartnerContractsForAdmin,
  listPendingPartnerContracts,
  listPartnerAuditLogs,
  rejectPartnerContract,
  approvePartnerContract,
  updatePartnerStatus,
} from "@/lib/partner-program.server";

export default defineEventHandler(async (event) => {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }

  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "commission.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت همکاری‌ها و پاداش‌ها برای این حساب فعال نیست." });
  }
  const body = (await readBody(event).catch(() => ({}))) as {
    action?:
      | "list"
      | "create"
      | "pending"
      | "details"
      | "approve"
      | "reject"
      | "new-card"
      | "claim-reward"
      | "status";
    partnerId?: string;
    contractId?: string;
    agencyName?: string;
    contactName?: string;
    phone?: string;
    note?: string;
    status?: "active" | "suspended";
  };

  try {
    if (body.action === "create") {
      const input = z.object({
        agencyName: z.string().trim().min(2).max(120),
        contactName: z.string().trim().min(2).max(100),
        phone: z.string().trim().min(7).max(20),
      }).safeParse({
        agencyName: body.agencyName,
        contactName: body.contactName,
        phone: body.phone,
      });
      if (!input.success) throw createError({ statusCode: 422, statusMessage: "نام املاک، مسئول و شماره تماس را معتبر وارد کنید." });
      return {
        success: true,
        created: await createPartnerAccount(input.data),
      };
    }

    if (body.action === "pending") {
      return { contracts: await listPendingPartnerContracts() };
    }

    if (body.action === "details") {
      if (!body.partnerId) throw createError({ statusCode: 400, statusMessage: "شناسه همکار مشخص نیست." });
      const [partner, contracts, audits] = await Promise.all([
        getPartnerOverview(body.partnerId),
        listPartnerContractsForAdmin(body.partnerId),
        listPartnerAuditLogs(body.partnerId),
      ]);
      if (!partner) throw createError({ statusCode: 404, statusMessage: "حساب همکار پیدا نشد." });
      return { partner, contracts, audits };
    }

    if (body.action === "approve") {
      if (!body.contractId) throw createError({ statusCode: 400, statusMessage: "شناسه قرارداد مشخص نیست." });
      return { success: true, result: await approvePartnerContract(body.contractId) };
    }

    if (body.action === "reject") {
      if (!body.contractId) throw createError({ statusCode: 400, statusMessage: "شناسه قرارداد مشخص نیست." });
      return { success: true, result: await rejectPartnerContract(body.contractId, body.note ?? "") };
    }

    if (body.action === "new-card") {
      if (!body.partnerId) throw createError({ statusCode: 400, statusMessage: "شناسه همکار مشخص نیست." });
      return { success: true, partner: await issueNewPartnerCard(body.partnerId) };
    }

    if (body.action === "claim-reward") {
      if (!body.partnerId) throw createError({ statusCode: 400, statusMessage: "شناسه همکار مشخص نیست." });
      return { success: true, partner: await claimPartnerReward(body.partnerId, body.note ?? "") };
    }

    if (body.action === "status") {
      if (!body.partnerId || !body.status) throw createError({ statusCode: 400, statusMessage: "حساب یا وضعیت مشخص نیست." });
      return { success: true, partner: await updatePartnerStatus(body.partnerId, body.status) };
    }

    const [partners, pendingContracts] = await Promise.all([
      listAdminPartners(),
      listPendingPartnerContracts(),
    ]);
    return { partners, pendingContracts };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("[admin/partners] operation failed", { code: code ?? "unknown" });
    const unavailable =
      Boolean(code && (code.startsWith("08") || code === "57P01" || code === "57P03" || /^E(CONN|TIMEDOUT|PIPE|HOST|NET)/.test(code)));
    throw createError({
      statusCode: unavailable ? 503 : 500,
      statusMessage: unavailable
        ? "پایگاه داده همکاری‌ها موقتاً در دسترس نیست."
        : "عملیات همکاری به‌دلیل خطای داخلی انجام نشد.",
    });
  }
});
