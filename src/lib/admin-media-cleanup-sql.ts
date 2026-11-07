/** Extract every database-media URL from the current persisted owner tables. */
const adminMediaReferencedIdsSql = `
  select session_media.id
  from media_objects session_media
  join media_upload_sessions session on session.pathname = session_media.pathname
  where session.pathname like 'properties/uploads/%'
    and session.created_at >= current_timestamp - ($1::text || ' minutes')::interval
  union all
  select matches.match[1] as id
  from (
    select images::text as value from properties
    union all select floor_plan_url from properties
    union all select virtual_tour_url from properties
    union all select url from music_tracks
    union all select property_data::text from customer_property_submissions
    union all select file_url from admin_deal_documents
    union all select stored_url from media_upload_sessions
      where pathname like 'properties/uploads/%'
        and created_at >= current_timestamp - ($1::text || ' minutes')::interval
    union all select '/api/media/' || stored_media_id from media_upload_sessions
      where pathname like 'properties/uploads/%'
        and stored_media_id is not null
        and created_at >= current_timestamp - ($1::text || ' minutes')::interval
    union all select completion_result::text from media_upload_sessions
      where pathname like 'properties/uploads/%'
        and created_at >= current_timestamp - ($1::text || ' minutes')::interval
    union all select hero_image from area_contents
    union all select gallery::text from area_contents
  ) refs
  cross join lateral regexp_matches(coalesce(refs.value, ''), '/api/media/([^/?#"]+)', 'g') as matches(match)
`;

/**
 * A media object is eligible only when it is an old property upload with no
 * reference from any persisted owner, including properties in the restorable
 * trash, floor plans, virtual tours, deal documents, and active upload receipts.
 */
const propertyMediaCleanupPredicate = `
  m.pathname like 'properties/uploads/%'
  and m.created_at < current_timestamp - ($1::text || ' minutes')::interval
  and not exists (
    select 1 from (${adminMediaReferencedIdsSql}) refs where refs.id = m.id
  )
  and not exists (
    select 1
    from media_upload_sessions s
    where s.pathname like 'properties/uploads/%'
      and s.created_at >= current_timestamp - ($1::text || ' minutes')::interval
      and s.pathname = m.pathname
  )
`;

export const adminMediaCleanupOrphanCountSql = `
  select count(*)::int as count
  from media_objects m
  where ${propertyMediaCleanupPredicate}
`;

export const adminMediaCleanupOrphanDeleteSql = `
  delete from media_objects m
  where ${propertyMediaCleanupPredicate}
  returning m.id
`;

export const adminMediaReferencedCountSql = `
  select count(distinct m.id)::int as count
  from media_objects m
  where m.pathname like 'properties/uploads/%'
    and exists (select 1 from (${adminMediaReferencedIdsSql}) refs where refs.id = m.id)
`;
