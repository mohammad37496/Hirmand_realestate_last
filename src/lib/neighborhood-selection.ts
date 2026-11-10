import { compactSearchText } from "./property-search-utils.ts";

export const MAX_SELECTED_NEIGHBORHOODS = 12;

/** Trim, de-duplicate spelling variants and cap selections at the public API limit. */
export function normalizeNeighborhoodSelection(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    const key = compactSearchText(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    selected.push(name);
    if (selected.length === MAX_SELECTED_NEIGHBORHOODS) break;
  }
  return selected;
}

/** Read the repeated multi-value parameter and the legacy single-value alias. */
export function readNeighborhoodSelection(params: URLSearchParams): string[] {
  const repeated = params.getAll("neighborhoods");
  // When both formats are present, the newer multi-value selection is
  // authoritative. Do not silently widen it with a stale legacy value.
  return normalizeNeighborhoodSelection(repeated.length ? repeated : [params.get("neighborhood") ?? ""]);
}

/** Write a canonical selection while preserving the legacy single-neighborhood URL. */
export function writeNeighborhoodSelection(params: URLSearchParams, values: readonly unknown[]): string[] {
  const selected = normalizeNeighborhoodSelection(values);
  params.delete("neighborhood");
  params.delete("neighborhoods");
  if (selected.length === 1) {
    params.set("neighborhood", selected[0]);
  } else {
    for (const name of selected) params.append("neighborhoods", name);
    params.delete("map_place_hash");
  }
  return selected;
}
