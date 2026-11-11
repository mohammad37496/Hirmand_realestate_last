export type ExistingGateSession = {
  session?: { token: string } | null;
  user?: { id: string } | null;
} | null;

export type GateSessionPreparationResult<TReplacement = unknown> =
  | { status: "ready"; replacement: TReplacement }
  | { status: "same-identity" }
  | {
      status: "unavailable";
      stage:
        "session-read" | "account-read" | "session-revoke" | "session-create";
      error: unknown;
    };

/**
 * Verify and retire any existing session before materializing a gate identity.
 * Database failures must stop the transition: otherwise an unreadable or
 * unrevokeable session is silently left active while a replacement is issued.
 */
export async function prepareGateIdentitySession<
  TAccount,
  TReplacement,
>(options: {
  hasSessionCookie: boolean;
  loadSession: () => Promise<ExistingGateSession>;
  loadAccounts: (userId: string) => Promise<readonly TAccount[]>;
  matchesIdentity: (accounts: readonly TAccount[]) => boolean;
  revokeSession: (token: string) => Promise<unknown>;
  createReplacementSession: () => Promise<TReplacement>;
}): Promise<GateSessionPreparationResult<TReplacement>> {
  const createReplacement = async (): Promise<
    GateSessionPreparationResult<TReplacement>
  > => {
    try {
      return {
        status: "ready",
        replacement: await options.createReplacementSession(),
      };
    } catch (error) {
      return { status: "unavailable", stage: "session-create", error };
    }
  };

  if (!options.hasSessionCookie) {
    return createReplacement();
  }

  let existing: ExistingGateSession;
  try {
    existing = await options.loadSession();
  } catch (error) {
    return { status: "unavailable", stage: "session-read", error };
  }

  if (!existing?.session || !existing.user) {
    return createReplacement();
  }

  let accounts: readonly TAccount[];
  try {
    accounts = await options.loadAccounts(existing.user.id);
  } catch (error) {
    return { status: "unavailable", stage: "account-read", error };
  }

  if (options.matchesIdentity(accounts)) return { status: "same-identity" };

  try {
    await options.revokeSession(existing.session.token);
  } catch (error) {
    return { status: "unavailable", stage: "session-revoke", error };
  }

  return createReplacement();
}
