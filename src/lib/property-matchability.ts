/**
 * A listing is eligible for automated/customer matching only while it is
 * published and available. Null availability is treated as "available" for
 * older rows predating the availability-status field.
 *
 * Keep the SQL predicate and the in-process guard together so both matchers
 * enforce exactly the same business rule.
 */
export const MATCHABLE_PROPERTY_SQL =
  "status = 'published' and coalesce(availability_status, 'available') = 'available'";

export function isMatchableProperty(
  property: Record<string, unknown>,
): boolean {
  const status = String(property.status ?? "");
  const rawAvailability = property.availability_status ?? property.availabilityStatus;
  const availability = rawAvailability == null ? "available" : String(rawAvailability);
  return status === "published" && availability === "available";
}
