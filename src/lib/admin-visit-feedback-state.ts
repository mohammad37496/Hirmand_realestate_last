export type VisitFeedbackPayload = {
  available: boolean;
  total: number;
  average: number;
  interested: number;
  recent: unknown[];
};

export type VisitFeedbackDisplayState = "loading" | "error" | "unavailable" | "empty" | "content";

export function getVisitFeedbackDisplayState(
  loading: boolean,
  data: VisitFeedbackPayload | null,
): VisitFeedbackDisplayState {
  if (loading && !data) return "loading";
  if (!data) return "error";
  if (!data.available) return "unavailable";
  if (data.recent.length === 0) return "empty";
  return "content";
}
