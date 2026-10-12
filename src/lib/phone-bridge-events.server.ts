import { randomUUID } from "node:crypto";
import { dbSource, getSql } from "@/lib/db";

export type PhoneBridgeEventSeverity = "info" | "warning" | "error" | "critical";

export type PhoneBridgeEventActorId = { deviceId?: string | null; actorAccountId?: string | null; };

export async function recordPhoneBridgeEvent(input: {
  deviceId?: string | null;
  actorAccountId?: string | null;
  eventType: string;
  severity?: PhoneBridgeEventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  if (dbSource === "unconfigured") return;

  const sql = await getSql();
  await sql.query(
    `insert into phone_bridge_events
      (id,device_id,actor_account_id,event_type,severity,message,metadata)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      randomUUID(),
      input.deviceId?.trim().slice(0, 120) || null,
      input.actorAccountId?.trim().slice(0, 120) || null,
      input.eventType.trim().slice(0, 100),
      input.severity ?? "info",
      input.message.trim().slice(0, 500),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function writePhoneBridgeAudit(input: {
  deviceId: string | null;
  actorAccountId?: string | null;
  action: string;
  module: string;
  result: string;
  policy?: string;
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
}) {
  await recordPhoneBridgeEvent({
    deviceId: input.deviceId,
    actorAccountId: input.actorAccountId ?? null,
    eventType: "audit",
    severity: input.result === "denied" ? "warning" : "info",
    message: `${input.action}::${input.module}::${input.result}`,
    metadata: {
      ...(input.policy ? { policy: input.policy } : {}),
      ...(input.ip ? { ip: input.ip } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
    },
  });
}

export async function storeSnapshot(input: {
  deviceId: string;
  snapshotHash: string;
  modules: Record<string, boolean>;
  sentAt: number;
}) {
  if (dbSource === "unconfigured") return;
  const sql = await getSql();
  await sql.query(
    `insert into phone_bridge_device_snapshots
      (device_id, snapshot_hash, modules, sent_at)
     values ($1, $2, $3::jsonb, $4)`,
    [input.deviceId, input.snapshotHash, JSON.stringify(input.modules), input.sentAt],
  );
}
