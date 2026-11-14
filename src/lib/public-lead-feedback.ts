const PUBLIC_LEAD_FEEDBACK_UNIQUE_CONSTRAINT = "lead_visit_feedback_tracking_token_idx";

/** Return true only for the one-feedback-per-original-tracking-token uniqueness conflict. */
export function isDuplicatePublicLeadFeedbackError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const databaseError = error as { code?: unknown; constraint?: unknown };
  return databaseError.code === "23505" &&
    databaseError.constraint === PUBLIC_LEAD_FEEDBACK_UNIQUE_CONSTRAINT;
}
