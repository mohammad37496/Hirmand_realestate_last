/**
 * Shared slug helpers for property URLs.
 *
 * Property links travel through several generations of formats:
 *   - `/properties/آپارتمان-شهرک-ولیعصر-345555d4` (current: title + id fragment)
 *   - `/properties/%D8%A2...` (percent-encoded — what `encodeURIComponent` emits)
 *   - `/properties/%25D8%25A2...` (double-encoded — old shares/redirects)
 *   - `/file/<uuid>` and `/file/<8-hex fragment>` (first generation)
 *
 * The lookup has to stay tolerant so old links keep resolving, while the URL
 * bar must end up on the property's own slug. Both needs read the same decode
 * chain, so it lives here — pure functions, covered by
 * `src/lib/property-slug.test.ts`.
 */

/** Upper bound on decode passes: `%25` → `%` chains are at most 2 levels deep in practice. */
const MAX_DECODE_PASSES = 2;

/**
 * The raw slug plus its progressively percent-decoded forms, de-duplicated and
 * preserving order (most-specific first).
 *
 * Malformed escapes (`%E0%A4`) stop the chain instead of throwing, so a crafted
 * URL can never turn a lookup into a 500.
 */
export function decodeSlugCandidates(raw: string): string[] {
  const candidates = [raw];
  for (let i = 0; i < MAX_DECODE_PASSES; i += 1) {
    const current = candidates[candidates.length - 1]!;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded !== current && !candidates.includes(decoded)) {
        candidates.push(decoded);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return candidates;
}

/**
 * The trailing 8-hex id fragments found in the candidates — the same fragment
 * `saveProperty()` appends to a generated slug and the same one `/file/:id`
 * links carry. Lets a renamed property stay reachable through its old URL.
 */
export function legacyIdFragments(candidates: string[]): string[] {
  return Array.from(
    new Set(
      candidates
        .map((value) => value.match(/-([0-9a-f]{8})$/i)?.[1]?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

/**
 * True when the requested slug already *is* the property's canonical slug (one
 * of its decoded forms). Anything else means the URL is an alias — an outdated
 * title, an id-based path or an encoded variant — and the caller should
 * redirect so the file is not served on several URLs at once.
 */
export function isCanonicalSlug(requested: string, canonical: string): boolean {
  const target = canonical.trim();
  if (!target) return true; // No canonical slug to redirect to; keep the page.
  return decodeSlugCandidates(requested).includes(target);
}
