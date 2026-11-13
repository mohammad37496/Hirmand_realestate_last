import type { Sql } from "./db";

export type QueuePhoneBridgeRemoteCommandInput = {
  id: string;
  deviceId: string;
  action: string;
  payload: string;
  requestedBy: string | null;
  expiresInSeconds: 60 | 180;
};

/**
 * Serialize remote-command creation per device. Locking the parent device row
 * makes the active-command check and insert one atomic operation across
 * concurrent admin requests and separate PostgreSQL sessions.
 */
export async function queuePhoneBridgeRemoteCommand(
  sql: Sql,
  input: QueuePhoneBridgeRemoteCommandInput,
) {
  if (!sql.transaction) {
    throw new Error("Phone Bridge remote command queue requires transaction support.");
  }

  await sql.transaction(async (tx) => {
    const devices = await tx.query<{ id: string }>(
      "select id from phone_bridge_devices where id=$1 for update",
      [input.deviceId],
    );
    if (!devices.length) throw new Error("Phone Bridge device is unavailable for remote commands.");

    const active = await tx.query<{ id: string }>(
      "select id from phone_bridge_remote_commands where device_id=$1 and status in ('queued','running') and expires_at >= current_timestamp limit 1",
      [input.deviceId],
    );
    if (active.length) {
      throw new Error("یک فرمان ریموت هنوز در حال اجراست؛ ابتدا نتیجهٔ آن را دریافت کن.");
    }

    await tx.query(
      "insert into phone_bridge_remote_commands (id,device_id,action,status,payload,requested_by,expires_at) values ($1,$2,$3,'queued',$4::jsonb,$5,current_timestamp + ($6::int * interval '1 second'))",
      [input.id, input.deviceId, input.action, input.payload, input.requestedBy, input.expiresInSeconds],
    );
  });
}
