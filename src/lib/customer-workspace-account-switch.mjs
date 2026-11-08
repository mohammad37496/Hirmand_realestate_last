const WORKSPACE_KEYS = [
  "hirmand-favorite-meta-v1",
  "hirmand-favorite-properties",
  "hirmand-recent-properties",
  "hirmand-saved-searches",
  "hirmand-workspace-pending-v1",
];
const WORKSPACE_BASE_KEY = "hirmand-workspace-base-v1:";

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

  let cleared = true;
  for (const key of WORKSPACE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      cleared = false;
    }
  }
  try {
    // The target account's old base belongs to a previous login on this
    // browser. Keeping it would make the cleared local snapshot look like a
    // set of deletions during the next three-way merge.
    storage.removeItem(`${WORKSPACE_BASE_KEY}${encodeURIComponent(userId)}`);
  } catch {
    cleared = false;
  }
  if (cleared) {
    try {
      storage.setItem("hirmand-workspace-owner-v1", userId);
    } catch {
      // Keep the previous owner marker so sync cannot merge uncleared data.
    }
  }
  // Let all mounted consumers install their sync listeners before notifying
  // them; this runs before the account-workspace fetch can resolve.
  queueMicrotask(() => target.dispatchEvent(new Event("hirmand:workspace-synced")));
  return true;
}

/** Clear a signed-in account's local snapshot on sign-out and notify mounted views. */
/** @param {{ storage: Pick<Storage, "getItem" | "removeItem">, target: EventTarget }} options */
export function clearWorkspaceForSignedOutUser({ storage, target }) {
  let storedOwner;
  try {
    storedOwner = storage.getItem("hirmand-workspace-owner-v1");
  } catch {
    return false;
  }
  if (!storedOwner) return false;

  let cleared = true;
  for (const key of WORKSPACE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      cleared = false;
    }
  }
  if (cleared) {
    try {
      storage.removeItem("hirmand-workspace-owner-v1");
    } catch {
      // Retain the owner marker when the signed-out snapshot cannot be cleared.
    }
  }
  queueMicrotask(() => target.dispatchEvent(new Event("hirmand:workspace-synced")));
  return true;
}
