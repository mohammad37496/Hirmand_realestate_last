export const MARKET_SNAPSHOT_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";
export const MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL = "private, no-store";

export async function loadMarketSnapshot<T>(
  load: () => Promise<T>,
  setCacheControl: (value: string) => void,
  onError: (error: unknown) => void = () => undefined,
): Promise<T | null> {
  try {
    const snapshot = await load();
    setCacheControl(MARKET_SNAPSHOT_CACHE_CONTROL);
    return snapshot;
  } catch (error) {
    setCacheControl(MARKET_SNAPSHOT_UNAVAILABLE_CACHE_CONTROL);
    onError(error);
    return null;
  }
}
