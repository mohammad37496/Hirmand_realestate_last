/**
 * Database references that keep uploaded property media alive.
 *
 * Include soft-deleted properties because the admin trash supports restoring
 * their original records and media. Floor plans are stored outside `images`,
 * so treating the gallery array as the only reference source can delete a
 * still-used object.
 */
export const ADMIN_MEDIA_REFERENCED_IDS_SQL = `
  select distinct substring(image.value from '/api/media/([^/?#]+)') as id
  from properties p
  cross join lateral jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) as image(value)
  where image.value like '%/api/media/%'
    and substring(image.value from '/api/media/([^/?#]+)') is not null
  union
  select distinct substring(p.floor_plan_url from '/api/media/([^/?#]+)') as id
  from properties p
  where p.floor_plan_url like '%/api/media/%'
    and substring(p.floor_plan_url from '/api/media/([^/?#]+)') is not null
`;

export const ADMIN_MEDIA_ORPHAN_UPLOADS_SQL = `
  select m.id
  from media_objects m
  where m.pathname like 'properties/uploads/%'
    and not exists (
      select 1
      from (${ADMIN_MEDIA_REFERENCED_IDS_SQL}) refs
      where refs.id = m.id
    )
`;

/** Shared stale-session predicates for both the legacy and property upload pipelines. */
export function staleLegacySessionPredicate(alias = "") {
  const createdAt = alias ? `${alias}.created_at` : "created_at";
  return `${createdAt} < current_timestamp - ($1::text || ' minutes')::interval`;
}

export function stalePropertySessionPredicate(alias = "") {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  return `
    ${column("created_at")} < current_timestamp - ($1::text || ' minutes')::interval
    and (
      ${column("state")} <> 'completing'
      or ${column("completion_started_at")} is null
      or ${column("completion_started_at")} < current_timestamp - interval '15 minutes'
    )
  `;
}
