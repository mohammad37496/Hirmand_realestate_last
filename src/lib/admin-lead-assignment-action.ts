import type { Sql } from "./db.ts";

export type AssignAdminLeadResult = { kind: "assigned" } | { kind: "not_found" };

/** Keep the consultant update and its CRM timeline entry in one transaction. */
export async function assignAdminLeadToConsultant(
  sql: Sql,
  leadId: string,
  consultant: string,
): Promise<AssignAdminLeadResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for lead assignment.");
  }

  return sql.transaction(async (tx) => {
    const updated = await tx.query<{ id: string }>(
      "update leads set consultant=$2, updated_at=current_timestamp where id=$1 returning id",
      [leadId, consultant],
    );
    if (!updated[0]) return { kind: "not_found" };

    await tx.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
      [
        leadId,
        "تخصیص مشاور",
        "مشاور «" + consultant + "» برای این لید ثبت شد.",
        JSON.stringify({ consultant, source: "assignment_balancer" }),
      ],
    );

    return { kind: "assigned" };
  });
}
