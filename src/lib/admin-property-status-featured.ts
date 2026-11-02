export function resolveFeaturedStateForPropertyStatus(
  status: "draft" | "published" | "archived",
  featured: boolean,
  featuredUntil: string | null | undefined,
) {
  const keepFeatured = status !== "archived" && featured;
  return {
    featured: keepFeatured,
    featuredUntil: keepFeatured ? featuredUntil ?? null : null,
  };
}

/** Bulk status changes must retire feature flags when a listing is archived. */
export const BULK_UPDATE_PROPERTY_STATUS_SQL = `
  update properties
  set status = $1,
      publish_at = case when $1 = 'draft' then publish_at else null end,
      unpublish_at = case when $1 = 'published' then unpublish_at else null end,
      published_at = case
        when $1 = 'published' then coalesce(published_at, current_timestamp)
        else null
      end,
      featured = case when $1 = 'archived' then false else featured end,
      featured_until = case when $1 = 'archived' then null else featured_until end,
      updated_at = current_timestamp
  where id = any($2::text[])
    and deleted_at is null
  returning id, title, status, featured, price, deposit, rent, contact_name, contact_phone
`;

/** Only published, non-trashed properties may be turned into featured listings. */
export const BULK_SET_PROPERTY_FEATURED_SQL = `
  update properties
  set featured = $1,
      featured_until = null,
      updated_at = current_timestamp
  where id = any($2::text[])
    and ($1::boolean = false or (status = 'published' and deleted_at is null))
  returning id, title, status, featured, price, deposit, rent, contact_name, contact_phone
`;

export type PropertyFeaturedQuery = (
  statement: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>;

/**
 * Change featured state and persist its history on the caller's transaction.
 * Locking the selected rows keeps the before-state snapshot aligned with the
 * update when a concurrent archive/restore operation is changing lifecycle.
 */
export async function bulkSetPropertyFeaturedWithSql(
  query: PropertyFeaturedQuery,
  ids: string[],
  featured: boolean,
  includeOwnerDetails = false,
) {
  const beforeRows = await query(
    `select id, title, status, featured, price, deposit, rent, contact_name, contact_phone
     from properties
     where id = any($1::text[])
     for update`,
    [ids],
  );
  const rows = await query(BULK_SET_PROPERTY_FEATURED_SQL, [featured, ids]);

  if (rows.length) {
    const updatedIds = new Set(rows.map((row) => String(row.id)));
    const changedBeforeRows = beforeRows.filter((row) => updatedIds.has(String(row.id)));
    const beforePayload = JSON.stringify(
      changedBeforeRows.map((row) => ({
        id: String(row.id),
        before_state: {
          title: row.title == null ? null : String(row.title),
          status: row.status == null ? null : String(row.status),
          featured: Boolean(row.featured),
          price: row.price == null ? null : String(row.price),
          deposit: row.deposit == null ? null : String(row.deposit),
          rent: row.rent == null ? null : String(row.rent),
          contactName: row.contact_name == null ? null : String(row.contact_name),
          contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
        },
      })),
    );
    const afterOwnerJsonFields = includeOwnerDetails
      ? ", 'ownerName', p.owner_name, 'ownerPhone', p.owner_phone, 'ownerInfo', p.owner_info"
      : "";
    await query(
      `with before as (
         select *
         from jsonb_to_recordset($1::jsonb)
           as b(id text, before_state jsonb)
       )
       insert into property_change_history (property_id, action, before_state, after_state)
       select
         p.id,
         'updated',
         before.before_state,
         jsonb_build_object(
           'title', p.title,
           'status', p.status,
           'availabilityStatus', p.availability_status,
           'featured', p.featured,
           'price', p.price,
           'deposit', p.deposit,
           'rent', p.rent,
           'contactName', p.contact_name,
           'contactPhone', p.contact_phone${afterOwnerJsonFields}
         )
       from properties p
       join before on before.id = p.id`,
      [beforePayload],
    );
  }

  return rows;
}
