const OWNER_VISIBLE_EVENT_NOTE_ACTIONS = new Set([
  "created",
  "assign",
  "reject",
  "resubmit",
]);

/** Only notes intentionally written as owner feedback may cross the public API. */
export function ownerStatusEventNote(action: unknown, note: unknown): string {
  const normalizedAction = String(action ?? "");
  return OWNER_VISIBLE_EVENT_NOTE_ACTIONS.has(normalizedAction)
    ? String(note ?? "")
    : "";
}

/** Submission review notes are owner feedback only after an explicit rejection. */
export function publicCustomerPropertyReviewNote(status: unknown, note: unknown): string {
  return String(status ?? "") === "rejected" ? String(note ?? "") : "";
}
