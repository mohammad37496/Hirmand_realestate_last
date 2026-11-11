import type { Sql } from "./db.ts";

export type AssignAdminLeadResult = { kind: "assigned"; consultantId: string; consultant: string } | { kind: "not_found" } | { kind: "consultant_unavailable" };

/** Keep the consultant update and its CRM timeline entry in one transaction. */
export async function assignAdminLeadToConsultant(
  sql: Sql,
  leadId: string,
  consultantId: string,
): Promise<AssignAdminLeadResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for lead assignment.");
  }

  return sql.transaction(async (tx) => {
    const consultants = await tx.query<{ id: string; name: string }>(
      "select id,name from consultants where id=$1 and is_active=true limit 1 for share",
      [consultantId],
    );
    const selected = consultants[0];
    if (!selected) return { kind: "consultant_unavailable" };
    const updated = await tx.query<{ id: string }>(
      "update leads set consultant_id=$2, consultant=case when consultant_id is distinct from $2 then $3 else consultant end, consultant_link_state='linked', updated_at=current_timestamp where id=$1 and status not in ('closed','spam') returning id",
      [leadId, selected.id, selected.name],
    );
    if (!updated[0]) return { kind: "not_found" };

    await tx.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
      [
        leadId,
        "تخصیص مشاور",
        "مشاور «" + selected.name + "» برای این لید ثبت شد.",
        JSON.stringify({ consultantId: selected.id, consultant: selected.name, source: "assignment_balancer" }),
      ],
    );

    return { kind: "assigned", consultantId: selected.id, consultant: selected.name };
  });
}
