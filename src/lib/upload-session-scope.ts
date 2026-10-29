/**
 * Each chunked upload endpoint owns a single session kind and storage prefix.
 * Validate both so a session ID cannot cross endpoint boundaries.
 */
export type UploadSessionScopeCandidate = {
  kind?: unknown;
  pathname?: unknown;
};

export function uploadSessionScopePrefix(pathPrefix: string): string {
  return `${pathPrefix.replace(/\/+$/, "")}/`;
}

export function matchesUploadSessionScope(
  session: UploadSessionScopeCandidate | null | undefined,
  expectedKind: string,
  pathPrefix: string,
): boolean {
  if (!session || typeof session !== "object") return false;
  if (session.kind !== expectedKind || typeof session.pathname !== "string") return false;
  const prefix = uploadSessionScopePrefix(pathPrefix);
  return session.pathname.startsWith(prefix) && session.pathname.length > prefix.length;
}
