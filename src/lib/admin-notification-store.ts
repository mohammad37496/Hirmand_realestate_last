import type { Sql } from "./db.ts";
import type { AdminPermission } from "./admin-roles.ts";

export type AdminNotificationStoreRow = {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_slug: string | null;
  created_at: string | Date;
  read_at: string | Date | null;
  unread_count: number | string;
};

export async function listAdminNotificationsForAccount(
  sql: Pick<Sql, "query">,
  accountId: string,
  permissions: readonly AdminPermission[],
  limit: number,
) {
  const rows = await sql.query<AdminNotificationStoreRow>(
    `select n.id,n.kind,n.severity,n.title,n.body,n.entity_type,n.entity_id,n.entity_slug,
            n.created_at,coalesce(r.read_at,n.read_at) as read_at,
            (select count(*)::int
               from admin_notifications unread
               left join admin_notification_reads unread_read
                 on unread_read.notification_id=unread.id and unread_read.account_id=$1
              where unread.required_permission=any($2::text[])
                and unread.resolved_at is null
                and unread.read_at is null
                and unread_read.read_at is null
                and unread_read.dismissed_at is null) as unread_count
       from admin_notifications n
       left join admin_notification_reads r
         on r.notification_id=n.id and r.account_id=$1
      where n.required_permission=any($2::text[])
        and n.resolved_at is null
        and r.dismissed_at is null
      order by (coalesce(r.read_at,n.read_at) is null) desc,n.created_at desc,n.id desc
      limit $3`,
    [accountId, [...permissions], limit],
  );
  return {
    unread: Number(rows[0]?.unread_count ?? 0),
    notifications: rows.map((row) => ({
      id: Number(row.id),
      kind: String(row.kind ?? "system"),
      severity: row.severity,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      entityType: row.entity_type ? String(row.entity_type) : null,
      entityId: row.entity_id ? String(row.entity_id) : null,
      entitySlug: row.entity_slug ? String(row.entity_slug) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
      readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
    })),
  };
}

export async function markAdminNotificationReadForAccount(
  sql: Pick<Sql, "query">,
  id: number,
  accountId: string,
  permissions: readonly AdminPermission[],
) {
  const rows = await sql.query<{ notification_id: number }>(
    `insert into admin_notification_reads(notification_id,account_id)
     select id,$2 from admin_notifications
      where id=$1 and required_permission=any($3::text[]) and resolved_at is null
     on conflict(notification_id,account_id) do update
       set read_at=coalesce(admin_notification_reads.read_at,excluded.read_at)
     returning notification_id`,
    [id, accountId, [...permissions]],
  );
  return rows.length > 0;
}

export async function markAllAdminNotificationsReadForAccount(
  sql: Pick<Sql, "query">,
  accountId: string,
  permissions: readonly AdminPermission[],
) {
  const rows = await sql.query<{ notification_id: number }>(
    `insert into admin_notification_reads(notification_id,account_id)
     select n.id,$1
       from admin_notifications n
       left join admin_notification_reads r
         on r.notification_id=n.id and r.account_id=$1
      where n.required_permission=any($2::text[])
        and n.resolved_at is null
        and n.read_at is null and r.read_at is null and r.dismissed_at is null
     on conflict(notification_id,account_id) do nothing
     returning notification_id`,
    [accountId, [...permissions]],
  );
  return rows.length;
}

export async function dismissAdminNotificationForAccount(
  sql: Pick<Sql, "query">,
  id: number,
  accountId: string,
  permissions: readonly AdminPermission[],
) {
  const rows = await sql.query<{ notification_id: number }>(
    `insert into admin_notification_reads(notification_id,account_id,read_at,dismissed_at)
     select id,$2,current_timestamp,current_timestamp from admin_notifications
      where id=$1 and required_permission=any($3::text[]) and resolved_at is null
     on conflict(notification_id,account_id) do update
       set read_at=coalesce(admin_notification_reads.read_at,excluded.read_at),
           dismissed_at=coalesce(admin_notification_reads.dismissed_at,excluded.dismissed_at)
     returning notification_id`,
    [id, accountId, [...permissions]],
  );
  return rows.length > 0;
}
