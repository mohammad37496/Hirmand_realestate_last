export type ClusterDirection = -1 | 1;

/** Return the next property id in a map cluster, wrapping at either end. */
export function adjacentClusterPropertyId<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
  direction: ClusterDirection,
): string | null {
  if (!items.length) return null;

  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : direction === 1 ? -1 : 0;
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  return items[nextIndex]?.id ?? null;
}
