/**
 * Fields that must never be persisted in browser-side property-form drafts.
 * The browser draft is a convenience only, not a source of truth; sensitive
 * values must be reloaded from the authorized server record after navigation.
 */
const PRIVATE_PROPERTY_DRAFT_FIELDS = [
  "address",
  "latitude",
  "longitude",
  "ownerName",
  "ownerPhone",
  "ownerInfo",
  "internalNote",
] as const;

export type PrivatePropertyDraftField = (typeof PRIVATE_PROPERTY_DRAFT_FIELDS)[number];

/**
 * Return a shallow copy suitable for temporary browser draft storage.
 * Also used when restoring old sessionStorage payloads so values written by
 * earlier versions cannot reintroduce private fields.
 */
export function stripPrivatePropertyDraftFields<T extends object>(
  value: T,
): Omit<T, PrivatePropertyDraftField> {
  const safe: Record<string, unknown> = { ...(value as unknown as Record<string, unknown>) };
  for (const field of PRIVATE_PROPERTY_DRAFT_FIELDS) {
    delete safe[field];
  }
  return safe as unknown as Omit<T, PrivatePropertyDraftField>;
}
