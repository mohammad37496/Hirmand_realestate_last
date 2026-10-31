import type { AdminNotificationAccess } from "./admin-notification-access.ts";

type NotificationQuery = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

type NotificationRows = {
  leads: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  staleProperties: Record<string, unknown>[];
};

/**
 * Load every notification source the current role is allowed to see.
 * A query failure rejects the whole read rather than presenting partial data
 * as a complete, empty notification inbox.
 */
export async function loadAdminNotificationCandidates(
  query: NotificationQuery,
  access: AdminNotificationAccess,
): Promise<NotificationRows> {
  const [leads, visits, messages, staleProperties] = await Promise.all([
    access.canManageLeads
      ? query<Record<string, unknown>>(
          "select id,name,follow_up_at from leads where status not in ('closed','spam') and follow_up_at is not null and follow_up_at <= current_timestamp order by follow_up_at asc limit 40",
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    access.canManageLeads
      ? query<Record<string, unknown>>(
          "select id,name from leads where visit_status='requested' order by visit_requested_at desc nulls last limit 30",
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    access.canManageLeads
      ? query<Record<string, unknown>>(
          "select lead_id,count(*)::int as unread_count,max(created_at) as latest from customer_messages where sender_type='customer' and read_by_admin_at is null group by lead_id order by max(created_at) desc limit 30",
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    access.canManageProperties
      ? query<Record<string, unknown>>(
          "select id,title from properties where deleted_at is null and status='published' and coalesce(jsonb_array_length(images),0)=0 order by updated_at desc limit 20",
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  return { leads, visits, messages, staleProperties };
}
