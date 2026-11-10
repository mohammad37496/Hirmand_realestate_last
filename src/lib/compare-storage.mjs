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
 * @param {Pick<Storage, "setItem">} storage
 * @param {string} key
 * @param {string[]} slugs
 * @returns {{ status: "success" } | { status: "error" }}
 */
export function writeCompareSlugs(storage, key, slugs) {
  try {
    storage.setItem(key, JSON.stringify(slugs));
    return { status: "success" };
  } catch {
    return { status: "error" };
  }
}

/**
 * @param {Pick<Storage, "removeItem">} storage
 * @param {string} key
 * @returns {{ status: "success" } | { status: "error" }}
 */
export function clearCompareSlugs(storage, key) {
  try {
    storage.removeItem(key);
    return { status: "success" };
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
    return writeCompareSlugs(storage, key, next).status === "success"
      ? { status: "removed", next }
      : { status: "error", next: current };
  }

  if (current.length >= limit) return { status: "limit", next: current };
  const next = [...current, slug];
  return writeCompareSlugs(storage, key, next).status === "success"
    ? { status: "added", next }
    : { status: "error", next: current };
}
