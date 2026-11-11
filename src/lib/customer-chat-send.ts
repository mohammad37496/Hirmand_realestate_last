import type { Sql } from "./db";

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
    const leads = await transactionSql.query<{ id: string; trackingToken: string }>(
      `select id, tracking_token as "trackingToken"
       from leads
       where upper(tracking_token)=upper($1)
       limit 1
       for update`,
      [input.trackingCode],
    );
    const lead = leads[0];
    if (!lead) return { kind: "not_found" };

    const recent = await transactionSql.query<{ id: string }>(
      `select id
       from customer_messages
       where lead_id=$1
         and created_at > current_timestamp - interval '12 seconds'
       limit 1`,
      [lead.id],
    );
    if (recent.length) return { kind: "cooldown" };

    const id = crypto.randomUUID();
    await transactionSql.query(
      `insert into customer_messages
        (id,lead_id,tracking_token,sender_type,sender_name,message)
       values($1,$2,$3,'customer',$4,$5)`,
      [id, lead.id, lead.trackingToken, input.senderName, input.message],
    );
    return { kind: "sent", id };
  });
}
