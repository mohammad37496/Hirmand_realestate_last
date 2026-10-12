import { createError, defineEventHandler, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { generateDeviceToken, hashToken, requireBootstrap } from "@/lib/phone-bridge-auth";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

type Obj = Record<string, unknown>;
function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
function str(value: unknown, fallback = "", max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) ? value : null;
}

export default defineEventHandler(async (event: H3Event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await enforcePhoneBridgeRateLimit(event, "register", "bootstrap", {
    windowMs: 15 * 60 * 1000,
    maxHits: 5,
    blockMs: 30 * 60 * 1000,
  });
  try {
    requireBootstrap(event);
  } catch (error) {
    await recordPhoneBridgeEvent({
      eventType: "security.bootstrap_failed",
      severity: "error",
      message: "تلاش ناموفق برای ثبت اولیهٔ Phone Bridge.",
      metadata: {
        route: "/api/device-sync/v1/register",
      },
    }).catch(() => undefined);
    throw error;
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای ثبت دستگاه در دسترس نیست." });
  }

  const body = obj(await readBody(event).catch(() => null));
  const device = obj(body.device);
  const deviceId = str(device.id, "", 120);
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسهٔ نصب گوشی ارسال نشده است." });
  const appVersionName = str(device.appVersionName, "unknown", 80);
  const appVersionCode = Math.max(1, Math.min(int(device.appVersionCode) ?? 1, 1000000));

  const consent = obj(body.consent);
  const consentVersion = Math.max(0, Math.min(int(consent.version) ?? 0, 100));
  const consentAcceptedAtMs = int(consent.acceptedAt);
  const consentAcceptedAt =
    consentAcceptedAtMs !== null && consentAcceptedAtMs > 0 && consentAcceptedAtMs <= Date.now() + 10 * 60 * 1000
      ? new Date(consentAcceptedAtMs).toISOString()
      : null;
  const consentScopes = Array.isArray(consent.scopes)
    ? [...new Set(consent.scopes.filter((value): value is string => typeof value === "string").map(value => value.trim().slice(0, 80)).filter(Boolean))].slice(0, 32)
    : [];

  const token = generateDeviceToken();
  const sql = await getSql();
  await sql.query(
    `insert into phone_bridge_devices
      (id,name,manufacturer,model,android_version,sdk_int,app_version_name,app_version_code,token_hash,token_created_at,last_authenticated_at,enabled,consent_version,consent_accepted_at,consent_scopes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,current_timestamp,current_timestamp,true,$10,$11,$12::jsonb)
     on conflict (id) do update set
       name=excluded.name,
       manufacturer=excluded.manufacturer,
       model=excluded.model,
       android_version=excluded.android_version,
       sdk_int=excluded.sdk_int,
       app_version_name=excluded.app_version_name,
       app_version_code=excluded.app_version_code,
       token_hash=excluded.token_hash,
       token_created_at=current_timestamp,
       last_authenticated_at=current_timestamp,
       enabled=true,
       consent_version=case when excluded.consent_version > 0 then excluded.consent_version else phone_bridge_devices.consent_version end,
       consent_accepted_at=case when excluded.consent_version > 0 then excluded.consent_accepted_at else phone_bridge_devices.consent_accepted_at end,
       consent_scopes=case when excluded.consent_version > 0 then excluded.consent_scopes else phone_bridge_devices.consent_scopes end`,
    [
      deviceId,
      str(device.name, "گوشی"),
      str(device.manufacturer),
      str(device.model),
      str(device.androidVersion),
      int(device.sdkInt),
      appVersionName,
      appVersionCode,
      hashToken(token),
      consentVersion,
      consentAcceptedAt,
      JSON.stringify(consentScopes),
    ],
  );

  await recordPhoneBridgeEvent({
    deviceId,
    eventType: "device.registered",
    severity: "info",
    message: "یک دستگاه Phone Bridge ثبت شد یا توکن آن بازتولید شد.",
    metadata: { route: "/api/device-sync/v1/register" },
  }).catch(() => undefined);

  return {
    ok: true,
    deviceId,
    deviceToken: token,
    registeredAt: new Date().toISOString(),
  };
});
