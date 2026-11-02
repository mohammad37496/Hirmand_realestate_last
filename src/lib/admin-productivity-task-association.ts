export type TaskAssociationSql = {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<T[]>;
};

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
