import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی پرونده مشتری برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { customer: null, activities: [], deals: [], settlements: [], documents: [] };

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const leadId = clean(body.id);
  if (!leadId) throw createError({ statusCode: 400, statusMessage: "شناسه مشتری مشخص نیست." });

  const sql = await getSql();
  const [leadRows, activityRows, dealRows] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.phone,l.job,l.deal,l.property_type,l.neighborhood,l.floor_preference,l.requested_bedrooms,l.requested_amenities,l.consultant,l.status,l.source,l.follow_up_at,l.last_contacted_at,l.note,l.lease_deadline,l.budget_deposit,l.budget_rent,l.budget_purchase,l.budget_sale,l.budget_deposit_min,l.budget_deposit_max,l.budget_rent_min,l.budget_rent_max,l.budget_purchase_min,l.budget_purchase_max,l.budget_sale_min,l.budget_sale_max,l.budget_equivalent,l.match_count,l.property_id,l.created_at,p.title as property_title,p.slug as property_slug from leads l left join properties p on p.id=l.property_id where l.id=$1 limit 1",
      [leadId],
    ),
    sql.query<Record<string, unknown>>(
      "select id,activity_type,title,note,created_at from lead_activities where lead_id=$1 order by created_at desc limit 100",
      [leadId],
    ),
    sql.query<Record<string, unknown>>(
      "select id,title,deal_type,status,amount,commission,consultant,contract_number,contract_date,closing_date,notes,updated_at from admin_deals where lead_id=$1 order by updated_at desc",
      [leadId],
    ),
  ]);
  const customer = leadRows[0];
  if (!customer) throw createError({ statusCode: 404, statusMessage: "پرونده مشتری پیدا نشد." });

  const dealIds = dealRows.map((row) => String(row.id));
  let settlementRows: Record<string, unknown>[] = [];
  let documentRows: Record<string, unknown>[] = [];
  if (dealIds.length) {
    settlementRows = await sql.query<Record<string, unknown>>(
      "select id,deal_id,consultant,commission_amount,consultant_share,office_share,status,paid_at,note from admin_commission_settlements where deal_id = any($1::text[]) order by updated_at desc",
      [dealIds],
    );
    documentRows = await sql.query<Record<string, unknown>>(
      "select id,deal_id,document_type,status,file_url,note,received_at,verified_at from admin_deal_documents where deal_id = any($1::text[]) order by created_at asc",
      [dealIds],
    );
  }

  return {
    customer: {
      id: String(customer.id),
      name: String(customer.name),
      phone: String(customer.phone),
      job: String(customer.job ?? ""),
      deal: String(customer.deal ?? ""),
      propertyType: String(customer.property_type ?? ""),
      neighborhood: String(customer.neighborhood ?? ""),
      floorPreference: String(customer.floor_preference ?? ""),
      requestedBedrooms: customer.requested_bedrooms == null ? null : Number(customer.requested_bedrooms),
      requestedAmenities: Array.isArray(customer.requested_amenities) ? customer.requested_amenities.map(String) : [],
      consultant: String(customer.consultant ?? ""),
      status: String(customer.status),
      source: String(customer.source ?? ""),
      followUpAt: customer.follow_up_at ? new Date(String(customer.follow_up_at)).toISOString() : null,
      lastContactedAt: customer.last_contacted_at ? new Date(String(customer.last_contacted_at)).toISOString() : null,
      note: String(customer.note ?? ""),
      leaseDeadline: customer.lease_deadline ? String(customer.lease_deadline) : null,
      budgets: {
        deposit: customer.budget_deposit == null ? null : Number(customer.budget_deposit),
        rent: customer.budget_rent == null ? null : Number(customer.budget_rent),
        purchase: customer.budget_purchase == null ? null : Number(customer.budget_purchase),
        sale: customer.budget_sale == null ? null : Number(customer.budget_sale),
        depositMin: customer.budget_deposit_min == null ? null : Number(customer.budget_deposit_min),
        depositMax: customer.budget_deposit_max == null ? null : Number(customer.budget_deposit_max),
        rentMin: customer.budget_rent_min == null ? null : Number(customer.budget_rent_min),
        rentMax: customer.budget_rent_max == null ? null : Number(customer.budget_rent_max),
        purchaseMin: customer.budget_purchase_min == null ? null : Number(customer.budget_purchase_min),
        purchaseMax: customer.budget_purchase_max == null ? null : Number(customer.budget_purchase_max),
        saleMin: customer.budget_sale_min == null ? null : Number(customer.budget_sale_min),
        saleMax: customer.budget_sale_max == null ? null : Number(customer.budget_sale_max),
      },
      matchCount: Number(customer.match_count) || 0,
      propertyId: customer.property_id ? String(customer.property_id) : null,
      propertyTitle: customer.property_title ? String(customer.property_title) : null,
      propertySlug: customer.property_slug ? String(customer.property_slug) : null,
      createdAt: new Date(String(customer.created_at)).toISOString(),
    },
    activities: activityRows.map((row) => ({
      id: Number(row.id),
      type: String(row.activity_type ?? ""),
      title: String(row.title ?? ""),
      note: String(row.note ?? ""),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
    deals: dealRows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      dealType: String(row.deal_type),
      status: String(row.status),
      amount: row.amount == null ? null : Number(row.amount),
      commission: row.commission == null ? null : Number(row.commission),
      consultant: String(row.consultant ?? ""),
      contractNumber: String(row.contract_number ?? ""),
      contractDate: row.contract_date ? String(row.contract_date).slice(0, 10) : null,
      closingDate: row.closing_date ? String(row.closing_date).slice(0, 10) : null,
      notes: String(row.notes ?? ""),
    })),
    settlements: settlementRows.map((row) => ({
      id: String(row.id),
      dealId: String(row.deal_id),
      consultant: String(row.consultant),
      commissionAmount: Number(row.commission_amount) || 0,
      consultantShare: Number(row.consultant_share) || 0,
      officeShare: Number(row.office_share) || 0,
      status: String(row.status),
      paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : null,
      note: String(row.note ?? ""),
    })),
    documents: documentRows.map((row) => ({
      id: String(row.id),
      dealId: String(row.deal_id),
      type: String(row.document_type),
      status: String(row.status),
      fileUrl: String(row.file_url ?? ""),
      note: String(row.note ?? ""),
      receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : null,
      verifiedAt: row.verified_at ? new Date(String(row.verified_at)).toISOString() : null,
    })),
  };
});
