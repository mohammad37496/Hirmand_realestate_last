/**
 * Upload session IDs are shared by several endpoints. Each endpoint may access
 * only the expected media kind and its own storage directory.
 */
export type UploadSessionScopeCandidate = {
  kind?: unknown;
  pathname?: unknown;
};

export function uploadSessionScopePrefix(pathPrefix: string): string {
  let normalized = pathPrefix;
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return `${normalized}/`;
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
