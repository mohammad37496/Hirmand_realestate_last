export type TaskAssociationSql = {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<T[]>;
};

export type TaskLeadAssociationLockResult =
  | { kind: "locked" }
  | { kind: "missing" }
  | { kind: "merged"; canonicalId: string }
  | { kind: "inactive"; status: string };

/** Lock lead references and recheck the target lead before attaching a task. */
export const LOCK_TASK_LEAD_REFERENCES_SQL = `
  select id,status,merged_into_lead_id
  from leads
  where id=any($1::text[])
  order by id
  for update
`;

export async function lockTaskLeadReferences(
  tx: TaskAssociationSql,
  leadIds: Array<string | null | undefined>,
  requiredActiveLeadId?: string | null,
): Promise<TaskLeadAssociationLockResult> {
  const ids = [...new Set(leadIds.map((id) => String(id ?? "").trim()).filter(Boolean))].sort();
  if (!ids.length) return { kind: "locked" };
  const rows = await tx.query<{
    id: string;
    status: string;
    merged_into_lead_id: string | null;
  }>(LOCK_TASK_LEAD_REFERENCES_SQL, [ids]);
  if (rows.length !== ids.length) return { kind: "missing" };
  const merged = rows.find((row) => row.merged_into_lead_id);
  if (merged?.merged_into_lead_id) return { kind: "merged", canonicalId: String(merged.merged_into_lead_id) };
  if (requiredActiveLeadId) {
    const target = rows.find((row) => row.id === requiredActiveLeadId);
    if (!target) return { kind: "missing" };
    if (target.status === "closed" || target.status === "spam") {
      return { kind: "inactive", status: target.status };
    }
  }
  return { kind: "locked" };
}

/** Serialize task associations with property trash/archive lifecycle writes. */
export const LOCK_ACTIVE_PROPERTY_FOR_TASK_SQL = `
  select id
  from properties
  where id=$1 and deleted_at is null and status <> 'archived'
  for update
`;

export async function lockActivePropertyForTask(
  tx: TaskAssociationSql,
  propertyId: string,
): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(LOCK_ACTIVE_PROPERTY_FOR_TASK_SQL, [propertyId]);
  return rows.length > 0;
}
