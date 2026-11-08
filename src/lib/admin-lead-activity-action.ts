import type { Sql } from "./db.ts";

export type AdminLeadActivityMutation =
  | { kind: "status"; leadId: string; status: string; followUpAt: string | null }
  | { kind: "visit_status"; leadId: string; visitStatus: string }
  | { kind: "note"; leadId: string; note: string }
  | { kind: "follow_up"; leadId: string; followUpAt: string | null };

export type AdminLeadActivityMutationResult =
  | { kind: "updated"; note?: string | null; followUpAt?: string | null }
  | { kind: "not_found" };

/** Keep each CRM field mutation and its audit timeline entry in one transaction. */
export async function updateAdminLeadWithActivity(
  sql: Sql,
  mutation: AdminLeadActivityMutation,
): Promise<AdminLeadActivityMutationResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for lead updates.");
  }

  return sql.transaction(async (tx) => {
    let updated: Array<{ id: string; note?: string | null; follow_up_at?: string | null }>;
    let activity: { type: string; title: string; note: string; metadata?: Record<string, unknown> };

    switch (mutation.kind) {
      case "status":
        updated = await tx.query(
          "update leads set status=$2, follow_up_at=$3, last_contacted_at=case when $2='contacted' then current_timestamp else last_contacted_at end, updated_at=current_timestamp where id=$1 returning id",
          [mutation.leadId, mutation.status, mutation.followUpAt],
        );
        activity = {
          type: "status",
          title: "وضعیت تغییر کرد",
          note: "وضعیت جدید: " + mutation.status,
          metadata: { status: mutation.status },
        };
        break;
      case "visit_status":
        updated = await tx.query(
          "update leads set visit_status=$2, updated_at=current_timestamp where id=$1 returning id",
          [mutation.leadId, mutation.visitStatus],
        );
        activity = {
          type: "visit",
          title: "وضعیت بازدید تغییر کرد",
          note: "وضعیت بازدید: " + mutation.visitStatus,
          metadata: { visitStatus: mutation.visitStatus },
        };
        break;
      case "note":
        updated = await tx.query(
          "update leads set note=$2, updated_at=current_timestamp where id=$1 returning id, note",
          [mutation.leadId, mutation.note],
        );
        activity = {
          type: "note",
          title: "یادداشت داخلی به‌روزرسانی شد",
          note: updated[0]?.note ?? "",
        };
        break;
      case "follow_up":
        updated = await tx.query(
          "update leads set follow_up_at=$2::timestamptz, status=case when $2::timestamptz is not null and status='new' then 'follow_up' else status end, updated_at=current_timestamp where id=$1 returning id, follow_up_at",
          [mutation.leadId, mutation.followUpAt],
        );
        activity = {
          type: "follow_up",
          title: mutation.followUpAt ? "پیگیری زمان‌بندی شد" : "پیگیری حذف شد",
          note: mutation.followUpAt ? "زمان پیگیری: " + mutation.followUpAt : "زمان پیگیری بعدی پاک شد.",
          metadata: { followUpAt: mutation.followUpAt },
        };
        break;
    }

    const row = updated[0];
    if (!row) return { kind: "not_found" };

    await tx.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,$2,$3,$4,$5::jsonb)",
      [mutation.leadId, activity.type, activity.title, activity.note, JSON.stringify(activity.metadata ?? {})],
    );

    return {
      kind: "updated",
      ...(mutation.kind === "note" ? { note: row.note ?? "" } : {}),
      ...(mutation.kind === "follow_up" ? { followUpAt: row.follow_up_at ?? null } : {}),
    };
  });
}
