/** Resolve a property route from an explicitly configured fixture or a live card. */
export function resolveResponsiveSmokeTarget({
  href,
  dataPropertyId,
  baseUrl,
  configuredId = "",
  configuredSlug = "",
}) {
  let discoveredSlug = "";
  try {
    const segments = new URL(href, baseUrl).pathname.split("/").filter(Boolean);
    if (segments[0] === "properties" && segments[1]) {
      discoveredSlug = decodeURIComponent(segments[1]);
    }
  } catch {
    // A configured fixture can still be used when a card link is unavailable.
  }

  return {
    propertyId: String(configuredId || dataPropertyId || "").trim(),
    propertySlug: String(configuredSlug || discoveredSlug || "").trim(),
  };
}

/** Build only the detail routes supported by the discovered/configured target. */
export function responsiveSmokePropertyRoutes({ propertyId, propertySlug }) {
  const routes = [];
  if (propertySlug) routes.push(`/properties/${encodeURIComponent(propertySlug)}`);
  if (propertyId) routes.push(`/file/${encodeURIComponent(propertyId)}`);
  if (propertyId && propertySlug) {
    routes.push(`/v/${encodeURIComponent(propertySlug)}/${encodeURIComponent(propertyId)}`);
  }
  return routes;
}
