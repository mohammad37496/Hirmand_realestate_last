/** Run a sensitive report query only after the caller has established its permission. */
export async function queryIfAllowed<T>(allowed: boolean, query: () => Promise<T>, fallback: T): Promise<T> {
  if (!allowed) return fallback;
  return query();
}
