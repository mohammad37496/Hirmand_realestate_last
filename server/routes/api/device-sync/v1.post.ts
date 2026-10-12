import { createHash, randomUUID } from "node:crypto";
import { createError, defineEventHandler, readRawBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { sanitizePhoneBridgePayload } from "@/lib/phone-bridge-payload.server";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 500) : fallback;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) ? value : null;
}

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function summaryFor(payload: JsonObject) {
  return {
    contacts: arrayCount(payload.contacts),
    calls: arrayCount(payload.calls),
    sms: arrayCount(payload.sms),
    calendar: arrayCount(payload.calendar),
    apps: arrayCount(payload.apps),
    selectedFiles: arrayCount(payload.selectedFiles),
    hasLocation: Boolean(payload.location),
    hasWifi: Boolean(payload.wifi),
    hasDeviceStats: Boolean(payload.deviceStats),
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای دریافت دادهٔ گوشی در دسترس نیست." });
  }

  const raw = await readRawBody(event);
  const rawBody = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? "");
  const parsedPayload: unknown = (() => {
    try {
      return JSON.parse(rawBody.toString("utf8"));
    } catch {
      return null;
    }
  })();
  const envelope = asObject(parsedPayload);
  const device = asObject(envelope.device);
  const deviceId = asString(device.id);

  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: "شناسهٔ نصب گوشی ارسال نشده است." });
  }
  await enforcePhoneBridgeRateLimit(event, "sync", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 120,
    blockMs: 10 * 60 * 1000,
  });
  let authPolicy: Awaited<ReturnType<typeof authenticateDevice>>;
  try {
    authPolicy = await authenticateDevice(event, deviceId);
    if (authPolicy.mode === "device") {
      await requirePhoneBridgeSignedRequest(event, deviceId, rawBody);
    }
  } catch (error) {
    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "security.auth_failed",
      severity: "error",
      message: "احراز هویت دستگاه برای Sync ناموفق بود.",
      metadata: { route: "/api/device-sync/v1" },
    }).catch(() => undefined);
    throw error;
  }

  let payload: JsonObject;
  try {
    payload = sanitizePhoneBridgePayload(parsedPayload, authPolicy.allowedModules);
  } catch (error) {
    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "security.payload_rejected",
      severity: "warning",
      message: "بستهٔ Phone Bridge به‌دلیل ساختار یا مقدار نامعتبر رد شد.",
      metadata: { route: "/api/device-sync/v1" },
    }).catch(() => undefined);
    throw error;
  }

  const originalModuleKeys = ["location", "wifi", "contacts", "calls", "sms", "calendar", "apps", "selectedFiles"] as const;
  const strippedModules = originalModuleKeys.filter((key) => envelope[key] != null && payload[key] == null);

  if (strippedModules.length > 0) {
    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "security.module_policy_blocked",
      severity: "warning",
      message: "بخش‌هایی از بستهٔ Phone Bridge طبق سیاست دستگاه ذخیره نشدند.",
      metadata: { blockedModules: strippedModules },
    }).catch(() => undefined);
  }

  const schemaName = String(payload.schema);
  const encoded = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(encoded, "utf8");
  if (payloadBytes > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "حجم بستهٔ Phone Bridge بیش از حد مجاز است." });
  }

  const syncId = asString(payload.syncId) || randomUUID();
  const summary = summaryFor(payload);
  const sentAtRaw = typeof payload.sentAt === "number" && Number.isFinite(payload.sentAt)
    ? new Date(payload.sentAt)
    : null;
  const sentAt = sentAtRaw && Number.isFinite(sentAtRaw.getTime()) ? sentAtRaw.toISOString() : null;

  const sql = await getSql();

  const appVersionCode = asInt(asObject(payload.device).appVersionCode) ?? 1;
  const appVersionName = asString(asObject(payload.device).appVersionName, "unknown");
  const versionRows = await sql.query<{ min_app_version_code: number }>(
    `select min_app_version_code from phone_bridge_devices where id=$1 limit 1`,
    [deviceId],
  );
  const minAppVersionCode = Number(versionRows[0]?.min_app_version_code ?? 0);
  if (minAppVersionCode > 0 && appVersionCode < minAppVersionCode) {
    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "security.outdated_client_blocked",
      severity: "warning",
      message: "Sync دستگاه به‌دلیل قدیمی بودن نسخهٔ Phone Bridge رد شد.",
      metadata: { appVersionCode, minAppVersionCode },
    }).catch(() => undefined);
    throw createError({ statusCode: 426, statusMessage: "نسخهٔ Phone Bridge قدیمی است و باید به‌روزرسانی شود." });
  }

  await sql.query(
    `insert into phone_bridge_devices
      (id,name,manufacturer,model,android_version,sdk_int,app_version_name,app_version_code,last_seen_at,last_sync_id,last_summary)
     values ($1,$2,$3,$4,$5,$6,$7,$8,current_timestamp,$9,$10::jsonb)
     on conflict (id) do update set
       name=excluded.name,
       manufacturer=excluded.manufacturer,
       model=excluded.model,
       android_version=excluded.android_version,
       sdk_int=excluded.sdk_int,
       app_version_name=excluded.app_version_name,
       app_version_code=excluded.app_version_code,
       last_seen_at=current_timestamp,
       last_sync_id=excluded.last_sync_id,
       last_summary=excluded.last_summary,
       last_snapshot_policy_revision=phone_bridge_devices.policy_revision`,
    [
      deviceId,
      asString(device.name, "گوشی"),
      asString(device.manufacturer),
      asString(device.model),
      asString(device.androidVersion),
      asInt(device.sdkInt),
      appVersionName,
      appVersionCode,
      syncId,
      JSON.stringify(summary),
    ],
  );

  const inserted = await sql.query<{ id: string }>(
    `insert into phone_bridge_syncs
      (id,device_id,schema_name,sent_at,payload_bytes,summary,payload)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
     on conflict (id) do nothing
     returning id`,
    [
      syncId,
      deviceId,
      schemaName,
      sentAt,
      payloadBytes,
      JSON.stringify(summary),
      encoded,
    ],
  );

  const smsItems = Array.isArray(payload.sms) ? payload.sms : [];
  const contactItems = Array.isArray(payload.contacts) ? payload.contacts : [];
  if (contactItems.length > 0) {
    for (const item of contactItems) {
      const contact = asObject(item);
      const contactId = asString(contact.contactId, "").slice(0, 120);
      const name = asString(contact.name, "").slice(0, 180);
      const rawNumbers = Array.isArray(contact.numbers) ? contact.numbers : [];
      const legacyNumber = asString(contact.number, "").slice(0, 80);
      const numbers = [...new Set([
        ...rawNumbers.map((number) => asString(number, "").slice(0, 80)),
        ...(legacyNumber ? [legacyNumber] : []),
      ].filter(Boolean))].slice(0, 20);
      if (!contactId && !name && numbers.length === 0) continue;
      const fallbackKey = createHash("sha256")
        .update([deviceId, name, ...numbers].join(""), "utf8")
        .digest("hex");
      const contactKey = contactId || fallbackKey;
      const lastUpdatedAt = typeof contact.lastUpdatedAt === "number" && Number.isFinite(contact.lastUpdatedAt)
        ? Math.max(0, Math.min(contact.lastUpdatedAt, Date.now() + 10 * 60 * 1000))
        : 0;

      await sql.query(
        `insert into phone_bridge_contacts
          (id,device_id,contact_key,contact_id,name,numbers,phone_updated_at,first_seen_at,last_seen_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,case when $7::double precision > 0 then to_timestamp($7/1000.0) else null end,current_timestamp,current_timestamp)
         on conflict (device_id,contact_key) do update set
          contact_id=excluded.contact_id,
          name=excluded.name,
          numbers=excluded.numbers,
          phone_updated_at=excluded.phone_updated_at,
          last_seen_at=current_timestamp`,
        [randomUUID(), deviceId, contactKey, contactId || contactKey, name, JSON.stringify(numbers), lastUpdatedAt],
      );
    }
  }

  const contactNames = new Map<string, string>();
  for (const item of contactItems) {
    const contact = asObject(item);
    const name = asString(contact.name, "").slice(0, 180);
    const rawNumbers = Array.isArray(contact.numbers) ? contact.numbers : [];
    const legacyNumber = asString(contact.number, "");
    const numbers = [...new Set([
      ...rawNumbers.map((number) => asString(number, "")),
      ...(legacyNumber ? [legacyNumber] : []),
    ].filter(Boolean))];
    if (name) {
      for (const number of numbers) {
        contactNames.set(number.replace(/\D/g, ""), name);
      }
    }
  }
  if (smsItems.length > 0) {
    for (const item of smsItems) {
      const sms = asObject(item);
      const address = asString(sms.address, "").slice(0, 120);
      const body = asString(sms.body, "").slice(0, 4000);
      const messageType = asInt(sms.type) ?? 0;
      const dateMs = typeof sms.date === "number" && Number.isFinite(sms.date) ? sms.date : Date.now();
      const fingerprint = [deviceId, address, String(messageType), String(Math.trunc(dateMs)), body].join("\u001f");
      const messageHash = createHash("sha256").update(fingerprint, "utf8").digest("hex");
      const direction = messageType === 1 ? "incoming" : messageType === 2 ? "outgoing" : "other";
      const contactName = contactNames.get(address.replace(/\D/g, "")) ?? null;

      await sql.query(
        `insert into phone_bridge_sms_messages
          (id,device_id,message_hash,address,contact_name,message_type,direction,sent_at,body,last_seen_at)
         values ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),$9,current_timestamp)
         on conflict (device_id,message_hash) do update set
           address=excluded.address,
           contact_name=excluded.contact_name,
           message_type=excluded.message_type,
           direction=excluded.direction,
           sent_at=excluded.sent_at,
           body=excluded.body,
           last_seen_at=current_timestamp`,
        [randomUUID(), deviceId, messageHash, address || null, contactName, messageType, direction, dateMs, body],
      );
    }
  }
  const appItems = Array.isArray(payload.apps) ? payload.apps : [];
  if (appItems.length > 0) {
    await sql.query(
      `insert into phone_bridge_apps
        (id,device_id,package_name,label,activity,version_name,first_install_at,last_update_at,is_system_app,enabled,last_seen_at)
       select
        md5($1 || ':' || (item->>'packageName'))::uuid,
        $1,
        left(item->>'packageName',220),
        left(coalesce(item->>'label',''),180),
        left(coalesce(item->>'activity',''),300),
        left(coalesce(item->>'versionName',''),120),
        case when coalesce((item->>'firstInstallTime')::double precision,0) > 0 then to_timestamp((item->>'firstInstallTime')::double precision / 1000.0) else null end,
        case when coalesce((item->>'lastUpdateTime')::double precision,0) > 0 then to_timestamp((item->>'lastUpdateTime')::double precision / 1000.0) else null end,
        coalesce((item->>'isSystemApp')::boolean,false),
        coalesce((item->>'enabled')::boolean,true),
        current_timestamp
       from jsonb_array_elements($2::jsonb) item
       on conflict (device_id,package_name) do update set
        label=excluded.label,
        activity=excluded.activity,
        version_name=excluded.version_name,
        first_install_at=excluded.first_install_at,
        last_update_at=excluded.last_update_at,
        is_system_app=excluded.is_system_app,
        enabled=excluded.enabled,
        last_seen_at=current_timestamp`,
      [deviceId, JSON.stringify(appItems)],
    );
  }


  return {
    ok: true,
    accepted: inserted.length > 0,
    syncId,
    deviceId,
    receivedAt: new Date().toISOString(),
    summary,
    allowedModules: authPolicy.allowedModules,
  };
});
