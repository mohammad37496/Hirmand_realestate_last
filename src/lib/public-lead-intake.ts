import type { Sql } from "./db";

export type PublicLeadActivity = {
  activityType: "follow_up" | "note" | "visit";
  title: string;
  note: string;
  metadata: Record<string, unknown>;
};

export type PublicLeadFollowUp = {
  title: string;
  description: string;
  assignee?: string;
  priority: "normal" | "high" | "urgent";
  dueMinutes: number;
};

/** Persist the required CRM timeline and follow-up on the caller's transaction. */
export async function recordPublicLeadIntake(
  sql: Sql,
  leadId: string,
  activity: PublicLeadActivity,
  followUp: PublicLeadFollowUp,
): Promise<void> {
  await sql.query(
    "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,$2,$3,$4,$5::jsonb)",
    [
      leadId,
      activity.activityType,
      activity.title,
      activity.note,
      JSON.stringify(activity.metadata),
    ],
  );
  const dueAt = new Date(
    Date.now() + followUp.dueMinutes * 60_000,
  ).toISOString();
  await sql.query(
    "insert into admin_tasks(id,title,description,status,priority,due_at,assignee,entity_type,entity_id) values($1,$2,$3,'open',$4,$5,$6,'lead',$7)",
    [
      crypto.randomUUID(),
      followUp.title,
      followUp.description,
      followUp.priority,
      dueAt,
      followUp.assignee?.trim() || "",
      leadId,
    ],
  );
}

/** Create the lead and its required CRM records as one indivisible write. */
export async function createPublicLeadIntake(
  sql: Sql,
  insertLead: (transactionSql: Sql) => Promise<string | null>,
  activity: PublicLeadActivity,
  followUp: PublicLeadFollowUp,
): Promise<string> {
  if (typeof sql.transaction !== "function") {
    throw new Error(
      "Database transaction support is required for public lead intake.",
    );
  }
  return sql.transaction(async (transactionSql) => {
    const leadId = await insertLead(transactionSql);
    if (!leadId) throw new Error("Public lead insert returned no id.");
    await recordPublicLeadIntake(transactionSql, leadId, activity, followUp);
    return leadId;
  });
}
