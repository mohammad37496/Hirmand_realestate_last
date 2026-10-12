import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";
import { clearPropertyReadCache } from "@/lib/property-read-cache.server";
import { getPublishReadiness } from "@/lib/property-publish-readiness";

async function requirePublicationPermission(permission: "property.manage" | "property.publish") {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, permission)) throw new Error("سطح دسترسی کافی برای این عملیات وجود ندارد.");
  return claims;
}

export const listPendingPublicationReviews = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional().default(50) }))
  .handler(async ({ data }) => {
    await requirePublicationPermission("property.manage");
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select r.id,r.property_id,r.status,r.requested_by,r.request_note,r.requested_at,
              p.title,p.slug,p.status as property_status,p.neighborhood,p.price,p.deposit,p.rent
       from property_publication_reviews r
       join properties p on p.id=r.property_id
       where r.status='pending'
       order by r.requested_at asc
       limit $1`,
      [data.limit],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      propertyId: String(row.property_id),
      title: String(row.title ?? ""),
      slug: String(row.slug ?? ""),
      neighborhood: String(row.neighborhood ?? ""),
      propertyStatus: String(row.property_status ?? "draft"),
      requestedBy: String(row.requested_by ?? ""),
      requestNote: String(row.request_note ?? ""),
      requestedAt: new Date(String(row.requested_at)).toISOString(),
      price: row.price == null ? null : String(row.price),
      deposit: row.deposit == null ? null : String(row.deposit),
      rent: row.rent == null ? null : String(row.rent),
    }));
  });

export const requestPropertyPublication = createServerFn({ method: "POST" })
  .validator(z.object({
    propertyId: z.string().min(1).max(120),
    note: z.string().trim().max(1000).default(""),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePublicationPermission("property.manage");
    if (dbSource === "unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id,title,status,transaction_type,neighborhood,description,contact_name,contact_phone,
              price,deposit,rent,images,area_m2,features,latitude,longitude
       from properties where id=$1 and deleted_at is null limit 1`,
      [data.propertyId],
    );
    const property = rows[0];
    if (!property) throw new Error("فایل پیدا نشد.");
    if (String(property.status) === "published") return { success: true, alreadyPublished: true };
    const readiness = getPublishReadiness({
      transactionType: String(property.transaction_type ?? "sell") as "sell" | "buy" | "rent" | "mortgage",
      title: String(property.title ?? ""),
      neighborhood: String(property.neighborhood ?? ""),
      description: String(property.description ?? ""),
      contactName: String(property.contact_name ?? ""),
      contactPhone: String(property.contact_phone ?? ""),
      price: String(property.price ?? ""),
      deposit: String(property.deposit ?? ""),
      rent: String(property.rent ?? ""),
      imageCount: Array.isArray(property.images) ? property.images.length : 0,
      areaM2: property.area_m2 == null ? "" : String(property.area_m2),
      features: Array.isArray(property.features) ? property.features.join("\n") : String(property.features ?? ""),
      latitude: property.latitude == null ? null : Number(property.latitude),
      longitude: property.longitude == null ? null : Number(property.longitude),
    });
    if (!readiness.ready) throw new Error("درخواست انتشار ثبت نشد: " + readiness.blockers.join(" "));
    await sql.query(
      `insert into property_publication_reviews(property_id,status,requested_by,request_note)
       values($1,'pending',$2,$3)
       on conflict (property_id) where status='pending' do update
       set requested_by=excluded.requested_by,request_note=excluded.request_note,requested_at=current_timestamp`,
      [data.propertyId, claims?.displayName || "مدیر", data.note],
    );
    await writeAdminAuditLog({
      action: "property.publication_requested",
      entityType: "property",
      entityId: data.propertyId,
      entityTitle: String(property.title ?? ""),
      metadata: { note: data.note },
    });
    return { success: true, alreadyPublished: false };
  });

export const reviewPropertyPublication = createServerFn({ method: "POST" })
  .validator(z.object({
    reviewId: z.number().int().positive(),
    decision: z.enum(["approve","reject"]),
    note: z.string().trim().max(1000).default(""),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePublicationPermission("property.publish");
    if (dbSource === "unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
    const sql = await getSql();
    const reviewRows = await sql.query<Record<string, unknown>>(
      `select r.id,r.property_id,r.status,p.title,p.transaction_type,p.neighborhood,p.description,
              p.contact_name,p.contact_phone,p.price,p.deposit,p.rent,p.images,p.area_m2,p.features,
              p.latitude,p.longitude
       from property_publication_reviews r
       join properties p on p.id=r.property_id
       where r.id=$1 limit 1`,
      [data.reviewId],
    );
    const review = reviewRows[0];
    if (!review) throw new Error("درخواست انتشار پیدا نشد.");
    if (String(review.status) !== "pending") throw new Error("این درخواست قبلاً بررسی شده است.");

    if (data.decision === "approve") {
      const readiness = getPublishReadiness({
        transactionType: String(review.transaction_type ?? "sell") as "sell" | "buy" | "rent" | "mortgage",
        title: String(review.title ?? ""),
        neighborhood: String(review.neighborhood ?? ""),
        description: String(review.description ?? ""),
        contactName: String(review.contact_name ?? ""),
        contactPhone: String(review.contact_phone ?? ""),
        price: String(review.price ?? ""),
        deposit: String(review.deposit ?? ""),
        rent: String(review.rent ?? ""),
        imageCount: Array.isArray(review.images) ? review.images.length : 0,
        areaM2: review.area_m2 == null ? "" : String(review.area_m2),
        features: Array.isArray(review.features) ? review.features.join("\n") : String(review.features ?? ""),
        latitude: review.latitude == null ? null : Number(review.latitude),
        longitude: review.longitude == null ? null : Number(review.longitude),
      });
      if (!readiness.ready) throw new Error("انتشار تأیید نشد چون فایل دیگر آماده انتشار نیست: " + readiness.blockers.join(" "));
      await sql.query(
        "update properties set status='published',published_at=coalesce(published_at,current_timestamp),updated_at=current_timestamp where id=$1 and deleted_at is null",
        [String(review.property_id)],
      );
    }
    await sql.query(
      `update property_publication_reviews
       set status=$2,reviewed_by=$3,review_note=$4,reviewed_at=current_timestamp
       where id=$1`,
      [data.reviewId, data.decision === "approve" ? "approved" : "rejected", claims?.displayName || "مدیر", data.note],
    );
    await writeAdminAuditLog({
      action: data.decision === "approve" ? "property.publication_approved" : "property.publication_rejected",
      entityType: "property",
      entityId: String(review.property_id),
      entityTitle: String(review.title ?? ""),
      metadata: { reviewId: data.reviewId, note: data.note },
    });
    clearPropertyReadCache();
    return { success: true };
  });
