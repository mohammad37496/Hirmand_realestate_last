/**
 * A logout is successful only when an existing server-side session has been
 * revoked (or when there is no valid session token to revoke).
 */
export async function completeAdminSessionLogout(
  sessionId: string | null,
  databaseConfigured: boolean,
  revoke: (sessionId: string) => Promise<unknown>,
): Promise<boolean> {
  if (!sessionId) return true;
  if (!databaseConfigured) return false;

  try {
    await revoke(sessionId);
    return true;
  } catch {
    return false;
  }
}
