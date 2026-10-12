import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePhoneBridgePayload } from "./phone-bridge-payload.server.ts";

const allowAll = {
  location: true,
  wifi: true,
  contacts: true,
  calls: true,
  sms: true,
  calendar: true,
  apps: true,
  camera: true,
  microphone: true,
  selectedFiles: true,
  notifications: true,
};

const basePayload = {
  schema: "hirmand.phone-bridge.v1",
  sentAt: Date.now(),
  syncId: "sync-123",
  snapshotHash: "a".repeat(64),
  device: {
    id: "device-01",
    name: "گوشی",
    manufacturer: "Test",
    model: "Model",
    androidVersion: "14",
    sdkInt: 34,
    appVersionName: "0.2.0",
    appVersionCode: 20,
  },
  deviceStats: {
    batteryPercent: 55,
    batteryCharging: true,
  },
  contacts: [{ name: "Ali", number: "0912" }],
  calls: [{ number: "0912", type: 1, date: Date.now(), durationSeconds: 30 }],
  sms: [{ address: "0912", date: Date.now(), type: 1, body: "hello" }],
  calendar: [{ title: "Meeting", description: "test", start: Date.now(), end: Date.now() + 1000, location: "Office" }],
  apps: [{ packageName: "com.example", label: "Example", activity: "MainActivity" }],
  location: { latitude: 32.0, longitude: 51.6, accuracyMeters: 20, timestamp: Date.now() },
  wifi: { ssid: "test", linkSpeedMbps: 100, rssi: -40, networkId: 1 },
  selectedFiles: [{ name: "a.pdf", mimeType: "application/pdf", sizeBytes: 100 }],
};

test("rejects unsupported Phone Bridge schema", () => {
  assert.throws(
    () => sanitizePhoneBridgePayload({ ...basePayload, schema: "hirmand.phone-bridge.v2" }, allowAll),
    /نسخهٔ داده/,
  );
});

test("removes modules denied by the server policy", () => {
  const result = sanitizePhoneBridgePayload(
    basePayload,
    { ...allowAll, contacts: false, sms: false, selectedFiles: false },
  );

  assert.equal("contacts" in result, false);
  assert.equal("sms" in result, false);
  assert.equal("selectedFiles" in result, false);
  assert.equal(Array.isArray(result.calls), true);
});

test("bounds and sanitizes oversized collections and invalid values", () => {
  const result = sanitizePhoneBridgePayload(
    {
      ...basePayload,
      location: { latitude: 999, longitude: -999, accuracyMeters: -1, timestamp: -5 },
      contacts: Array.from({ length: 250 }, (_, i) => ({ name: "x".repeat(1000), number: String(i) })),
      apps: Array.from({ length: 350 }, (_, i) => ({ packageName: "com.example." + i, label: "x".repeat(1000) })),
      selectedFiles: [{ name: "x".repeat(1000), mimeType: "application/pdf", sizeBytes: 999999999 }],
    },
    allowAll,
  );

  assert.equal(result.location, undefined);
  assert.equal((result.contacts as unknown[]).length, 200);
  assert.equal((result.apps as unknown[]).length, 300);
  assert.equal((result.selectedFiles as Array<{ sizeBytes: number }>)[0].sizeBytes, 8 * 1024 * 1024);
  assert.equal((result.contacts as Array<{ name: string }>)[0].name.length, 180);
});

test("keeps only approved root fields and validates snapshot hash", () => {
  const result = sanitizePhoneBridgePayload(
    { ...basePayload, secret: "do-not-store", snapshotHash: "bad" },
    allowAll,
  );

  assert.equal("secret" in result, false);
  assert.equal("snapshotHash" in result, false);
});


test("preserves validated app version fields", () => {
  const result = sanitizePhoneBridgePayload(basePayload, allowAll);
  const device = result.device as { appVersionName: string; appVersionCode: number };
  assert.equal(device.appVersionName, "0.2.0");
  assert.equal(device.appVersionCode, 20);
});
