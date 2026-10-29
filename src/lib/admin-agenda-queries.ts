/** Scheduled visits shown in the admin agenda must fall within the next 7 days. */
export const ADMIN_UPCOMING_VISITS_SQL = `
  select id,name,phone,deal,neighborhood,consultant,visit_status,visit_preferred_at
  from leads
  where visit_status in ('requested','confirmed')
    and visit_preferred_at is not null
    and visit_preferred_at >= current_timestamp
    and visit_preferred_at <= current_timestamp + interval '7 days'
  order by visit_preferred_at asc
  limit 8
`;
