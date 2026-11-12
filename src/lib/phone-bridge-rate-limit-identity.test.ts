import assert from "node:assert/strict";
import test from "node:test";
import {
  createPhoneBridgeDeviceRateLimitKey,
  createPhoneBridgeIpRateLimitKey,
  createPhoneBridgePreAuthRateLimitConfig,
  phoneBridgeRateLimitSubject,
} from "./phone-bridge-rate-limit-identity.ts";

test("pre-auth buckets use peer IP only and cannot be split by a request subject", () => {
  const first = createPhoneBridgeIpRateLimitKey("sync", "198.51.100.10");
  const samePeer = createPhoneBridgeIpRateLimitKey("sync", "198.51.100.10");
  const differentPeer = createPhoneBridgeIpRateLimitKey("sync", "198.51.100.11");

  assert.equal(first, samePeer);
  assert.notEqual(first, differentPeer);
});

test("authenticated device buckets are stable and isolated by canonical device id", () => {
  const first = createPhoneBridgeDeviceRateLimitKey("sync", "device-1");
  assert.equal(first, createPhoneBridgeDeviceRateLimitKey("sync", "device-1"));
  assert.notEqual(first, createPhoneBridgeDeviceRateLimitKey("sync", "device-2"));
  assert.notEqual(first, createPhoneBridgeDeviceRateLimitKey("heartbeat", "device-1"));
});

test("bootstrap authentication never trusts the caller-supplied device id as a quota subject", () => {
  assert.equal(phoneBridgeRateLimitSubject({ mode: "bootstrap", deviceId: "attacker-chosen-id" }), "bootstrap");
  assert.equal(phoneBridgeRateLimitSubject({ mode: "device", deviceId: "verified-device" }), "verified-device");
});

test("pre-auth IP caps tolerate shared ingress while remaining bounded", () => {
  assert.equal(createPhoneBridgePreAuthRateLimitConfig({ windowMs: 1000, maxHits: 5, blockMs: 1000 }).maxHits, 100);
  assert.equal(createPhoneBridgePreAuthRateLimitConfig({ windowMs: 1000, maxHits: 120, blockMs: 1000 }).maxHits, 1200);
  assert.equal(createPhoneBridgePreAuthRateLimitConfig({ windowMs: 1000, maxHits: 9000, blockMs: 1000 }).maxHits, 5000);
});
