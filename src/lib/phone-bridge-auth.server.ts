/**
 * Authentication, enrollment and policy enforcement for Phone Bridge.
 *
 * The rule this module exists to make unavoidable:
 *
 *   Effective access = consent AND android permission AND server policy AND device enabled
 *
 * The server can only see three of those four (it has no view of the OS
 * permission dialog), so on its side it enforces device-enabled AND consent AND
 * policy — and the Android client independently enforces the OS permission. A
 * module that is not effective on the device therefore never produces a payload,
 * and a payload that somehow did arrive is stripped or refused here.
 *
 * Server policy is a *narrowing* control only: `effectiveModules` intersects
 * policy with consent, so an operator enabling a module can never manufacture
 * consent the user never gave.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createError, getHeader, getRequestIP, readRawBody, type H3Event } from "h3";
import { dbSource, getSql, type Sql } from "@/lib/db";
import {
  checkSignatureFreshness,
  rememberNonce,
  sha256Hex,
  verifySignature,
} from "@/lib/phone-bridge-signature.server";
import { normalizeGrantedScopes, optionalInt } from "@/lib/phone-bridge-payload.server";

export type PhoneBridgeDevice = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number | null;
  appVersionName: string;
  appVersionCode: number | null;
  enabled: boolean;
  employee: string;
  groupName: string;
  lastSnapshotHash: string;
  lastAppVersionCode: number | null;
};

/** Modules the server understands. Mirrors the Android `ConsentRegistry` ids. */
export const PHONE_BRIDGE_MODULES = [
  "device_status",
  "location",
  "wifi",
  "contacts",
  "calls",
  "sms",
  "calendar",
  "apps",
  "selected_files",
  "notifications",
  "camera",
  "microphone",
  "call_recording",
  "remote_control",
  "app_blocking",
] as const;

export type PhoneBridgeModule = (typeof PHONE_BRIDGE_MODULES)[number];

/**
 * Defaults applied when a device has no explicit policy row.
 *
 * Deliberately conservative: a device with no policy row is *read-only*. An
 * operator must explicitly opt a device into the modules they want collected,
 * so a missed policy row fails closed instead of silently harvesting a phone.
 */
const DEFAULT_POLICY_MODULES: ReadonlySet<PhoneBridgeModule> = new Set<PhoneBridgeModule>([
  "device_status",
]);

function mapDevice(row: Record<string, unknown>): PhoneBridgeDevice {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    manufacturer: String(row.manufacturer ?? ""),
    model: String(row.model ?? ""),
    androidVersion: String(row.android_version ?? ""),
    sdkInt: optionalInt(row.sdk_int),
    appVersionName: String(row.app_version_name ?? ""),
    appVersionCode: optionalInt(row.app_version_code),
    enabled: row.enabled === true,
    employee: String(row.employee ?? ""),
    groupName: String(row.group_name ?? ""),
    lastSnapshotHash: String(row.last_snapshot_hash ?? ""),
    lastAppVersionCode: optionalInt(row.last_app_version_code),
  };
}

export async function loadDeviceById(deviceId: string, sql?: Sql): Promise<PhoneBridgeDevice | null> {
  const db = sql ?? (await getSql());
  const rows = await db.query<Record<string, unknown>>(
    `select id, name, manufacturer, model, android_version, sdk_int, app_version_name,
            app_version_code, enabled, employee, group_name, last_sync_hash,
            last_app_version_code
       from phone_bridge_devices
      where id = $1
      limit 1`,
    [deviceId],
  );
  return rows[0] ? mapDevice(rows[0]) : null;
}

/**
 * Resolves a bearer token to a device.
 *
 * The token is compared as a sha256 hash, so a database dump never yields a
 * usable credential, and a revoked token resolves to nothing at all.
 */
export async function loadDeviceByToken(token: string, sql?: Sql): Promise<PhoneBridgeDevice | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const db = sql ?? (await getSql());
  const rows = await db.query<Record<string, unknown>>(
    `select id, name, manufacturer, model, android_version, sdk_int, app_version_name,
            app_version_code, enabled, employee, group_name, last_sync_hash,
            last_app_version_code
       from phone_bridge_devices
      where token_hash = $1
        and token_revoked_at is null
      limit 1`,
    [sha256Hex(trimmed)],
  );
  return rows[0] ? mapDevice(rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Request authentication                                              */
/* ------------------------------------------------------------------ */

function readBearer(event: H3Event): string {
  const raw = getHeader(event, "authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? "";
}

/**
 * Bearer reader for the unsigned probe route (`GET /api/device-sync/v1`).
 *
 * `MainActivity.testConnection()` sends a bare GET with no body, so there is
 * nothing to HMAC. Exposed separately from {@link readBearer} so that only the
 * probe can skip the signature step — every mutating route goes through
 * {@link authenticateSignedRequest}, which always verifies.
 */
export function readBearerForProbe(event: H3Event): string {
  return readBearer(event);
}

/**
 * Reads the exact bytes of the request body.
 *
 * The HMAC covers the body as transmitted, so the signature must be checked
 * against these bytes rather than against a re-serialized parse — re-serializing
 * would reorder keys and every signature would fail. Empty (rather than
 * throwing) when there is no body, which is the normal case for the signed GET.
 */
export async function readSignedBody(event: H3Event): Promise<Uint8Array> {
  const raw = await readRawBody(event).catch(() => undefined);
  if (!raw) return new Uint8Array(0);
  return typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array(raw);
}

export type AuthenticatedDevice = {
  device: PhoneBridgeDevice;
  token: string;
  sql: Sql;
  clientIp: string;
  userAgent: string;
};

/**
 * Authenticates a signed Phone Bridge request.
 *
 * Order matters: the bearer token is resolved first because the HMAC is keyed by
 * it, then freshness, then the HMAC, then replay. A request that fails at any
 * step produces a distinct status so the client knows whether to resend (408),
 * fix its clock, or re-register (401).
 */
export async function authenticateSignedRequest(event: H3Event): Promise<AuthenticatedDevice> {
  // A deployment with no database must answer 503, not 500. `getSql()` throws
  // an Error (not an H3Error), which Nitro would surface as an unhandled 500 and
  // leave the device retrying a request that can never succeed.
  if (dbSource === "unconfigured") {
    throw createError({
      statusCode: 503,
      statusMessage: "پایگاه دادهٔ Phone Bridge تنظیم نشده است.",
    });
  }

  const sql = await getSql().catch(() => {
    throw createError({
      statusCode: 503,
      statusMessage: "اتصال به پایگاه دادهٔ Phone Bridge برقرار نشد.",
    });
  });

  const token = readBearer(event);
  if (!token) throw createError({ statusCode: 401, statusMessage: "توکن دستگاه ارسال نشده است." });

  const device = await loadDeviceByToken(token, sql);
  if (!device) throw createError({ statusCode: 401, statusMessage: "توکن دستگاه نامعتبر است." });

  const headerDeviceId = (getHeader(event, "x-hirmand-device-id") ?? "").trim();
  if (!headerDeviceId || headerDeviceId !== device.id) {
    // Mismatch means either a replayed token against another device or a bug in
    // the client. Either way the request must not proceed.
    throw createError({ statusCode: 401, statusMessage: "شناسهٔ دستگاه با توکن هم‌خوانی ندارد." });
  }

  if (!device.enabled) {
    throw createError({ statusCode: 403, statusMessage: "این دستگاه در پنل هیرمند غیرفعال شده است." });
  }

  const timestamp = getHeader(event, "x-hirmand-timestamp");
  const nonce = getHeader(event, "x-hirmand-nonce");
  const signature = getHeader(event, "x-hirmand-signature");

  const freshness = checkSignatureFreshness({
    timestamp,
    nonce,
    signature,
    version: getHeader(event, "x-hirmand-signature-version"),
  });
  if (!freshness.ok) {
    throw createError({
      statusCode: freshness.reason === "stale" ? 408 : 401,
      statusMessage:
        freshness.reason === "stale"
          ? "مهر زمانی درخواست قدیمی است؛ ساعت دستگاه را بررسی کنید."
          : "امضای درخواست معتبر نیست.",
    });
  }

  const body = await readSignedBody(event);
  const valid = verifySignature({
    secret: token,
    deviceId: device.id,
    timestamp: timestamp!,
    nonce: nonce!,
    signature: signature!,
    body,
  });
  if (!valid) throw createError({ statusCode: 401, statusMessage: "امضای درخواست معتبر نیست." });

  if (!rememberNonce(device.id, nonce!)) {
    throw createError({ statusCode: 409, statusMessage: "این درخواست قبلاً پردازش شده است." });
  }

  await sql.query("update phone_bridge_devices set last_seen_at = current_timestamp where id = $1", [
    device.id,
  ]);

  return {
    device,
    token,
    sql,
    clientIp: getRequestIP(event, { xForwardedFor: true }) ?? "",
    userAgent: (getHeader(event, "user-agent") ?? "").slice(0, 200),
  };
}

/* ------------------------------------------------------------------ */
/* Consent + policy                                                    */
/* ------------------------------------------------------------------ */

async function loadGrantedScopes(deviceId: string, sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ scopes: unknown }>(
    `select scopes from phone_bridge_consents
      where device_id = $1 and revoked_at is null
      order by accepted_at desc
      limit 1`,
    [deviceId],
  );
  return normalizeGrantedScopes(rows[0]?.scopes);
}

async function loadPolicy(
  deviceId: string,
  sql: Sql,
): Promise<{ modules: Set<PhoneBridgeModule>; minAppVersionCode: number | null; hasRow: boolean }> {
  const rows = await sql.query<{ modules: unknown; min_app_version_code: unknown }>(
    "select modules, min_app_version_code from phone_bridge_policies where device_id = $1 limit 1",
    [deviceId],
  );
  const row = rows[0];
  const minAppVersionCode = optionalInt(row?.min_app_version_code);

  // A missing policy row falls back to read-only; an explicit row — even an empty
  // one — is respected as written.
  if (!row) return { modules: new Set(DEFAULT_POLICY_MODULES), minAppVersionCode: null, hasRow: false };

  const raw = row.modules;
  const modules = new Set<PhoneBridgeModule>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, granted] of Object.entries(raw as Record<string, unknown>)) {
      if (granted !== true) continue;
      if ((PHONE_BRIDGE_MODULES as readonly string[]).includes(key)) {
        modules.add(key as PhoneBridgeModule);
      }
    }
  }
  return { modules, minAppVersionCode, hasRow: true };
}

export type EffectiveAccess = {
  enabled: boolean;
  consented: string[];
  policy: PhoneBridgeModule[];
  effective: PhoneBridgeModule[];
  /** Minimum app version code the operator requires; null means no floor. */
  minAppVersionCode: number | null;
  /** Why a module is not effective — surfaced to the admin panel, not the device. */
  blocked: Array<{ module: PhoneBridgeModule; reason: string }>;
};

/**
 * Intersects the three server-side gates.
 *
 * Because this is an intersection, turning a module ON in the admin panel can
 * only ever widen what is *policy-allowed*; it can never appear in `effective`
 * unless the user also consented to it.
 */
export async function computeEffectiveAccess(
  device: PhoneBridgeDevice,
  sql: Sql,
): Promise<EffectiveAccess> {
  const [consented, policy] = await Promise.all([
    loadGrantedScopes(device.id, sql),
    loadPolicy(device.id, sql),
  ]);

  const consentedSet = new Set(consented);
  const effective: PhoneBridgeModule[] = [];
  const blocked: Array<{ module: PhoneBridgeModule; reason: string }> = [];

  for (const module of PHONE_BRIDGE_MODULES) {
    if (!device.enabled) {
      blocked.push({ module, reason: "device_disabled" });
      continue;
    }
    if (!policy.modules.has(module)) {
      blocked.push({ module, reason: "server_policy" });
      continue;
    }
    if (!consentedSet.has(module)) {
      blocked.push({ module, reason: "consent_missing" });
      continue;
    }
    effective.push(module);
  }

  return {
    enabled: device.enabled,
    consented: [...consentedSet].sort(),
    policy: [...policy.modules].sort(),
    effective,
    minAppVersionCode: policy.minAppVersionCode,
    blocked,
  };
}

/** Throws 403 unless `module` passes every server-side gate. */
export function assertModuleAllowed(access: EffectiveAccess, module: PhoneBridgeModule): void {
  if (access.effective.includes(module)) return;
  const reason = access.blocked.find((entry) => entry.module === module)?.reason ?? "server_policy";
  throw createError({
    statusCode: 403,
    statusMessage: `برای ماژول «${module}» رضایت یا سیاست سرور فعال نیست (${reason}).`,
  });
}

/* ------------------------------------------------------------------ */
/* Enrollment                                                          */
/* ------------------------------------------------------------------ */

/** Opaque, high-entropy pairing token. Plaintext is shown once, never stored. */
export function generatePairingToken(): string {
  return `hpb_${randomBytes(24).toString("base64url")}`;
}

export function generateDeviceToken(): string {
  return `hpd_${randomBytes(32).toString("base64url")}`;
}

/**
 * Exchanges a pairing token for a per-device token.
 *
 * The pairing token is single-use and consumed in the same transaction that
 * writes the device, so a token that leaks after enrollment is worthless — the
 * bootstrap credential is burned the moment it does its job.
 */
export async function enrollDevice(input: {
  sql: Sql;
  pairingToken: string;
  device: {
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    androidVersion: string;
    sdkInt: number | null;
    appVersionName: string;
    appVersionCode: number | null;
  };
  employee?: string;
  groupName?: string;
}): Promise<{ ok: true; deviceToken: string } | { ok: false; reason: "invalid_pairing_token" }> {
  const deviceToken = generateDeviceToken();
  const enrolled = await persistEnrollment({
    sql: input.sql,
    pairingToken: input.pairingToken,
    deviceToken,
    deviceId: input.device.id,
    name: input.device.name,
    manufacturer: input.device.manufacturer,
    model: input.device.model,
    androidVersion: input.device.androidVersion,
    sdkInt: input.device.sdkInt,
    appVersionName: input.device.appVersionName,
    appVersionCode: input.device.appVersionCode,
    employee: input.employee ?? "",
    groupName: input.groupName ?? "",
  });

  if (!enrolled) return { ok: false, reason: "invalid_pairing_token" };
  return { ok: true, deviceToken };
}

/**
 * Writes the enrollment, consuming the pairing token.
 *
 * Kept separate from {@link enrollDevice} so the SQL shape can be exercised
 * directly by the tests without minting tokens.
 */
export async function persistEnrollment(input: {
  sql: Sql;
  pairingToken: string;
  deviceToken: string;
  deviceId: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number | null;
  appVersionName: string;
  appVersionCode: number | null;
  employee: string;
  groupName: string;
}): Promise<boolean> {
  const sql = input.sql;
  const pairingHash = sha256Hex(input.pairingToken.trim());

  const pairing = await sql.query<{ id: string }>(
    `select id from phone_bridge_pairing_tokens
      where token_hash = $1
        and used_at is null
        and revoked_at is null
        and expires_at > current_timestamp
      limit 1
      for update`,
    [pairingHash],
  );
  if (!pairing[0]) return false;

  await sql.query(
    `insert into phone_bridge_devices (
        id, name, manufacturer, model, android_version, sdk_int,
        app_version_name, app_version_code, token_hash, employee, group_name,
        last_app_version_name, last_app_version_code, enrolled_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, current_timestamp, current_timestamp)
     on conflict (id) do update set
        token_hash = excluded.token_hash,
        token_issued_at = current_timestamp,
        token_revoked_at = null,
        app_version_name = excluded.app_version_name,
        app_version_code = excluded.app_version_code,
        last_app_version_name = excluded.last_app_version_name,
        last_app_version_code = excluded.last_app_version_code,
        updated_at = current_timestamp`,
    [
      input.deviceId,
      input.name,
      input.manufacturer,
      input.model,
      input.androidVersion,
      input.sdkInt,
      input.appVersionName,
      input.appVersionCode,
      sha256Hex(input.deviceToken),
      input.employee,
      input.groupName,
      input.appVersionName,
      input.appVersionCode,
    ],
  );

  await sql.query(
    `update phone_bridge_pairing_tokens
        set used_at = current_timestamp, used_by_device_id = $2
      where id = $1`,
    [pairing[0].id, input.deviceId],
  );

  return true;
}

/** Touches the sync bookkeeping after a packet is accepted. */
export async function recordSuccessfulSync(
  sql: Sql,
  deviceId: string,
  snapshotHash: string,
  appVersionName: string,
  appVersionCode: number | null,
): Promise<void> {
  await sql.query(
    `update phone_bridge_devices
        set last_sync_at = current_timestamp,
            last_sync_hash = $2,
            last_app_version_name = $3,
            last_app_version_code = $4,
            updated_at = current_timestamp
      where id = $1`,
    [deviceId, snapshotHash, appVersionName, appVersionCode],
  );
}

export { randomUUID };