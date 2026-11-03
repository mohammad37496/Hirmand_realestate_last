type OpenHouseAdminListSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export async function listOpenHouseAdminData(
  sql: OpenHouseAdminListSql,
  propertyId: string,
  includeRsvps: boolean,
) {
  const property = await sql.query<{ id: string }>(
    "select id from properties where id=$1 limit 1",
    [propertyId],
  );
  if (!property[0]) return null;

  const events = await sql.query<Record<string, unknown>>(
    `select oh.id,oh.starts_at,oh.ends_at,oh.capacity,oh.note,oh.status,oh.created_at,
       coalesce(sum(case when r.status <> 'cancelled' then r.party_size else 0 end),0)::int as booked_seats
     from property_open_houses oh
     left join property_open_house_rsvps r on r.open_house_id=oh.id
     where oh.property_id=$1
     group by oh.id
     order by oh.starts_at asc
     limit 12`,
    [propertyId],
  );

  // The schedule query above uses only aggregate seat counts. Row-level RSVP
  // records contain names, phone numbers and free-form notes; never select
  // those details without lead.manage.
  const rsvps = includeRsvps
    ? await sql.query<Record<string, unknown>>(
        `select r.id,r.open_house_id,r.name,r.phone,r.party_size,r.note,r.status,r.created_at
         from property_open_house_rsvps r
         join property_open_houses oh on oh.id=r.open_house_id
         where oh.property_id=$1 and r.status <> 'cancelled'
         order by oh.starts_at asc,r.created_at asc
         limit 200`,
        [propertyId],
      )
    : [];

  return { events, rsvps };
}
