import { createHash } from "node:crypto";

export type PhoneBridgeRateLimitConfig = {
  windowMs: number;
  maxHits: number;
  blockMs: number;
};

function hashRateLimitKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPhoneBridgeIpRateLimitKey(scope: string, remoteIp: string) {
  return hashRateLimitKey(`phone-bridge:ip:${scope}:${remoteIp || "unknown"}`);
}

export function createPhoneBridgeDeviceRateLimitKey(scope: string, deviceId: string) {
  return hashRateLimitKey(`phone-bridge:device:${scope}:${deviceId}`);
}

export function phoneBridgeRateLimitSubject(auth: { mode: "device" | "bootstrap"; deviceId: string }) {
  return auth.mode === "device" ? auth.deviceId : "bootstrap";
}

export function createPhoneBridgePreAuthRateLimitConfig(config: PhoneBridgeRateLimitConfig): PhoneBridgeRateLimitConfig {
  // A shared ingress/NAT may represent many legitimate devices. Keep this coarse
  // IP bucket generous; the strict per-device bucket runs after authentication.
  return { ...config, maxHits: Math.max(100, Math.min(5_000, config.maxHits * 10)) };
}
