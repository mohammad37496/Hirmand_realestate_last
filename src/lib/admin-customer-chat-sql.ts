/** Fetch the newest 200 messages, return them chronologically, and only mark
 * the messages included in that visible window as read by an admin. */
export const ADMIN_CUSTOMER_CHAT_THREAD_SQL = `
  with visible_messages as materialized (
    select id
    from customer_messages
    where upper(tracking_token) = upper($1)
    order by created_at desc, id desc
    limit 200
  ), marked_read as (
    update customer_messages as messages
    set read_by_admin_at = current_timestamp
    from visible_messages
    where messages.id = visible_messages.id
      and messages.sender_type = 'customer'
      and messages.read_by_admin_at is null
    returning messages.id
  )
  select messages.id,
         messages.tracking_token as "trackingCode",
         messages.sender_type as "senderType",
         messages.sender_name as "senderName",
         messages.message,
         messages.created_at as "createdAt"
  from customer_messages as messages
  inner join visible_messages on visible_messages.id = messages.id
  order by messages.created_at asc, messages.id asc
`;

/** Insert only if the public tracking token still identifies a lead at write time. */
export const INSERT_ADMIN_CUSTOMER_CHAT_REPLY_SQL = `
  insert into customer_messages
    (id, lead_id, tracking_token, sender_type, sender_name, message)
  select $1, id, public_tracking_token, 'admin', $2, $3
  from leads
  where upper(public_tracking_token) = upper($4)
    and public_tracking_token is not null
  order by id
  limit 1
  returning id
`;

export const DELETE_ADMIN_MESSAGE_TEMPLATE_SQL =
  "delete from admin_message_templates where id = $1 returning id";
