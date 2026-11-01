import { MERGE_LEADS_WITH_ACTIVITY_SQL } from "./admin-lead-dedupe-sql.ts";

export type LeadDedupeSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type LeadReferenceLockResult =
  | { kind: "locked" }
  | { kind: "missing" }
  | { kind: "merged"; canonicalId: string };

/** Lock lead references before creating or moving an internal CRM relationship. */
export async function lockLeadReferencesForMutation(
  tx: LeadDedupeSql,
  leadIds: Array<string | null | undefined>,
): Promise<LeadReferenceLockResult> {
  const ids = [...new Set(leadIds.map((id) => String(id ?? "").trim()).filter(Boolean))].sort();
  if (!ids.length) return { kind: "locked" };
  const rows = await tx.query<{
    id: string;
    merged_into_lead_id: string | null;
  }>(
    "select id,merged_into_lead_id from leads where id=any($1::text[]) order by id for update",
    [ids],
  );
  if (rows.length !== ids.length) return { kind: "missing" };
  const merged = rows.find((row) => row.merged_into_lead_id);
  if (merged?.merged_into_lead_id) {
    return { kind: "merged", canonicalId: String(merged.merged_into_lead_id) };
  }
  return { kind: "locked" };
}

export type LeadDedupeMutationResult = {
  movedActivities: number;
  movedDeals: number;
  movedFinanceTransactions: number;
  movedTasks: number;
  cancelledTaskCollisions: number;
};

/**
 * Execute every database mutation for a dedupe on the caller's transaction.
 * Token-addressed messages, cooldowns, feedback and customer submissions stay
 * on the duplicate row: public tracking codes resolve through that row and the
 * duplicate is intentionally retained. Internal CRM activities, deals,
 * finance ledger links and open tasks move to the canonical lead.
 */
export async function mergeLeadDedupeRelations(
  tx: LeadDedupeSql,
  canonicalId: string,
  duplicateId: string,
): Promise<LeadDedupeMutationResult | null> {
  const merged = await tx.query<{
    canonical_id: string | null;
    duplicate_id: string | null;
    moved_activities: number;
    history_id: number | string | null;
  }>(MERGE_LEADS_WITH_ACTIVITY_SQL, [canonicalId, duplicateId, [canonicalId, duplicateId]]);
  const row = merged[0];
  if (!row?.canonical_id || !row.duplicate_id || !row.history_id) return null;

  const deals = await tx.query<{ id: string }>(
    "update admin_deals set lead_id=$1,updated_at=current_timestamp where lead_id=$2 returning id",
    [canonicalId, duplicateId],
  );
  const finance = await tx.query<{ id: number }>(
    "update finance_transactions set lead_id=$1 where lead_id=$2 returning id",
    [canonicalId, duplicateId],
  );

  // The lead rows are already locked by the caller. Lock related tasks in a
  // stable order before resolving the one-open-overdue-follow-up unique index.
  const tasks = await tx.query<{
    id: string;
    entity_id: string;
    dedupe_key: string | null;
    created_at: string;
  }>(
    `select id,entity_id,dedupe_key,created_at
     from admin_tasks
     where entity_type='lead' and entity_id=any($1::text[]) and status='open'
     order by id for update`,
    [[canonicalId, duplicateId]],
  );
  const overdue = tasks
    .filter((task) => task.dedupe_key === "overdue_follow_up")
    .sort((left, right) => {
      const byDate = Date.parse(String(right.created_at)) - Date.parse(String(left.created_at));
      return byDate || String(right.id).localeCompare(String(left.id));
    });
  const losingOverdueTaskIds = overdue.slice(1).map((task) => String(task.id));
  if (losingOverdueTaskIds.length) {
    await tx.query(
      `update admin_tasks
       set status='cancelled',
           description=concat_ws(E'\\n',nullif(trim(description),''),$2::text),
           updated_at=current_timestamp
       where id=any($1::text[]) and status='open'`,
      [losingOverdueTaskIds, `پیگیری تکراری هنگام ادغام لید به ${canonicalId} لغو شد.`],
    );
  }
  const movedTasks = await tx.query<{ id: string }>(
    `update admin_tasks set entity_id=$1,updated_at=current_timestamp
     where entity_type='lead' and entity_id=$2 and status='open' returning id`,
    [canonicalId, duplicateId],
  );

  return {
    movedActivities: Number(row.moved_activities) || 0,
    movedDeals: deals.length,
    movedFinanceTransactions: finance.length,
    movedTasks: movedTasks.length,
    cancelledTaskCollisions: losingOverdueTaskIds.length,
  };
}
