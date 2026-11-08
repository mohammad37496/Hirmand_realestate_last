/**
 * @typedef {{ id: string, name: string, params: string, alerts?: boolean, lastCheckedAt?: string }} SavedSearch
 * @typedef {{ favorites: string[], recentProperties: string[], savedSearches: SavedSearch[], favoriteMeta: Record<string, { tag?: string, note?: string }>, updatedAt?: string | null, ownerId?: string }} CustomerWorkspace
 */

/** Merge anonymous browser data into an account on its first sign-in.
 * @param {CustomerWorkspace} remote
 * @param {CustomerWorkspace} local
 * @returns {CustomerWorkspace}
 */
export function mergeCustomerWorkspace(remote, local) {
  const favorites = [...new Set([...remote.favorites, ...local.favorites])].slice(0, 200);
  const recentProperties = [...new Set([...local.recentProperties, ...remote.recentProperties])].slice(0, 20);
  const savedSearchesById = new Map();
  [...remote.savedSearches, ...local.savedSearches].forEach((item) => savedSearchesById.set(item.id, item));
  return {
    favorites,
    recentProperties,
    savedSearches: Array.from(savedSearchesById.values()).slice(0, 10),
    favoriteMeta: { ...remote.favoriteMeta, ...local.favoriteMeta },
  };
}

/**
 * Choose a complete snapshot for sync. A pending local edit is authoritative so
 * deletions propagate; otherwise the server snapshot is authoritative so edits
 * made on another device arrive on the next sync.
 * @param {{ remote: CustomerWorkspace, local: CustomerWorkspace, ownerId: string | null, currentUserId: string, pendingLocalChanges: boolean }} input
 * @returns {{ direction: "push" | "pull", workspace: CustomerWorkspace }}
 */
export function chooseCustomerWorkspaceSync({
  remote,
  local,
  ownerId,
  currentUserId,
  pendingLocalChanges,
}) {
  if (ownerId && ownerId !== currentUserId) {
    return { direction: "pull", workspace: remote };
  }
  if (!ownerId) {
    return { direction: "push", workspace: mergeCustomerWorkspace(remote, local) };
  }
  if (pendingLocalChanges || !remote.updatedAt) {
    return { direction: "push", workspace: local };
  }
  return { direction: "pull", workspace: remote };
}
