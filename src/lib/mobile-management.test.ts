import assert from "node:assert/strict";
import test from "node:test";
import {
  getMobilePresence,
  managementModeLabel,
  parseManagementMode,
  permissionHealthFromPayload,
} from "./mobile-management.ts";

const now = Date.parse("2026-10-06T00:00:00.000Z");

test("mobile-management presence thresholds stay consistent", () => {
  assert.equal(getMobilePresence(new Date(now - 4 * 60 * 1000).toISOString(), now), "online");
  assert.equal(getMobilePresence(new Date(now - 30 * 60 * 1000).toISOString(), now), "stale");
  assert.equal(getMobilePresence(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now), "offline");
  assert.equal(getMobilePresence(null, now), "unknown");
});

test("mobile-management normalizes management modes", () => {
  assert.equal(parseManagementMode("device_owner"), "device_owner");
  assert.equal(parseManagementMode("profile_owner"), "profile_owner");
  assert.equal(parseManagementMode("not-real"), "unknown");
  assert.equal(managementModeLabel("device_owner"), "مدیریت کامل سازمانی");
});

test("mobile-management maps permission telemetry", () => {
  assert.deepEqual(
    permissionHealthFromPayload({
      location: true,
      camera: false,
      microphone: "unknown",
    }),
    [
      { key: "location", label: "موقعیت مکانی", status: "granted" },
      { key: "camera", label: "دوربین", status: "denied" },
      { key: "microphone", label: "میکروفون", status: "unknown" },
      { key: "notifications", label: "اعلان‌ها", status: "unknown" },
      { key: "accessibility", label: "دسترسی دسترس‌پذیری", status: "unknown" },
      { key: "usageAccess", label: "دسترسی مصرف برنامه", status: "unknown" },
    ],
  );
});
