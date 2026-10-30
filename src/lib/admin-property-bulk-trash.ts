export type BulkTrashedPropertyRow = { id: string };
type QueryRows = (statement: string, params: unknown[]) => Promise<BulkTrashedPropertyRow[]>;

const BULK_TRASH_SQL = [
  "with candidates as materialized (",
  "  select id, title, status, featured, price, deposit, rent, contact_name, contact_phone",
  "  from properties",
  "  where id = any($1::text[]) and deleted_at is null",
  "  for update",
  "), deleted as (",
  "  update properties p",
  "  set deleted_at = current_timestamp,",
  "      deleted_from_status = p.status,",
  "      status = 'archived',",
  "      featured = false,",
  "      featured_until = null,",
  "      updated_at = current_timestamp",
  "  from candidates c",
  "  where p.id = c.id and p.deleted_at is null",
  "  returning p.id",
  "), history as (",
  "  insert into property_change_history (property_id, action, before_state, after_state)",
  "  select c.id, 'deleted', jsonb_build_object(",
  "    'title', c.title,",
  "    'status', c.status,",
  "    'featured', c.featured,",
  "    'price', case when c.price is null then null else c.price::text end,",
  "    'deposit', case when c.deposit is null then null else c.deposit::text end,",
  "    'rent', case when c.rent is null then null else c.rent::text end,",
  "    'contactName', c.contact_name,",
  "    'contactPhone', c.contact_phone",
  "  ), null",
  "  from candidates c join deleted d on d.id = c.id",
  "  returning property_id",
  ")",
  "select d.id from deleted d join history h on h.property_id = d.id",
].join("\n");

/** Trash only active properties and write history for exactly the rows changed, atomically. */
export async function bulkTrashActiveProperties(query: QueryRows, ids: string[]): Promise<BulkTrashedPropertyRow[]> {
  if (!ids.length) return [];
  return query(BULK_TRASH_SQL, [ids]);
}