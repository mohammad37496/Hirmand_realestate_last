import type { Sql } from "./db";
import { lockPublicLeadTrackingTarget } from "./public-lead-tracking.ts";

export type CustomerChatSendResult =
  | { kind: "sent"; id: string }
  | { kind: "not_found" }
  | { kind: "cooldown" }
  | { kind: "unavailable" };

/** Serialize the per-lead cooldown check and insert so concurrent sends cannot both pass. */
export async function sendCustomerChatMessage(
  sql: Sql,
  input: { trackingCode: string; senderName: string; message: string },
): Promise<CustomerChatSendResult> {
  if (typeof sql.transaction !== "function") return { kind: "unavailable" };

  return sql.transaction(async (transactionSql) => {
    const target = await lockPublicLeadTrackingTarget(transactionSql, input.trackingCode);
    if (!target) return { kind: "not_found" };

    const recent = await transactionSql.query<{ id: string }>(
      `select id
       from customer_messages
       where lead_id=$1
         and created_at > clock_timestamp() - interval '12 seconds'
       limit 1`,
      [target.leadId],
    );
    if (recent.length) return { kind: "cooldown" };

    const id = crypto.randomUUID();
    await transactionSql.query(
      `insert into customer_messages
        (id,lead_id,tracking_token,sender_type,sender_name,message,created_at)
       values($1,$2,$3,'customer',$4,$5,clock_timestamp())`,
      [id, target.leadId, target.trackingToken, input.senderName, input.message],
    );
    return { kind: "sent", id };
  });
}
