/**
 * Upload sessions are shared by several HTTP endpoints, but each endpoint owns
 * only one session kind and one storage prefix. Never let a caller cross that
 * boundary by presenting a session ID issued by another upload route.
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
