export type MobileDeviceStatus = "pending" | "active" | "revoked" | string;
export type MobileManagementMode =
  | "device_owner"
  | "profile_owner"
  | "legacy_device_admin"
  | "unmanaged"
  | "unknown";

export type MobilePresence = "online" | "stale" | "offline" | "unknown";

export const MOBILE_PRESENCE_THRESHOLDS_MS = {
  online: 5 * 60 * 1000,
  stale: 60 * 60 * 1000,
} as const;

export function deviceStatusLabel(status: MobileDeviceStatus): string {
  switch (status) {
    case "active": return "فعال";
    case "pending": return "در انتظار تأیید";
    case "revoked": return "لغوشده";
    default: return status || "نامشخص";
  }
}

export function managementModeLabel(mode: MobileManagementMode): string {
  switch (mode) {
    case "device_owner": return "مدیریت کامل سازمانی";
    case "profile_owner": return "پروفایل کاری";
    case "legacy_device_admin": return "مدیریت قدیمی";
    case "unmanaged": return "بدون مدیریت";
    default: return "نامشخص";
  }
}

export function managementModeShortLabel(mode: MobileManagementMode): string {
  switch (mode) {
    case "device_owner": return "Device Owner";
    case "profile_owner": return "Work Profile";
    case "legacy_device_admin": return "Legacy Admin";
    case "unmanaged": return "Unmanaged";
    default: return "Unknown";
  }
}

export function getMobilePresence(lastSeenAt: string | null, now = Date.now()): MobilePresence {
  if (!lastSeenAt) return "unknown";
  const timestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const age = Math.max(0, now - timestamp);
  if (age <= MOBILE_PRESENCE_THRESHOLDS_MS.online) return "online";
  if (age <= MOBILE_PRESENCE_THRESHOLDS_MS.stale) return "stale";
  return "offline";
}

export function mobilePresenceLabel(presence: MobilePresence): string {
  switch (presence) {
    case "online": return "آنلاین";
    case "stale": return "قدیمی / نیازمند توجه";
    case "offline": return "آفلاین";
    default: return "نامشخص";
  }
}

export function parseManagementMode(value: unknown): MobileManagementMode {
  switch (value) {
    case "device_owner":
    case "profile_owner":
    case "legacy_device_admin":
    case "unmanaged":
      return value;
    default:
      return "unknown";
  }
}

export type PermissionHealthStatus = "granted" | "denied" | "unknown";
export type PermissionHealthItem = {
  key: string;
  label: string;
  status: PermissionHealthStatus;
};

const PERMISSION_LABELS: Record<string, string> = {
  location: "موقعیت مکانی",
  camera: "دوربین",
  microphone: "میکروفون",
  notifications: "اعلان‌ها",
  accessibility: "دسترسی دسترس‌پذیری",
  usageAccess: "دسترسی مصرف برنامه",
};

export function permissionHealthFromPayload(payload: unknown): PermissionHealthItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  return Object.entries(PERMISSION_LABELS).map(([key, label]) => ({
    key,
    label,
    status: typeof record[key] === "boolean"
      ? (record[key] ? "granted" : "denied")
      : "unknown",
  }));
}

export function formatRelativeAge(lastSeenAt: string | null, now = Date.now()): string {
  if (!lastSeenAt) return "هنوز گزارشی ثبت نشده";
  const timestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(timestamp)) return "زمان نامشخص";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return minutes.toLocaleString("fa-IR") + " دقیقه پیش";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours.toLocaleString("fa-IR") + " ساعت پیش";
  const days = Math.floor(hours / 24);
  return days.toLocaleString("fa-IR") + " روز پیش";
}
