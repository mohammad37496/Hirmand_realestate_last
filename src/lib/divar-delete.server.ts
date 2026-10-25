import type { Sql } from "./db.ts";

export type DivarDeleteResult = {
  deleted: number;
  unpublished: number;
  skipped: number;
};

/** Atomically removes Divar queue rows and moves linked live properties to recoverable trash. */
export async function deleteDivarRows(
  sql: Pick<Sql, "query">,
  requestedIds: readonly string[],
): Promise<DivarDeleteResult> {
  const ids = Array.from(new Set(requestedIds));
  const result = await sql.query<{
    deleted: number;
    unpublished: number;
    selected: number;
  }>(
    `with selected as materialized (
       select id, imported_property_id
         from divar_files
        where id = any($1::text[])
     ), trashed as (
       update properties p
          set deleted_at = current_timestamp,
              deleted_from_status = p.status,
              status = 'archived',
              featured = false,
              featured_until = null,
              updated_at = current_timestamp
         from selected s
        where p.id = s.imported_property_id
          and p.deleted_at is null
        returning p.id, p.deleted_from_status
     ), history as (
       insert into property_change_history (property_id, action, before_state, after_state)
       select t.id, 'deleted', jsonb_build_object('status', t.deleted_from_status), null
         from trashed t
       returning property_id
     ), deleted as (
       delete from divar_files d
        using selected s
        where d.id = s.id
        returning d.id
     )
     select (select count(*)::int from deleted) as deleted,
            (select count(*)::int from trashed) as unpublished,
            (select count(*)::int from selected) as selected`,
    [ids],
  );
  const counts = result[0] ?? { deleted: 0, unpublished: 0, selected: 0 };
  return {
    deleted: Number(counts.deleted) || 0,
    unpublished: Number(counts.unpublished) || 0,
    skipped: Math.max(0, ids.length - (Number(counts.selected) || 0)),
  };
}
