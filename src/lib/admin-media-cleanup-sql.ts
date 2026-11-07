/**
 * A media object is eligible for cleanup only when it is an old property upload
 * with no reference from any property (including the restorable trash), no
 * floor-plan reference, and no recent upload session that may still commit it.
 */
const propertyMediaCleanupPredicate = `
  m.pathname like 'properties/uploads/%'
  and m.created_at < current_timestamp - ($1::text || ' minutes')::interval
  and not exists (
    select 1
    from properties p
    where exists (
      select 1
      from jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) refs(value)
      where regexp_replace(
        regexp_replace(refs.value, '^.*/api/media/', ''),
        '[?#].*$',
        ''
      ) = m.id
    )
    or regexp_replace(
      regexp_replace(coalesce(p.floor_plan_url, ''), '^.*/api/media/', ''),
      '[?#].*$',
      ''
    ) = m.id
  )
  and not exists (
    select 1
    from media_upload_sessions s
    where s.kind = 'media'
      and s.created_at >= current_timestamp - ($1::text || ' minutes')::interval
      and (
        s.pathname = m.pathname
        or s.stored_media_id = m.id
        or regexp_replace(
          regexp_replace(coalesce(s.stored_url, ''), '^.*/api/media/', ''),
          '[?#].*$',
          ''
        ) = m.id
      )
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
    and exists (
      select 1
      from properties p
      where exists (
        select 1
        from jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) refs(value)
        where regexp_replace(
          regexp_replace(refs.value, '^.*/api/media/', ''),
          '[?#].*$',
          ''
        ) = m.id
      )
      or regexp_replace(
        regexp_replace(coalesce(p.floor_plan_url, ''), '^.*/api/media/', ''),
        '[?#].*$',
        ''
      ) = m.id
    )
`;
