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
  returning id, title, status, featured, price, deposit, rent, contact_name, contact_phone, owner_name, owner_phone, owner_info
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
