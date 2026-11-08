const WORKSPACE_KEYS = [
  "hirmand-favorite-meta-v1",
  "hirmand-favorite-properties",
  "hirmand-recent-properties",
  "hirmand-saved-searches",
  "hirmand-workspace-pending-v1",
];

/**
 * Clear the previous account's local snapshot before fetching the next
 * account's workspace. A missing owner remains a guest workspace and is not
 * cleared, preserving the first-sign-in merge flow.
 * @param {{ storage: Pick<Storage, "getItem" | "removeItem" | "setItem">, target: EventTarget, userId: string }} options
 */
export function resetWorkspaceForAccountSwitch({ storage, target, userId }) {
  if (!userId) return false;

  let storedOwner;
  try {
    storedOwner = storage.getItem("hirmand-workspace-owner-v1");
  } catch {
    return false;
  }
  if (!storedOwner || storedOwner === userId) return false;

  for (const key of WORKSPACE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Keep clearing the remaining account-scoped keys if one removal fails.
    }
  }
  try {
    storage.setItem("hirmand-workspace-owner-v1", userId);
  } catch {
    // The in-memory views are still notified below.
  }
  // Let all mounted consumers install their sync listeners before notifying
  // them; this runs before the account-workspace fetch can resolve.
  queueMicrotask(() => target.dispatchEvent(new Event("hirmand:workspace-synced")));
  return true;
}
