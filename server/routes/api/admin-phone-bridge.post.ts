import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt } from "@/lib/admin-rate-limit.server";
import {
  PHONE_BRIDGE_MODULES,
  generatePairingToken,
  type PhoneBridgeModule,
} from "@/lib/phone-bridge-auth.server";
import { writePhoneBridgeAudit } from "@/lib/phone-bridge-events.server";
import { optionalInt } from "@/lib/phone-bridge-payload.server";
import { effectiveAccessForDevice, MODULE_LABELS } from "@/lib/phone-bridge-policy.server";

const moduleEnum = z.enum(PHONE_BRIDGE_MODULES);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("create_pairing_token"), label: z.string().trim().max(120).optional(), expiresInHours: z.number().int().min(1).max(24 * 30).optional().default(24) }),
  z.object({ action: z.literal("set_enabled"), deviceId: z.string().trim().min(1).max(120), enabled: z.boolean() }),
  z.object({
    action: z.literal("set_modules"),
    deviceId: z.string().trim().min(1).max(120),
    modules: z.array(moduleEnum).max(PHONE_BRIDGE_MODULES.length),
  }),
  z.object({
    action: z.literal("set_min_version"),
    deviceId: z.string().trim().min(1).max(120),
    minAppVersionCode: z.number().int().min(0).nullable(),
  }),
  z.object({ action: z.literal("revoke_consent"), deviceId: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("revoke_token"), deviceId: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal("queue_command"),
    deviceId: z.string().trim().min(1).max(120),
    commandAction: z.enum([
      "get_location",
      "take_photo",
      "record_audio",
      "manage_files",
      "list_apps",
      "list_notifications",
      "restore_data",
    ]),
    payload: z.record(z.string(), z.unknown()).optional(),
    expiresInMinutes: z.number().int().min(1).max(24 * 60).optional().default(15),
  }),
  z.object({ action: z.literal("audit"), deviceId: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(500).optional().default(100) }),
  z.object({ action: z.literal("purge"), days: z.number().int().min(1).max(3650).optional().default(30) }),
]);

/**
 * Admin API for Phone Bridge.
 *
 * Auth is the existing admin session, and every mutating action is same-origin
 * checked, so this route inherits the admin panel's CSRF protection.
 *
 * The important rule encoded here: **setting a module ON is not consent.**
 * `set_modules` widens server policy only. A module becomes effective only after
 * the device records the user's own consent; an administrator cannot manufacture
 * consent on behalf of a phone owner.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const body = await readBody(event).catch(() => ({}) as Record<string, unknown>);
  const parsedActionSchema = actionSchema.safeParse(body);
  if (!parsedActionSchema.success) {
    throw createError({ statusCode: 422, statusMessage: "درخواست پنل Phone Bridge معتبر نیست." });
  }
  const input = parsedActionSchema.data;

  const adminToken = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(adminToken)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const adminClaims = await getAdminSessionClaims(adminToken);
  if (!hasAdminPermission(normalizeAdminRole(adminClaims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت و فرمان‌های Phone Bridge برای این حساب فعال نیست." });
  }
  assertSameOrigin(event);
  const actorAccountId = typeof adminClaims?.options?.accountId === "string" ? adminClaims.options.accountId : null;
  if (input.action !== "list" && input.action !== "audit") {
    const throttle = await consumeAdminAttempt(`phone-bridge:${clientFingerprint(event)}`);
    if (!throttle.allowed) {
      throw createError({ statusCode: 429, statusMessage: "تعداد درخواست‌ها بیش از حد مجاز است." });
    }
  }

  if (dbSource === "unconfigured") {
    return { ok: true, devices: [], commands: [], unconfigured: true };
  }

  const sql = await getSql();
  const actor = actorAccountId ?? "admin";

  const audit = (entry: {
    deviceId?: string | null;
    action: string;
    module?: string;
    result?: "ok" | "denied" | "error";
    policy?: string;
    detail?: Record<string, unknown>;
  }) =>
    writePhoneBridgeAudit({
      deviceId: entry.deviceId ?? null,
      actorAccountId,
      action: entry.action,
      module: entry.module ?? "",
      result: entry.result ?? "ok",
      policy: entry.policy ?? "",
      ip: clientFingerprint(event).split("|")[0] ?? "",
      userAgent: event.req.headers.get("user-agent") ?? "",
      detail: entry.detail ?? {},
    });

  switch (input.action) {
    case "list": {
      const devices = await sql.query<Record<string, unknown>>(
        `select d.id, d.name, d.employee, d.group_name, d.enabled,
                d.manufacturer, d.model, d.android_version, d.sdk_int,
                d.app_version_name, d.app_version_code,
                d.battery_percent, d.battery_charging,
                d.storage_available_bytes, d.storage_total_bytes,
                d.ram_available_bytes, d.ram_total_bytes,
                d.last_seen_at, d.last_sync_at,
                p.modules as policy_modules, p.min_app_version_code,
                c.scopes as consent_scopes, c.accepted_at as consent_accepted_at
           from phone_bridge_devices d
           left join phone_bridge_policies p on p.device_id = d.id
           left join lateral (
                select scopes, accepted_at
                  from phone_bridge_consents
                 where device_id = d.id and revoked_at is null
                 order by accepted_at desc
                 limit 1
           ) c on true
          order by d.last_seen_at desc nulls last
          limit 500`,
      );

      const rows = [];
      for (const row of devices) {
        const access = await effectiveAccessForDevice(String(row.id), sql);
        rows.push({
          id: String(row.id),
          name: String(row.name ?? ""),
          employee: String(row.employee ?? ""),
          groupName: String(row.group_name ?? ""),
          enabled: row.enabled === true,
          manufacturer: String(row.manufacturer ?? ""),
          model: String(row.model ?? ""),
          androidVersion: String(row.android_version ?? ""),
          sdkInt: optionalInt(row.sdk_int),
          appVersionName: String(row.app_version_name ?? ""),
          appVersionCode: optionalInt(row.app_version_code),
          batteryPercent: optionalInt(row.battery_percent),
          batteryCharging: row.battery_charging === true,
          storageAvailableBytes: optionalInt(row.storage_available_bytes),
          storageTotalBytes: optionalInt(row.storage_total_bytes),
          ramAvailableBytes: optionalInt(row.ram_available_bytes),
          ramTotalBytes: optionalInt(row.ram_total_bytes),
          lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : null,
          lastSyncAt: row.last_sync_at ? new Date(String(row.last_sync_at)).toISOString() : null,
          minAppVersionCode: optionalInt(row.min_app_version_code),
          consentAcceptedAt: row.consent_accepted_at
            ? new Date(String(row.consent_accepted_at)).toISOString()
            : null,
          effective: access?.effective ?? [],
          consented: access?.consented ?? [],
          policy: access?.policy ?? [],
          blocked: access?.blocked ?? [],
        });
      }

      const commands = await sql.query<Record<string, unknown>>(
        `select id, device_id, module, action, status, requested_by, requested_at, expires_at, finished_at
           from phone_bridge_commands
          order by requested_at desc
          limit 200`,
      );

      return {
        ok: true,
        modules: PHONE_BRIDGE_MODULES.map((module) => ({ id: module, label: MODULE_LABELS[module] })),
        devices: rows,
        commands: commands.map((row) => ({
          id: String(row.id),
          deviceId: String(row.device_id),
          module: String(row.module ?? ""),
          action: String(row.action),
          status: String(row.status),
          requestedBy: String(row.requested_by ?? ""),
          requestedAt: new Date(String(row.requested_at)).toISOString(),
          expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
          finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
        })),
      };
    }

    case "create_pairing_token": {
      const token = generatePairingToken();
      const hours = Math.min(Math.max(input.expiresInHours ?? 24, 1), 24 * 30);
      const id = crypto.randomUUID();
      const { sha256Hex } = await import("@/lib/phone-bridge-signature.server");

      await sql.query(
        `insert into phone_bridge_pairing_tokens (id, token_hash, label, expires_at)
         values ($1, $2, $3, current_timestamp + make_interval(hours => $4))`,
        [id, sha256Hex(token), input.label ?? "", hours],
      );

      await audit({ action: "pairing_token.create", detail: { id, label: input.label ?? "", hours } });

      // Returned once. Only the hash is stored, so this plaintext cannot be
      // recovered later — the operator must hand it to the device now.
      return { ok: true, id, token, expiresInHours: hours };
    }

    case "set_enabled": {
      await sql.query(
        "update phone_bridge_devices set enabled = $2, updated_at = current_timestamp where id = $1",
        [input.deviceId, input.enabled],
      );
      await audit({
        deviceId: input.deviceId,
        action: "device.set_enabled",
        result: input.enabled ? "ok" : "denied",
        detail: { enabled: input.enabled },
      });
      return { ok: true };
    }

    case "set_modules": {
      const modules: Record<string, boolean> = {};
      for (const module of PHONE_BRIDGE_MODULES) modules[module] = false;
      for (const module of input.modules) modules[module] = true;

      await sql.query(
        `insert into phone_bridge_policies (device_id, modules, updated_at, updated_by)
         values ($1, $2::jsonb, current_timestamp, $3)
         on conflict (device_id) do update set
           modules = excluded.modules,
           updated_at = current_timestamp,
           updated_by = excluded.updated_by`,
        [input.deviceId, JSON.stringify(modules), actor],
      );

      await audit({
        deviceId: input.deviceId,
        action: "policy.set_modules",
        policy: input.modules.join(","),
        detail: { modules: input.modules },
      });
      return { ok: true, note: "این تغییر سیاست سرور است و جای رضایت کاربر را نمی‌گیرد." };
    }

    case "set_min_version": {
      await sql.query(
        `insert into phone_bridge_policies (device_id, modules, min_app_version_code, updated_at, updated_by)
         values ($1, '{}'::jsonb, $2, current_timestamp, $3)
         on conflict (device_id) do update set
           min_app_version_code = excluded.min_app_version_code,
           updated_at = current_timestamp,
           updated_by = excluded.updated_by`,
        [input.deviceId, input.minAppVersionCode, actor],
      );
      await audit({
        deviceId: input.deviceId,
        action: "policy.set_min_version",
        detail: { minAppVersionCode: input.minAppVersionCode },
      });
      return { ok: true };
    }

    case "revoke_consent": {
      await sql.query(
        "update phone_bridge_consents set revoked_at = current_timestamp where device_id = $1 and revoked_at is null",
        [input.deviceId],
      );
      await audit({ deviceId: input.deviceId, action: "consent.revoke", result: "denied" });
      return { ok: true };
    }

    case "revoke_token": {
      await sql.query(
        "update phone_bridge_devices set token_revoked_at = current_timestamp, updated_at = current_timestamp where id = $1",
        [input.deviceId],
      );
      await audit({ deviceId: input.deviceId, action: "device.revoke_token", result: "denied" });
      return { ok: true, note: "دستگاه باید دوباره با کلید ثبت جدید ثبت شود." };
    }

    case "queue_command": {
      const id = crypto.randomUUID();
      const minutes = Math.min(Math.max(input.expiresInMinutes ?? 15, 1), 24 * 60);
      const module = ACTION_MODULE[input.commandAction] satisfies PhoneBridgeModule;

      await sql.query(
        `insert into phone_bridge_commands
           (id, device_id, module, action, payload, requested_by, expires_at, audit_id)
         values ($1, $2, $3, $4, $5::jsonb, $6,
                 current_timestamp + make_interval(mins => $7), $1)`,
        [
          id,
          input.deviceId,
          module,
          input.commandAction,
          JSON.stringify(input.payload ?? {}),
          actor,
          minutes,
        ],
      );

      await audit({
        deviceId: input.deviceId,
        action: "remote_command.queue",
        module,
        detail: { commandId: id, commandAction: input.commandAction },
      });
      return { ok: true, id };
    }

    case "audit": {
      const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
      const rows = input.deviceId
        ? await sql.query<Record<string, unknown>>(
            `select device_id, actor, action, module, result, policy, ip, user_agent, detail, created_at
               from phone_bridge_audit_log where device_id = $1
              order by created_at desc limit $2`,
            [input.deviceId, limit],
          )
        : await sql.query<Record<string, unknown>>(
            `select device_id, actor, action, module, result, policy, ip, user_agent, detail, created_at
               from phone_bridge_audit_log order by created_at desc limit $1`,
            [limit],
          );

      return {
        ok: true,
        // Exports go through this same route, so the payload is scrubbed by
        // `scrubAuditDetail` at write time — no token can appear here.
        entries: rows.map((row) => ({
          deviceId: row.device_id ? String(row.device_id) : null,
          actor: String(row.actor ?? ""),
          action: String(row.action),
          module: String(row.module ?? ""),
          result: String(row.result ?? ""),
          policy: String(row.policy ?? ""),
          ip: String(row.ip ?? ""),
          userAgent: String(row.user_agent ?? ""),
          detail: (row.detail ?? {}) as Record<string, unknown>,
          createdAt: new Date(String(row.created_at)).toISOString(),
        })),
      };
    }

    case "purge": {
      const days = Math.min(Math.max(input.days ?? 30, 1), 3650);
      const deleted = await sql.query<{ count: number }>(
        `with gone as (
           delete from phone_bridge_snapshots
            where received_at < current_timestamp - make_interval(days => $1)
            returning 1
         )
         select count(*)::int as count from gone`,
        [days],
      );
      await audit({ action: "retention.purge", detail: { days, snapshots: deleted[0]?.count ?? 0 } });
      return { ok: true, snapshotsDeleted: deleted[0]?.count ?? 0, days };
    }
  }
});

const ACTION_MODULE: Record<string, PhoneBridgeModule> = {
  get_location: "location",
  take_photo: "camera",
  record_audio: "microphone",
  manage_files: "selected_files",
  list_apps: "apps",
  list_notifications: "notifications",
  restore_data: "remote_control",
};