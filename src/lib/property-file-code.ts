export type FileCodeLookupResult<T> = T | { ambiguousFileCode: true } | null;

/** Resolve a six-hex property code without silently choosing a colliding UUID suffix. */
export async function resolveFileCodeLookup<T>(query: () => Promise<T[]>): Promise<FileCodeLookupResult<T>> {
  const rows = await query();
  if (rows.length > 1) return { ambiguousFileCode: true };
  return rows[0] ?? null;
}
