export type TrashedPropertyRow = {
  id: string;
  title: string | null;
  images: unknown;
  floor_plan_url: string | null;
  virtual_tour_url: string | null;
};

type QueryRows = (statement: string, params: unknown[]) => Promise<TrashedPropertyRow[]>;

type PropertyRestoreQuery = (
  statement: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>;

export type RestoredProperty = {
  id: string;
  title: string;
  status: string;
};

/** Delete only a row still in trash and return media references from the row actually deleted. */
export async function deleteTrashedProperty(query: QueryRows, propertyId: string): Promise<TrashedPropertyRow | null> {
  const rows = await query(
    "delete from properties where id = $1 and deleted_at is not null returning id, title, images, floor_plan_url, virtual_tour_url",
    [propertyId],
  );
  return rows[0] ?? null;
}

export const RESTORE_TRASHED_PROPERTY_SQL = `
  update properties
  set status = case
    when deleted_from_status = 'published' and $2::boolean = false then 'draft'
    when deleted_from_status in ('draft','published','archived') then deleted_from_status
    else 'draft'
  end,
  deleted_at = null,
  deleted_from_status = null,
  updated_at = current_timestamp
  where id = $1 and deleted_at is not null
  returning id, title, status
`;

export const INSERT_PROPERTY_RESTORE_HISTORY_SQL = `
  insert into property_change_history (property_id, action, before_state, after_state)
  values ($1, 'updated', $2::jsonb, $3::jsonb)
`;

export const INSERT_PROPERTY_RESTORE_AUDIT_SQL = `
  insert into admin_audit_log
    (action, entity_type, entity_id, entity_title, actor, metadata)
  values ('property.restored', 'property', $1, $2, $3, $4::jsonb)
`;

/**
 * Restore one trashed property and persist its lifecycle history and audit
 * record on the caller's transaction connection. Any failed write rolls back
 * the restore with its audit trail.
 */
export async function restoreTrashedProperty(
  query: PropertyRestoreQuery,
  propertyId: string,
  canPublish: boolean,
  actor: string,
): Promise<RestoredProperty | null> {
  const restored = (await query(RESTORE_TRASHED_PROPERTY_SQL, [propertyId, canPublish]))[0];
  if (!restored) return null;

  const title = String(restored.title ?? "");
  const status = String(restored.status ?? "draft");
  await query(INSERT_PROPERTY_RESTORE_HISTORY_SQL, [
    propertyId,
    JSON.stringify({ status: "trash" }),
    JSON.stringify({ status }),
  ]);
  await query(INSERT_PROPERTY_RESTORE_AUDIT_SQL, [
    propertyId,
    title.trim().slice(0, 220),
    actor.trim().slice(0, 120) || "admin",
    JSON.stringify({ restoredStatus: status }),
  ]);

  return { id: String(restored.id), title, status };
}
