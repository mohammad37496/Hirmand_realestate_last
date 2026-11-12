import { defineEventHandler, getHeader, setResponseHeader } from "h3";
import { authenticateDevice, requireBootstrap } from "@/lib/phone-bridge-auth";
import { enforcePhoneBridgeIpRateLimit, enforcePhoneBridgeRateLimit, phoneBridgeRateLimitSubject } from "@/lib/phone-bridge-rate-limit.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const rateLimitConfig = { windowMs: 10 * 60 * 1000, maxHits: 60, blockMs: 5 * 60 * 1000 };
  await enforcePhoneBridgeIpRateLimit(event, "status", rateLimitConfig);
  const deviceId = getHeader(event, "x-hirmand-device-id")?.trim().slice(0, 120) ?? "";
  let subject = "bootstrap";
  if (deviceId) {
    const auth = await authenticateDevice(event, deviceId);
    subject = phoneBridgeRateLimitSubject(auth);
  }
  else {
    requireBootstrap(event);
  }
  await enforcePhoneBridgeRateLimit(event, "status", subject, rateLimitConfig);
  return {
    ok: true,
    service: "hirmand-phone-bridge",
    protocol: "hirmand.phone-bridge.v1",
  };
});
