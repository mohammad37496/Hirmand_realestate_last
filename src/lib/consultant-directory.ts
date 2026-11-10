export type ConsultantDirectoryEntry = {
  id: string;
  isActive: boolean;
};

/**
 * Use bundled profiles only when no database row exists for that profile.
 * An explicit inactive row is an administrator decision and must never be
 * undone by the static fallback.
 */
export function mergePublicConsultantDirectory<T extends ConsultantDirectoryEntry>(
  databaseEntries: T[],
  bundledEntries: T[],
): T[] {
  const managedIds = new Set(databaseEntries.map((item) => item.id.trim().toLowerCase()));
  return [
    ...databaseEntries.filter((item) => item.isActive),
    ...bundledEntries.filter((item) => !managedIds.has(item.id.trim().toLowerCase())),
  ];
}
