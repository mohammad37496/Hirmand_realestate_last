import { getPublishReadiness } from "./property-publish-readiness.ts";

type QuerySql = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> };

export type PublicationDecision = "approve" | "reject";

/** Lock the pending review and its property, then apply one consistent decision. */
export async function reviewPropertyPublicationWithSql(
  sql: QuerySql,
  input: { reviewId: number; decision: PublicationDecision; note: string; actor: string },
) {
  const rows = await sql.query<Record<string, unknown>>(
    `select r.id,r.property_id,r.status,p.deleted_at,p.title,p.transaction_type,p.neighborhood,p.description,
            p.contact_name,p.contact_phone,p.price,p.deposit,p.rent,p.images,p.area_m2,p.features,
            p.latitude,p.longitude
     from property_publication_reviews r
     join properties p on p.id=r.property_id
     where r.id=$1 and r.status='pending'
     limit 1
     for update of r,p`,
    [input.reviewId],
  );
  const review = rows[0];
  if (!review) throw new Error("This publication review is no longer pending.");

  const propertyId = String(review.property_id);
  const title = String(review.title ?? "");
  if (input.decision === "approve") {
    if (review.deleted_at != null) throw new Error("A trashed property cannot be approved for publication.");
    const readiness = getPublishReadiness({
      transactionType: String(review.transaction_type ?? "sell") as "sell" | "buy" | "rent" | "mortgage",
      title,
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
    if (!readiness.ready) throw new Error("The property is no longer ready for publication: " + readiness.blockers.join(" "));
    const published = await sql.query<{ id: string }>(
      `update properties
       set status='published',published_at=coalesce(published_at,current_timestamp),updated_at=current_timestamp
       where id=$1 and deleted_at is null
       returning id`,
      [propertyId],
    );
    if (published.length !== 1) throw new Error("The property was moved to trash before approval.");
  }

  const updated = await sql.query<{ id: number }>(
    `update property_publication_reviews
     set status=$2,reviewed_by=$3,review_note=$4,reviewed_at=current_timestamp
     where id=$1 and status='pending'
     returning id`,
    [input.reviewId, input.decision === "approve" ? "approved" : "rejected", input.actor, input.note],
  );
  if (updated.length !== 1) throw new Error("This publication review was handled by another admin.");
  return { propertyId, title };
}
