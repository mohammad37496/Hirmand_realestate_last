import { createError, defineEventHandler, getHeader, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { loadDeviceByToken, readBearerForProbe } from "@/lib/phone-bridge-auth.server";
import { effectiveModulesForDevice } from "@/lib/phone-bridge-policy.server";

/**
 * Health / connectivity probe.
 *
 * `MainActivity.testConnection()` issues a plain authenticated GET here with no
 * HMAC headers, so this route authenticates the bearer token and the device id
 * but deliberately does not run signature verification — there is no body to
 * sign on a GET. It reports the modules the device may currently send, which is
 * what lets the app show "policy says X is off" without guessing.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const token = readBearerForProbe(event);
  if (!token) throw createError({ statusCode: 401, statusMessage: "توکن دستگاه ارسال نشده است." });

  // The token is verified before anything else, including the database-status
  // branch below. Returning a friendly "service is up" payload to an
  // unauthenticated caller would make this endpoint a public probe of a route
  // that is otherwise private.
  if (dbSource === "unconfigured") {
    throw createError({
      statusCode: 503,
      statusMessage: "پایگاه دادهٔ Phone Bridge تنظیم نشده است.",
    });
  }

  const device = await loadDeviceByToken(token, await getSql());
  if (!device) throw createError({ statusCode: 401, statusMessage: "توکن دستگاه نامعتبر است." });

  const headerDeviceId = (getHeader(event, "x-hirmand-device-id") ?? "").trim();
  if (headerDeviceId && headerDeviceId !== device.id) {
    throw createError({ statusCode: 401, statusMessage: "شناسهٔ دستگاه با توکن هم‌خوانی ندارد." });
  }

  const effective = await effectiveModulesForDevice(device.id);

  return {
    ok: true,
    service: "hirmand-phone-bridge",
    protocol: "hirmand.phone-bridge.v1",
    database: "ready",
    device: {
      id: device.id,
      name: device.name,
      enabled: device.enabled,
      appVersionName: device.appVersionName,
      appVersionCode: device.appVersionCode,
    },
    effectiveModules: effective,
  };
});