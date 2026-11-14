/**
 * Database-backed sessions require a successful server-side revoke. In
 * unconfigured local/dev mode legacy admin-key sessions are stateless, so
 * logout only clears this browser cookie; a copied development JWT remains
 * valid until expiry. Production rejects stateless admin sessions.
 */
export async function completeAdminSessionLogout(
  sessionId: string | null,
  databaseConfigured: boolean,
  revoke: (sessionId: string) => Promise<unknown>,
): Promise<boolean> {
  if (!sessionId) return true;
  if (!databaseConfigured) return true;

  try {
    await revoke(sessionId);
    return true;
  } catch {
    return false;
  }
}
