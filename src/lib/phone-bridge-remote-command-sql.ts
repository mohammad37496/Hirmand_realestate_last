import type { Sql } from "./db";

export type QueuePhoneBridgeRemoteCommandInput = {
  id: string;
  deviceId: string;
  action: string;
  payload: string;
  requestedBy: string | null;
  expiresInSeconds: 60 | 180;
  expectedFile?: { uri: string; rootUri: string };
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

    if (input.expectedFile) {
      const indexedFiles = await tx.query<{ root_uri: string }>(
        "select root_uri from phone_bridge_file_entries where device_id=$1 and uri=$2 and is_directory=false limit 1",
        [input.deviceId, input.expectedFile.uri],
      );
      if (indexedFiles[0]?.root_uri !== input.expectedFile.rootUri) {
        throw new Error("\u0627\u06cc\u0646 \u0641\u0627\u06cc\u0644 \u062f\u0631 \u0641\u0647\u0631\u0633\u062a \u0641\u0639\u0644\u06cc \u067e\u0648\u0634\u0647 \u0646\u06cc\u0633\u062a\u061b \u067e\u0648\u0634\u0647 \u0631\u0627 \u0647\u0645\u06af\u0627\u0645\u200c\u0633\u0627\u0632\u06cc \u0648 \u062f\u0648\u0628\u0627\u0631\u0647 \u062a\u0644\u0627\u0634 \u06a9\u0646.");
      }
    }

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
