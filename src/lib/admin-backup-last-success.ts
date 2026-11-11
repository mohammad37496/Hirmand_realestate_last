const STORAGE_KEY = "hirmand.admin-backup.last-success.v1";

type TimestampStorage = Pick<Storage, "getItem" | "setItem">;

export function readLastSuccessfulBackupVerification(storage: TimestampStorage | null) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export function writeLastSuccessfulBackupVerification(storage: TimestampStorage | null, value: string) {
  if (!Number.isFinite(Date.parse(value))) return;
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(new Date(value).toISOString()));
  } catch {
    // A browser storage failure must not block backup verification.
  }
}
