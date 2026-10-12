import { createError } from "h3";
import type { PhoneBridgeModulePolicy } from "@/lib/phone-bridge-auth";

export type SyncModule = keyof PhoneBridgeModulePolicy;

export type { PhoneBridgeModulePolicy } from "@/lib/phone-bridge-auth";

export function normalizePhoneBridgePolicy(value: unknown): PhoneBridgeModulePolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const modules = [
    "location", "wifi", "contacts", "calls", "sms", "calendar",
    "apps", "camera", "microphone", "selectedFiles", "notifications",
  ] as const;
  return Object.fromEntries(modules.map((module) => [module, raw[module] !== false])) as PhoneBridgeModulePolicy;
}

type JsonObject = Record<string, unknown>;

export function optionalInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) ? value : null;
}

export function optionalIntField(value: unknown, defaultVal = 0): number {
  const v = optionalInt(value);
  return v === null ? defaultVal : v;
}

export function normalizeGrantedScopes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string").slice(0, 50);
}

export function stripDisallowedModules(
  payload: Record<string, unknown>,
  allowedModules: PhoneBridgeModulePolicy,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(result)) {
    if (key === "schema" || key === "device" || key === "sentAt" || key === "syncId" || key === "deviceStats" || key === "snapshotHash") continue;
    if (!allowedModules[key as SyncModule]) {
      delete result[key];
    }
  }
  return result;
}

export const syncPacketSchema = "hirmand.phone-bridge.v1";

const MAX_TEXT = 500;
const MAX_CONTACTS = 200;
const MAX_CALLS = 200;
const MAX_SMS = 200;
const MAX_CALENDAR = 200;
const MAX_APPS = 300;
const MAX_FILES = 20;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoMs(value: unknown) {
  const n = finite(value);
  return n !== null && n >= 0 ? n : null;
}

function limitedArray(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function sanitizeContacts(value: unknown) {
  return limitedArray(value, MAX_CONTACTS).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const contactId = text(o.contactId, 120);
    const name = text(o.name, 180);
    const number = text(o.number, 80);
    const lastUpdatedAt = isoMs(o.lastUpdatedAt) ?? 0;
    const rawNumbers = Array.isArray(o.numbers) ? o.numbers : (number ? [number] : []);
    const numbers = [...new Set(rawNumbers.map((item) => text(item, 80)).filter(Boolean))].slice(0, 20);
    return contactId || name || numbers.length
      ? [{ contactId, name, numbers, lastUpdatedAt }]
      : [];
  });
}

function sanitizeCalls(value: unknown) {
  return limitedArray(value, MAX_CALLS).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const number = text(o.number, 80);
    const type = int(o.type);
    const date = isoMs(o.date);
    const duration = int(o.durationSeconds);
    return number || date !== null
      ? [{ number, type: type === null ? 0 : Math.max(0, Math.min(type, 99)), date: date ?? 0, durationSeconds: duration === null ? 0 : Math.max(0, Math.min(duration, 86400)) }]
      : [];
  });
}

function sanitizeSms(value: unknown) {
  return limitedArray(value, MAX_SMS).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const address = text(o.address, 120);
    const date = isoMs(o.date);
    const type = int(o.type);
    const body = text(o.body, 4000);
    return address || body || date !== null ? [{
      address,
      date: date ?? 0,
      type: type === null ? 0 : Math.max(0, Math.min(type, 99)),
      body,
    }] : [];
  });
}

function sanitizeCalendar(value: unknown) {
  return limitedArray(value, MAX_CALENDAR).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const title = text(o.title, 300);
    const description = text(o.description, 2000);
    const start = isoMs(o.start);
    const end = isoMs(o.end);
    const location = text(o.location, 500);
    return title || description || start !== null ? [{
      title,
      description,
      start: start ?? 0,
      end: end ?? 0,
      location,
    }] : [];
  });
}

function sanitizeApps(value: unknown) {
  return limitedArray(value, MAX_APPS).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const packageName = text(o.packageName, 220);
    if (!packageName) return [];
    return [{
      packageName,
      label: text(o.label, 180),
      activity: text(o.activity, 300),
      versionName: text(o.versionName, 120),
      firstInstallTime: isoMs(o.firstInstallTime) ?? 0,
      lastUpdateTime: isoMs(o.lastUpdateTime) ?? 0,
      isSystemApp: o.isSystemApp === true,
      enabled: o.enabled !== false,
    }];
  });
}

function sanitizeFiles(value: unknown) {
  return limitedArray(value, MAX_FILES).flatMap((item) => {
    const o = asObject(item);
    if (!o) return [];
    const name = text(o.name, 180);
    const mimeType = text(o.mimeType, 180);
    const sizeBytes = int(o.sizeBytes);
    return name || mimeType
      ? [{
          name,
          mimeType: mimeType || "application/octet-stream",
          sizeBytes: sizeBytes === null ? 0 : Math.max(0, Math.min(sizeBytes, 8 * 1024 * 1024)),
          selectedAt: isoMs(o.selectedAt) ?? 0,
          lastUploadedHash: /^[a-f0-9]{64}$/i.test(text(o.lastUploadedHash, 64)) ? text(o.lastUploadedHash, 64).toLowerCase() : "",
          lastUploadedAt: isoMs(o.lastUploadedAt) ?? 0,
          lastUploadedFileId: text(o.lastUploadedFileId, 120),
        }]
      : [];
  });
}

function sanitizeDevice(value: unknown) {
  const o = asObject(value);
  if (!o) throw createError({ statusCode: 400, statusMessage: "اطلاعات دستگاه Phone Bridge معتبر نیست." });
  const id = text(o.id, 120);
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: "شناسهٔ دستگاه Phone Bridge معتبر نیست." });
  }
  return {
    id,
    name: text(o.name, 120) || "گوشی",
    manufacturer: text(o.manufacturer, 120),
    model: text(o.model, 180),
    androidVersion: text(o.androidVersion, 80),
    sdkInt: int(o.sdkInt),
    appVersionName: text(o.appVersionName, 80) || "unknown",
    appVersionCode: int(o.appVersionCode) == null ? 1 : Math.max(1, Math.min(int(o.appVersionCode) as number, 1000000)),
  };
}

export function sanitizePhoneBridgePayload(input: unknown, allowedModules: PhoneBridgeModulePolicy) {
  const root = asObject(input);
  if (!root) {
    throw createError({ statusCode: 400, statusMessage: "بدنهٔ درخواست Phone Bridge معتبر نیست." });
  }

  const schema = text(root.schema, 120);
  if (schema !== "hirmand.phone-bridge.v1") {
    throw createError({ statusCode: 400, statusMessage: "نسخهٔ دادهٔ Phone Bridge پشتیبانی نمی‌شود." });
  }

  const device = sanitizeDevice(root.device);
  const result: JsonObject = {
    schema,
    device,
    sentAt: isoMs(root.sentAt) ?? Date.now(),
    syncId: text(root.syncId, 120),
    deviceStats: sanitizeDeviceStats(root.deviceStats),
  };
  const snapshotHash = text(root.snapshotHash, 64).toLowerCase();
  if (/^[a-f0-9]{64}$/.test(snapshotHash)) result.snapshotHash = snapshotHash;

  if (allowedModules.location) {
    const location = asObject(root.location);
    if (location) {
      const latitude = finite(location.latitude);
      const longitude = finite(location.longitude);
      const accuracyMeters = finite(location.accuracyMeters);
      const timestamp = isoMs(location.timestamp);
      if (
        latitude !== null && latitude >= -90 && latitude <= 90 &&
        longitude !== null && longitude >= -180 && longitude <= 180
      ) {
        result.location = {
          latitude,
          longitude,
          accuracyMeters: accuracyMeters === null ? null : Math.max(0, Math.min(accuracyMeters, 100000)),
          timestamp: timestamp ?? Date.now(),
        };
      }
    }
  }

  if (allowedModules.wifi) {
    const wifi = asObject(root.wifi);
    if (wifi) {
      result.wifi = {
        ssid: text(wifi.ssid, 200),
        linkSpeedMbps: int(wifi.linkSpeedMbps),
        rssi: int(wifi.rssi),
        networkId: int(wifi.networkId),
      };
    }
  }

  if (allowedModules.contacts) result.contacts = sanitizeContacts(root.contacts);
  if (allowedModules.calls) result.calls = sanitizeCalls(root.calls);
  if (allowedModules.sms) result.sms = sanitizeSms(root.sms);
  if (allowedModules.calendar) result.calendar = sanitizeCalendar(root.calendar);
  if (allowedModules.apps) result.apps = sanitizeApps(root.apps);
  if (allowedModules.selectedFiles) result.selectedFiles = sanitizeFiles(root.selectedFiles);

  return result;
}

function sanitizeDeviceStats(value: unknown) {
  const o = asObject(value);
  if (!o) return {};
  const battery = int(o.batteryPercent);
  const storageAvailable = int(o.storageAvailableBytes);
  const storageTotal = int(o.storageTotalBytes);
  const ramAvailable = int(o.ramAvailableBytes);
  const ramTotal = int(o.ramTotalBytes);
  return {
    batteryPercent: battery === null ? null : Math.max(0, Math.min(100, battery)),
    batteryCharging: typeof o.batteryCharging === "boolean" ? o.batteryCharging : null,
    storageAvailableBytes: storageAvailable === null ? null : Math.max(0, storageAvailable),
    storageTotalBytes: storageTotal === null ? null : Math.max(0, storageTotal),
    ramAvailableBytes: ramAvailable === null ? null : Math.max(0, ramAvailable),
    ramTotalBytes: ramTotal === null ? null : Math.max(0, ramTotal),
    lowMemory: typeof o.lowMemory === "boolean" ? o.lowMemory : false,
  };
}
