import type { Sql } from "./db";

export interface CustomerChatMessageRow {
  id: string;
  senderType: "customer" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
}

export async function loadLatestCustomerChatMessages(
  sql: Pick<Sql, "query">,
  leadId: string,
  trackingToken: string,
): Promise<{ messages: CustomerChatMessageRow[]; unreadCount: number }> {
  const rows = await sql.query<CustomerChatMessageRow & { readByCustomerAt: string | null }>(
    `select id,
            sender_type as "senderType",
            sender_name as "senderName",
            message,
            created_at as "createdAt",
            read_by_customer_at as "readByCustomerAt"
     from (
       select id,sender_type,sender_name,message,created_at,read_by_customer_at
       from customer_messages
       where lead_id=$1 and tracking_token=$2
       order by created_at desc,id desc
       limit 100
     ) as latest
     order by created_at asc,id asc`,
    [leadId, trackingToken],
  );
  return {
    messages: rows.map(({ readByCustomerAt: _readByCustomerAt, ...message }) => message),
    unreadCount: rows.filter((row) => row.senderType === "admin" && !row.readByCustomerAt).length,
  };
}
