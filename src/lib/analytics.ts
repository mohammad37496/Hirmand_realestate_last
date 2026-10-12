export type AnalyticsEvent =
  | "call_click"
  | "whatsapp_click"
  | "inquiry_submit"
  | "inquiry_click"
  | "property_share"
  | "property_favorite"
  | "property_view"
  | "property_compare"
  | "budget_match_submit"
  | "budget_match_contact"
  | "search_share"
  | "property_search"
  | "property_price_watch"
  | "property_price_target"
  | "property_expert_request"
  | "property_verification_request"
  | "viewing_cta_jump"
  | "visit_request_click"
  | "visit_request"
  | "property_report";

export function trackAnalyticsEvent(
  event: AnalyticsEvent,
  propertySlug?: string,
): void {
  if (typeof window === "undefined") return;

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      path: window.location.pathname,
      event,
      propertySlug,
    }),
  }).catch(() => {
    // Analytics failures must never affect the user experience.
  });
}
