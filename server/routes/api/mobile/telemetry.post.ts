import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { randomUUID } from "node:crypto";
import { dbSource, getSql } from "@/lib/db";
import { requireStaffMobileDevice } from "@/lib/staff-mobile-auth.server";
import { consumeStaffMobileRateLimit } from "@/lib/staff-mobile-rate-limit.server";

const EVENT_TYPES = new Set(["app_heartbeat", "permission_state"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const device = await requireStaffMobileDevice(event);
  const rate = consumeStaffMobileRateLimit("telemetry", device.device_id, {
    windowMs: 10 * 60 * 1000,
    maxHits: 120,
  });
  if (!rate.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: "تعداد درخواست‌های دستگاه بیش از حد مجاز است.",
      data: { retryAfterSeconds: rate.retryAfterSeconds },
    });
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>;
  const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
  if (!events.length) {
    throw createError({ statusCode: 400, statusMessage: "رویداد ارسالی وجود ندارد." });
  }

  const sql = await getSql();
  let accepted = 0;
  let rejected = 0;
  const acceptedTypes: string[] = [];
  let latestHeartbeatPayload: Record<string, unknown> | null = null;

  for (const item of events) {
    if (!item || typeof item !== "object") {
      rejected++;
      continue;
    }

    const row = item as Record<string, unknown>;
    const clientEventId = cleanText(row.clientEventId, 100);
    const eventType = cleanText(row.eventType, 40);
    const observedAt = validIso(row.observedAt);
    const payload = row.payload;

    if (
      !/^[a-zA-Z0-9._:-]{8,100}$/.test(clientEventId) ||
      !EVENT_TYPES.has(eventType) ||
      !observedAt ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      rejected++;
      continue;
    }

    const payloadJson = JSON.stringify(payload);
    if (payloadJson.length > 20_000) {
      rejected++;
      continue;
    }

    const rows = await sql.query<{ id: string }>(
      "insert into staff_mobile_telemetry " +
        "(id,device_id,staff_id,client_event_id,event_type,payload,observed_at) " +
        "values ($1,$2,$3,$4,$5,$6::jsonb,$7) " +
        "on conflict (device_id,client_event_id) do nothing " +
        "returning id",
      [randomUUID(), device.device_id, device.staff_id, clientEventId, eventType, payloadJson, observedAt],
    );

    if (rows.length) {
      accepted++;
      acceptedTypes.push(eventType);
      if (eventType === "app_heartbeat") {
        latestHeartbeatPayload = payload as Record<string, unknown>;
      }
    } else {
      // A duplicate event is already persisted and is therefore safe to count as accepted.
      accepted++;
      if (eventType === "app_heartbeat") {
        latestHeartbeatPayload = payload as Record<string, unknown>;
      }
    }
  }

  await sql.query(
    "insert into staff_mobile_ingest_log " +
      "(id,device_id,staff_id,endpoint,accepted_count,rejected_count) " +
      "values ($1,$2,$3,$4,$5,$6)",
    [randomUUID(), device.device_id, device.staff_id, "/api/mobile/telemetry", accepted, rejected],
  );

  await sql.query(
    "update staff_mobile_devices set last_seen_at=current_timestamp where id=$1",
    [device.id],
  );

  if (latestHeartbeatPayload) {
    const modeRaw = cleanText(latestHeartbeatPayload.managementMode, 32);
    const managementMode = new Set([
      "device_owner",
      "profile_owner",
      "legacy_device_admin",
      "unmanaged",
    ]).has(modeRaw)
      ? modeRaw
      : "unknown";
    const manufacturer = cleanText(latestHeartbeatPayload.manufacturer, 80);
    const model = cleanText(latestHeartbeatPayload.model, 120);
    const androidVersion = cleanText(latestHeartbeatPayload.androidVersion, 40);
    const rawSdk = Number(latestHeartbeatPayload.sdkInt);
    const sdkInt = Number.isInteger(rawSdk) && rawSdk >= 0 && rawSdk <= 100 ? rawSdk : null;

    await sql.query(
      "update staff_mobile_devices set " +
        "management_mode=$1,manufacturer=$2,model=$3,android_version=$4,sdk_int=$5,last_sync_at=current_timestamp " +
        "where id=$6",
      [managementMode, manufacturer, model, androidVersion, sdkInt, device.id],
    );
  }

  return {
    success: true,
    accepted,
    rejected,
    eventTypes: [...new Set(acceptedTypes)],
    remainingRateLimit: rate.remaining,
  };
});
