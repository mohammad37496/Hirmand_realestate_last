import type { Sql } from "./db";

export type CustomerChatReadReceiptResult =
  | { kind: "marked"; count: number }
  | { kind: "not_found" };

/** Mark only admin messages that were included in the customer's fetched conversation. */
export async function markCustomerChatMessagesRead(
  sql: Pick<Sql, "query">,
  trackingToken: string,
  messageIds: string[],
): Promise<CustomerChatReadReceiptResult> {
  const ids = [...new Set(messageIds)].slice(0, 100);
  const rows = await sql.query<{ leadId: string | null; markedCount: number }>(
    `with target as (
       select id from leads where upper(tracking_token)=upper($1) limit 1
     ), updated as (
       update customer_messages as message
       set read_by_customer_at = current_timestamp
       from target
       where message.lead_id = target.id
         and message.sender_type = 'admin'
         and message.read_by_customer_at is null
         and message.id = any($2::text[])
       returning message.id
     )
     select (select id from target) as "leadId",
            (select count(*)::int from updated) as "markedCount"`,
    [trackingToken, ids],
  );
  const row = rows[0];
  if (!row?.leadId) return { kind: "not_found" };
  return { kind: "marked", count: Number(row.markedCount) || 0 };
}
