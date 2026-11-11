import type { Sql } from "./db";
import { createError } from "h3";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

export type ResolvedLeadConsultant = { id: string | null; name: string };

/** Resolve an explicitly selected public consultant while holding a row lock. */
export async function resolveActivePublicLeadConsultant(
  sql: Pick<Sql, "query">,
  consultantId: string | null | undefined,
): Promise<ResolvedLeadConsultant> {
  if (!consultantId) return { id: null, name: "" };
  const rows = await sql.query<{ id: string; name: string }>(
    "select id,name from consultants where id=$1 and is_active=true limit 1 for share",
    [consultantId],
  );
  if (!rows[0]) {
    throw createError({ statusCode: 409, statusMessage: "مشاور انتخاب‌شده دیگر فعال یا معتبر نیست. صفحه را تازه‌سازی کنید." });
  }
  return { id: rows[0].id, name: rows[0].name };
}

/** Resolve a property's authoritative consultant relation under the property lock. */
export async function resolvePropertyLeadConsultant(
  sql: Pick<Sql, "query">,
  propertyId: string,
  fallbackSnapshot = "",
): Promise<ResolvedLeadConsultant> {
  // Lock order matters: consultant first, property second. ON DELETE SET NULL
  // locks the consultant row before updating properties; reversing this order
  // can deadlock with a concurrent consultant deletion.
  const observed = await sql.query<{ consultant_id: string | null }>(
    `select consultant_id from properties
      where id::text=$1 and ${publicPropertyVisibilitySql()}
        and availability_status not in ('sold','rented','unavailable')
      limit 1`,
    [propertyId],
  );
  if (!observed[0]) throw createError({ statusCode: 404, statusMessage: "فایل موردنظر دیگر در دسترس نیست." });
  const observedConsultantId = observed[0].consultant_id;
  const consultants = observedConsultantId
    ? await sql.query<{ id: string; name: string }>(
        "select id,name from consultants where id=$1 limit 1 for share",
        [observedConsultantId],
      )
    : [];
  const properties = await sql.query<{ consultant_id: string | null }>(
    `select consultant_id from properties
      where id::text=$1 and ${publicPropertyVisibilitySql()}
        and availability_status not in ('sold','rented','unavailable')
      limit 1 for update`,
    [propertyId],
  );
  if (!properties[0]) throw createError({ statusCode: 404, statusMessage: "فایل موردنظر دیگر در دسترس نیست." });
  if (properties[0].consultant_id !== observedConsultantId) {
    throw createError({ statusCode: 409, statusMessage: "مشاور فایل هم‌زمان تغییر کرده است. دوباره تلاش کنید." });
  }
  if (observedConsultantId && !consultants[0]) {
    throw createError({ statusCode: 409, statusMessage: "مشاور فایل دیگر در دسترس نیست. دوباره تلاش کنید." });
  }
  return { id: consultants[0]?.id ?? null, name: consultants[0]?.name ?? fallbackSnapshot };
}

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
