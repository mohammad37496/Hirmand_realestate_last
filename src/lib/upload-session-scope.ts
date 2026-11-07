/**
 * Upload sessions share one table, but each route owns a distinct kind and
 * storage directory. A session ID is valid only inside both boundaries.
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
