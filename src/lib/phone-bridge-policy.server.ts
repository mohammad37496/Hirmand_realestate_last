/**
 * Server policy resolution.
 *
 * Kept apart from the auth module because the admin panel and the device-facing
 * routes both need to answer "which modules may this device send right now?"
 * without either of them re-implementing the gate.
 *
 * The mapping below is the single place where a module name is tied to the
 * payload key it governs. Adding a module means adding a row here — no route
 * needs to learn about it.
 */

import { getSql, type Sql } from "@/lib/db";
import {
  computeEffectiveAccess,
  loadDeviceById,
  type EffectiveAccess,
  type PhoneBridgeDevice,
  type PhoneBridgeModule,
} from "@/lib/phone-bridge-auth.server";
import type { SyncModule } from "@/lib/phone-bridge-payload.server";

/**
 * Module -> sync-packet key.
 *
 * `device_status` and `selected_files` have no dedicated key: the device block
 * and the `selectedFiles` array are always part of the envelope, so their gate
 * is applied by the route that writes them rather than by key stripping.
 */
export const MODULE_PAYLOAD_KEYS: Partial<Record<PhoneBridgeModule, string>> = {
  wifi: "wifi",
  location: "location",
  contacts: "contacts",
  calls: "calls",
  sms: "sms",
  calendar: "calendar",
  apps: "apps",
};

/** Human-readable Persian labels, used by the admin panel and audit rows. */
export const MODULE_LABELS: Record<PhoneBridgeModule, string> = {
  device_status: "وضعیت دستگاه",
  location: "موقعیت مکانی",
  wifi: "شبکهٔ Wi-Fi",
  contacts: "مخاطبین",
  calls: "تاریخچهٔ تماس",
  sms: "پیامک",
  calendar: "تقویم",
  apps: "فهرست برنامه‌ها",
  selected_files: "فایل‌های انتخاب‌شده",
  notifications: "اعلان‌ها",
  camera: "دوربین",
  microphone: "میکروفون",
  call_recording: "ضبط تماس",
  remote_control: "ریموت کنترل",
  app_blocking: "بلاک برنامه",
};

export async function effectiveAccessForDevice(
  deviceId: string,
  sql?: Sql,
): Promise<EffectiveAccess | null> {
  const db = sql ?? (await getSql());
  const device = await loadDeviceById(deviceId, db);
  if (!device) return null;
  return computeEffectiveAccess(device, db);
}

export async function effectiveModulesForDevice(
  deviceId: string,
  sql?: Sql,
): Promise<PhoneBridgeModule[]> {
  const access = await effectiveAccessForDevice(deviceId, sql);
  return access?.effective ?? [];
}

/**
 * Builds the `isAllowed` predicate `stripDisallowedModules` expects.
 *
 * `device_status` is always permitted when the device itself is enabled: the
 * health numbers are what the admin uses to find a device that needs attention,
 * and withholding them would make a disabled-appearing device undiagnosable.
 */
export function payloadModuleGate(access: EffectiveAccess): (module: SyncModule) => boolean {
  const effective = new Set<string>(access.effective);
  return (module) => effective.has(module);
}

export type { PhoneBridgeDevice, PhoneBridgeModule, EffectiveAccess };