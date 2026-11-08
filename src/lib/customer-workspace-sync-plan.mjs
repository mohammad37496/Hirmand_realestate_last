/**
 * @typedef {{ id: string, name: string, params: string, alerts?: boolean, lastCheckedAt?: string }} SavedSearch
 * @typedef {{ favorites: string[], recentProperties: string[], savedSearches: SavedSearch[], favoriteMeta: Record<string, { tag?: string, note?: string }>, updatedAt?: string | null, ownerId?: string, revision?: string | null }} CustomerWorkspace
 */

/** @param {unknown} left @param {unknown} right */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Merge set-like arrays, prioritizing this device's additions before truncation. */
/** @param {string[]} baseValues @param {string[]} localValues @param {string[]} remoteValues @param {number} limit */
function mergeSet(baseValues, localValues, remoteValues, limit) {
  const base = new Set(baseValues);
  const local = new Set(localValues);
  const remote = new Set(remoteValues);
  /** @param {string} value */
  const merged = (value) => {
    const before = base.has(value);
    const localHas = local.has(value);
    const remoteHas = remote.has(value);
    if (localHas === before) return remoteHas;
    if (remoteHas === before) return localHas;
    return localHas;
  };
  const localAdditions = localValues.filter((value) => !base.has(value));
  const remoteAdditions = remoteValues.filter((value) => !base.has(value));
  const candidates = [...new Set([
    ...localAdditions,
    ...remoteAdditions,
    ...localValues,
    ...remoteValues,
    ...baseValues,
  ])];
  return candidates.filter(merged).slice(0, limit);
}

/**
 * Three-way merge keyed objects. A local change wins only when both sides
 * changed the same key differently; independent keys and deletions survive.
 */
/** @param {Record<string, unknown>} baseValue @param {Record<string, unknown>} localValue @param {Record<string, unknown>} remoteValue @returns {Record<string, unknown>} */
function mergeKeyed(baseValue, localValue, remoteValue) {
  const base = baseValue && typeof baseValue === "object" ? baseValue : {};
  const local = localValue && typeof localValue === "object" ? localValue : {};
  const remote = remoteValue && typeof remoteValue === "object" ? remoteValue : {};
  const result = /** @type {Record<string, unknown>} */ ({});
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const before = Object.hasOwn(base, key) ? base[key] : undefined;
    const localHas = Object.hasOwn(local, key);
    const remoteHas = Object.hasOwn(remote, key);
    const localItem = localHas ? local[key] : undefined;
    const remoteItem = remoteHas ? remote[key] : undefined;
    const localChanged = !same(localItem, before);
    const remoteChanged = !same(remoteItem, before);
    const chosen = !localChanged ? (remoteHas ? remoteItem : undefined)
      : !remoteChanged ? (localHas ? localItem : undefined)
        : localHas ? localItem : undefined;
    if (chosen !== undefined) result[key] = chosen;
  }
  return result;
}

/**
 * Merge the last successful snapshot (base), this device (local), and the
 * latest server snapshot (remote). For same-id saved-search conflicts and
 * same-slug favorite metadata conflicts, local wins deterministically.
 * @param {CustomerWorkspace} base
 * @param {CustomerWorkspace} local
 * @param {CustomerWorkspace} remote
 * @returns {CustomerWorkspace}
 */
export function mergeCustomerWorkspaceThreeWay(base, local, remote) {
  const savedSearchesById = /** @type {Record<string, SavedSearch>} */ (mergeKeyed(
    Object.fromEntries((base.savedSearches ?? []).map((item) => [item.id, item])),
    Object.fromEntries((local.savedSearches ?? []).map((item) => [item.id, item])),
    Object.fromEntries((remote.savedSearches ?? []).map((item) => [item.id, item])),
  ));
  const baseSearchesById = Object.fromEntries((base.savedSearches ?? []).map((item) => [item.id, item]));
  const localChangedIds = (local.savedSearches ?? [])
    .filter((item) => !same(item, baseSearchesById[item.id])).map((item) => item.id);
  const remoteChangedIds = (remote.savedSearches ?? [])
    .filter((item) => !same(item, baseSearchesById[item.id])).map((item) => item.id);
  const savedSearchOrder = [...new Set([
    ...localChangedIds,
    ...remoteChangedIds,
    ...(local.savedSearches ?? []).map((item) => item.id),
    ...(remote.savedSearches ?? []).map((item) => item.id),
  ])];
  const savedSearches = savedSearchOrder.map((id) => savedSearchesById[id]).filter(Boolean).slice(0, 10);
  return {
    favorites: mergeSet(base.favorites ?? [], local.favorites ?? [], remote.favorites ?? [], 200),
    recentProperties: mergeSet(base.recentProperties ?? [], local.recentProperties ?? [], remote.recentProperties ?? [], 20),
    savedSearches,
    favoriteMeta: /** @type {Record<string, { tag?: string, note?: string }>} */ (mergeKeyed(base.favoriteMeta ?? {}, local.favoriteMeta ?? {}, remote.favoriteMeta ?? {})),
  };
}

/** Merge anonymous browser data into an account on its first sign-in. */
/** @param {CustomerWorkspace} remote @param {CustomerWorkspace} local */
export function mergeCustomerWorkspace(remote, local) {
  return mergeCustomerWorkspaceThreeWay(
    { favorites: [], recentProperties: [], savedSearches: [], favoriteMeta: {} },
    local,
    remote,
  );
}

/**
 * Retained for callers/tests that need the older first-login direction policy.
 * The live sync provider uses mergeCustomerWorkspaceThreeWay with its saved base.
 * @param {{ remote: CustomerWorkspace, local: CustomerWorkspace, ownerId: string | null, currentUserId: string, pendingLocalChanges: boolean }} input
 * @returns {{ direction: "push" | "pull", workspace: CustomerWorkspace }}
 */
export function chooseCustomerWorkspaceSync({ remote, local, ownerId, currentUserId, pendingLocalChanges }) {
  if (ownerId && ownerId !== currentUserId) return { direction: "pull", workspace: remote };
  if (!ownerId) return { direction: "push", workspace: mergeCustomerWorkspace(remote, local) };
  if (pendingLocalChanges || !remote.updatedAt) return { direction: "push", workspace: local };
  return { direction: "pull", workspace: remote };
}
