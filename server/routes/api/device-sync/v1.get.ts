import { createError, defineEventHandler, getHeader, setResponseHeader, type H3Event } from "h3";
import { authenticateDevice, configuredBootstrapToken } from "@/lib/phone-bridge-auth";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await enforcePhoneBridgeRateLimit(event, "status", "connection-test", {
    windowMs: 10 * 60 * 1000,
    maxHits: 60,
    blockMs: 5 * 60 * 1000,
  });
  const deviceId = getHeader(event, "x-hirmand-device-id")?.trim().slice(0, 120) ?? "";
  if (deviceId) await authenticateDevice(event, deviceId);
  else {
    const bootstrap = configuredBootstrapToken();
    const auth = getHeader(event, "authorization") ?? "";
    if (!bootstrap || auth !== `Bearer ${bootstrap}`) {
      throw createError({ statusCode: 401, statusMessage: "احراز هویت Phone Bridge ناموفق است." });
    }
  }
  return {
    ok: true,
    service: "hirmand-phone-bridge",
    protocol: "hirmand.phone-bridge.v1",
  };
});
