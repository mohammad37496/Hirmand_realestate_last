/**
 * Only published, currently available, non-deleted and not-expired listings
 * may be offered to a customer by the CRM matcher.
 */
export const MATCHABLE_PROPERTY_SQL = `
  status = 'published'
  and coalesce(availability_status, 'available') = 'available'
  and deleted_at is null
  and (unpublish_at is null or unpublish_at > current_timestamp)
`;

export function isMatchableProperty(property: Record<string, unknown>): boolean {
  const status = String(property.status ?? "");
  const availability = property.availability_status ?? property.availabilityStatus ?? "available";
  const deletedAt = property.deleted_at ?? property.deletedAt;
  const unpublishAt = property.unpublish_at ?? property.unpublishAt;
  return status === "published"
    && String(availability) === "available"
    && deletedAt == null
    && (unpublishAt == null || new Date(String(unpublishAt)).getTime() > Date.now());
}
