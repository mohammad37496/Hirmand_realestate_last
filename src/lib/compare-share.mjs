export const MAX_SHARED_COMPARE_PROPERTIES = 3;

/** @param {unknown} values */
export function normalizeCompareSlugs(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 220)
      .map((value) => value.trim()),
  )).slice(0, MAX_SHARED_COMPARE_PROPERTIES);
}

/** @param {string} search */
export function parseSharedCompare(search) {
  const params = new URLSearchParams(search);
  const hasShare = params.has("share");
  const slugs = hasShare
    ? normalizeCompareSlugs((params.get("share") ?? "").split(","))
    : [];
  return { hasShare, slugs };
}

/** @param {string} search @param {unknown} localSlugs */
export function resolveCompareSlugs(search, localSlugs) {
  const shared = parseSharedCompare(search);
  return {
    isShared: shared.hasShare,
    slugs: shared.hasShare ? shared.slugs : normalizeCompareSlugs(localSlugs),
  };
}

/** Keep an imported share URL in sync; return null for an ordinary local comparison. */
/** @param {string} search @param {unknown} slugs */
export function updateSharedCompareSearch(search, slugs) {
  const params = new URLSearchParams(search);
  if (!params.has("share")) return null;

  const normalized = normalizeCompareSlugs(slugs);
  if (normalized.length) params.set("share", normalized.join(","));
  else params.delete("share");

  const next = params.toString();
  return next ? `?${next}` : "";
}
