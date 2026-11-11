type ViewingSlotsPayload = {
  success?: unknown;
  occupiedTimes?: unknown;
};

export async function fetchPropertyViewingSlots(
  propertyId: string,
  date: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const response = await fetcher(
    "/api/property-viewing-slots?propertyId=" + encodeURIComponent(propertyId) + "&date=" + encodeURIComponent(date),
    {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );
  const payload = (await response.json().catch(() => null)) as ViewingSlotsPayload | null;

  if (!response.ok || payload?.success !== true || !Array.isArray(payload.occupiedTimes)) {
    throw new Error("Viewing availability could not be verified.");
  }

  return payload.occupiedTimes.filter((value): value is string => typeof value === "string");
}
