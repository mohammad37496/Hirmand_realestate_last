import type { Sql } from "./db.ts";

export type CustomerSubmissionHistoryEvent = {
  id: string;
  action: string;
  note: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function loadCustomerSubmissionHistory(
  sql: Sql,
  submissionId: string,
): Promise<CustomerSubmissionHistoryEvent[]> {
  const rows = await sql.query<Record<string, unknown>>(
    "select id,action,note,metadata,created_at from customer_property_submission_events where submission_id=$1 order by created_at desc limit 50",
    [submissionId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    action: String(row.action),
    note: String(row.note ?? ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}
