/**
 * Database references that keep uploaded property media alive.
 *
 * Include soft-deleted properties because the admin trash supports restoring
 * their original records and media. Floor plans are stored outside `images`,
 * so treating the gallery array as the only reference source can delete a
 * still-used object.
 */
export const ADMIN_MEDIA_REFERENCED_IDS_SQL = `
  select distinct substring(refs.value from '/api/media/([^/?#"]+)') as id
  from (
    select images::text as value from properties
    union all select floor_plan_url from properties
    union all select virtual_tour_url from properties
    union all select url from music_tracks
    union all select property_data::text from customer_property_submissions
    union all select file_url from admin_deal_documents
    union all select source_url from property_video_renditions
    union all select renditions::text from property_video_renditions
    union all select stored_url from property_media_upload_sessions where state <> 'failed'
    union all select '/api/media/' || stored_media_id from property_media_upload_sessions where state <> 'failed' and stored_media_id is not null
    union all select completion_result::text from property_media_upload_sessions where state <> 'failed'
    union all select stored_url from media_upload_sessions where completion_state <> 'failed'
    union all select '/api/media/' || stored_media_id from media_upload_sessions where completion_state <> 'failed' and stored_media_id is not null
    union all select completion_result::text from media_upload_sessions where completion_state <> 'failed'
    union all select hero_image from area_contents
    union all select gallery::text from area_contents
  ) refs
  where refs.value like '%/api/media/%'
    and substring(refs.value from '/api/media/([^/?#"]+)') is not null
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
