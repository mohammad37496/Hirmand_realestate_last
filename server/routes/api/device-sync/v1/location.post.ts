import { createError, defineEventHandler, readRawBody, setResponseHeader } from "h3";
import { randomUUID, createHash } from "node:crypto";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

const MAX_BODY_BYTES = 16 * 1024;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای دریافت موقعیت آماده نیست." });
  }

  const raw = await readRawBody(event);
  const body = raw ? Buffer.from(raw) : Buffer.alloc(0);
  if (!body.length || body.length > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "بدنهٔ موقعیت معتبر نیست." });
  }

  let payload: Record<string, unknown>;
  try {
    payload = object(JSON.parse(body.toString("utf8")));
  } catch {
    throw createError({ statusCode: 400, statusMessage: "دادهٔ موقعیت معتبر نیست." });
  }

  const deviceId = stringValue(payload.deviceId, 120);
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسه دستگاه ارسال نشده است." });

  await enforcePhoneBridgeRateLimit(event, "location", deviceId, {
    windowMs: 24 * 60 * 60 * 1000,
    maxHits: 5000,
    blockMs: 10 * 60 * 1000,
  });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, body);

  const sql = await getSql();
  const deviceRows = await sql.query<{ allowed_modules: unknown; enabled: boolean }>(
    `select allowed_modules,enabled from phone_bridge_devices where id=$1 limit 1`,
    [deviceId],
  );
  const device = deviceRows[0];
  if (!device?.enabled) throw createError({ statusCode: 403, statusMessage: "این دستگاه غیرفعال است." });

  const modules = object(device.allowed_modules);
  if (modules.location === false) {
    throw createError({ statusCode: 403, statusMessage: "ارسال موقعیت برای این دستگاه توسط مدیر غیرفعال شده است." });
  }

  const lat = finite(payload.latitude);
  const lng = finite(payload.longitude);
  const recordedAt = finite(payload.recordedAt);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw createError({ statusCode: 422, statusMessage: "مختصات موقعیت معتبر نیست." });
  }

  const clientPointId = stringValue(payload.clientPointId, 120);
  if (!clientPointId || !/^[A-Za-z0-9._:-]+$/.test(clientPointId)) {
    throw createError({ statusCode: 422, statusMessage: "شناسه نقطه موقعیت معتبر نیست." });
  }

  const accuracy = finite(payload.accuracyMeters);
  const altitude = finite(payload.altitudeMeters);
  const speed = finite(payload.speedMps);
  const bearing = finite(payload.bearingDegrees);
  const provider = stringValue(payload.provider, 40) || "gps";
  const timestamp = recordedAt !== null ? Math.max(0, Math.min(recordedAt, Date.now() + 10 * 60 * 1000)) : Date.now();

  const inserted = await sql.query<{ id: string }>(
    `insert into phone_bridge_location_points
      (id,device_id,client_point_id,recorded_at,latitude,longitude,accuracy_meters,altitude_meters,speed_mps,bearing_degrees,provider)
     values ($1,$2,$3,to_timestamp($4/1000.0),$5,$6,$7,$8,$9,$10,$11)
     on conflict (device_id,client_point_id) do nothing
     returning id`,
    [randomUUID(), deviceId, clientPointId, timestamp, lat, lng, accuracy, altitude, speed, bearing, provider],
  );

  await sql.query(
    `update phone_bridge_devices set last_location_at=case when $2::boolean then current_timestamp else last_location_at end where id=$1`,
    [deviceId, inserted.length > 0],
  );

  return {
    ok: true,
    accepted: inserted.length > 0,
    pointId: clientPointId,
    locationHash: createHash("sha256").update(body).digest("hex"),
  };
});
