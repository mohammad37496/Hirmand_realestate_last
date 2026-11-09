import type { Sql } from "./db.ts";

export async function loadAdminNotificationCandidates(sql: Sql) {
  const [leads, visits, messages, staleProperties] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select id,name,follow_up_at from leads where status not in ('closed','spam') and follow_up_at is not null and follow_up_at <= current_timestamp order by follow_up_at asc limit 40",
    ),
    sql.query<Record<string, unknown>>(
      "select id,name from leads where visit_status='requested' order by visit_requested_at desc nulls last limit 30",
    ),
    sql.query<Record<string, unknown>>(
      "select lead_id,count(*)::int as unread_count,max(created_at) as latest from customer_messages where sender_type='customer' and read_by_admin_at is null group by lead_id order by max(created_at) desc limit 30",
    ),
    sql.query<Record<string, unknown>>(
      "select id,title from properties where deleted_at is null and status='published' and coalesce(jsonb_array_length(images),0)=0 order by updated_at desc limit 20",
    ),
  ]);
  return { leads, visits, messages, staleProperties };
}
