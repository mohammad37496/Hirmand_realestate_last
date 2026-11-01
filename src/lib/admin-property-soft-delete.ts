export type PropertyTrashQuery = (
  statement: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>;

export type SoftDeletedProperty = {
  id: string;
  title: string;
  fromStatus: string;
};

export const LOCK_ACTIVE_PROPERTY_FOR_TRASH_SQL = `
  select *
  from properties
  where id = $1 and deleted_at is null
  for update
`;

export const SOFT_DELETE_PROPERTY_SQL = `
  update properties
  set deleted_at = current_timestamp,
      deleted_from_status = status,
      status = 'archived',
      featured = false,
      featured_until = null,
      updated_at = current_timestamp
  where id = $1 and deleted_at is null
  returning id
`;

export const INSERT_PROPERTY_TRASH_HISTORY_SQL = `
  insert into property_change_history (property_id, action, before_state, after_state)
  values ($1, 'deleted', $2::jsonb, null)
`;

export const INSERT_PROPERTY_TRASH_AUDIT_SQL = `
  insert into admin_audit_log
    (action, entity_type, entity_id, entity_title, actor, metadata)
  values ('property.trashed', 'property', $1, $2, $3, $4::jsonb)
`;

/**
 * Soft-delete one active property and persist its lifecycle history and audit
 * record on the caller's transaction connection. The row lock makes the
 * before-state snapshot match the row that is actually moved to trash.
 */
export async function softDeleteProperty(
  query: PropertyTrashQuery,
  propertyId: string,
  serializeBeforeState: (row: Record<string, unknown>) => unknown,
  actor: string,
): Promise<SoftDeletedProperty | null> {
  const existing = (await query(LOCK_ACTIVE_PROPERTY_FOR_TRASH_SQL, [propertyId]))[0];
  if (!existing) return null;

  const deleted = (await query(SOFT_DELETE_PROPERTY_SQL, [propertyId]))[0];
  if (!deleted) return null;

  const fromStatus = String(existing.status ?? "");
  const title = String(existing.title ?? "");
  await query(INSERT_PROPERTY_TRASH_HISTORY_SQL, [
    propertyId,
    JSON.stringify(serializeBeforeState(existing)),
  ]);
  await query(INSERT_PROPERTY_TRASH_AUDIT_SQL, [
    propertyId,
    title,
    actor.trim().slice(0, 120) || "admin",
    JSON.stringify({ fromStatus }),
  ]);

  return { id: String(deleted.id), title, fromStatus };
}
