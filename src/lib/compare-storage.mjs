/**
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 * @param {string} key
 * @param {number} limit
 * @returns {{ status: "success"; slugs: string[] } | { status: "error" }}
 */
export function readCompareSlugs(storage, key, limit) {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return { status: "error" };
    return {
      status: "success",
      slugs: Array.from(new Set(
        parsed.filter(
          (item) => typeof item === "string" && item.trim().length > 0 && item.length <= 220,
        ).map((item) => item.trim()),
      )).slice(0, limit),
    };
  } catch {
    return { status: "error" };
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 * @param {string} key
 * @param {string} slug
 * @param {number} limit
 * @returns {{ status: "added" | "removed" | "limit"; next: string[] } | { status: "error"; next?: string[] }}
 */
export function toggleCompareSlug(storage, key, slug, limit) {
  const currentResult = readCompareSlugs(storage, key, limit);
  if (currentResult.status === "error") return { status: "error" };
  const current = currentResult.slugs;

  if (current.includes(slug)) {
    const next = current.filter((item) => item !== slug);
    try {
      storage.setItem(key, JSON.stringify(next));
      return { status: "removed", next };
    } catch {
      return { status: "error", next: current };
    }
  }

  if (current.length >= limit) return { status: "limit", next: current };
  const next = [...current, slug];
  try {
    storage.setItem(key, JSON.stringify(next));
    return { status: "added", next };
  } catch {
    return { status: "error", next: current };
  }
}
