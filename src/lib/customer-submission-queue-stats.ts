import type { Sql } from "./db.ts";

export type CustomerSubmissionQueueStats = {
  overdue: number;
  highPriority: number;
  unassigned: number;
  averageAgeHours: number;
  consultants: Array<{ name: string; phone: string; count: number }>;
};

/** Operational queue metrics must reject on database failure, not fabricate zeros. */
export async function loadCustomerSubmissionQueueStats(
  sql: Sql,
  team: ReadonlyArray<{ name: string; phone: string }>,
): Promise<CustomerSubmissionQueueStats> {
  const [workloadRows, slaRows] = await Promise.all([
    sql.query<{ assigned_consultant_phone: string | null; count: number }>(
      "select assigned_consultant_phone,count(*)::int as count from customer_property_submissions where status='pending' group by assigned_consultant_phone",
    ),
    sql.query<{ overdue: number; high_priority: number; unassigned: number; average_age_hours: number | null }>(
      "select count(*) filter (where coalesce(queue_started_at,created_at) < current_timestamp - interval '24 hours')::int as overdue, count(*) filter (where priority='high')::int as high_priority, count(*) filter (where assigned_consultant_phone is null or assigned_consultant_phone='')::int as unassigned, avg(extract(epoch from (current_timestamp-coalesce(queue_started_at,created_at)))/3600)::float8 as average_age_hours from customer_property_submissions where status='pending'",
    ),
  ]);
  const sla = slaRows[0];
  if (!sla) throw new Error("Customer submission queue SLA query returned no aggregate row.");
  const workloadByPhone = new Map(workloadRows.map((row) => [String(row.assigned_consultant_phone ?? ""), Number(row.count) || 0]));
  return {
    overdue: Number(sla.overdue) || 0,
    highPriority: Number(sla.high_priority) || 0,
    unassigned: Number(sla.unassigned) || 0,
    averageAgeHours: Number(sla.average_age_hours) || 0,
    consultants: team.map((person) => ({
      name: person.name,
      phone: person.phone,
      count: workloadByPhone.get(person.phone) ?? 0,
    })),
  };
}
