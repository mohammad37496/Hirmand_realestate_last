import type { Sql } from "./db.ts";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

export type NeighborhoodMarketSnapshot = {
  neighborhood: string;
  activeFiles: number;
  saleFiles: number;
  rentFiles: number;
  saleAvgPerM2: number | null;
  rentAvg: number | null;
  newFiles30d: number;
  priceDropFiles: number;
  views30d: number;
  favorites30d: number;
  calls30d: number;
  viewingRequests30d: number;
  generatedAt: string;
};

export async function loadNeighborhoodMarketSnapshot(
  sql: Sql,
  neighborhood: string,
): Promise<NeighborhoodMarketSnapshot> {
  const rows = await sql.query<Record<string, unknown>>(
    `with neighborhood_files as (
       select slug, transaction_type, price, rent, area_m2, published_at, price_drop_percent
       from properties
       where ${publicPropertyVisibilitySql()}
         and lower(trim(neighborhood))=lower(trim($1))
     ),
     event_stats as (
       select
         count(*) filter (where e.event_name='property_view')::int as views,
         count(*) filter (where e.event_name='property_favorite')::int as favorites,
         count(*) filter (where e.event_name in ('call_click','whatsapp_click'))::int as calls,
         count(*) filter (where e.event_name='visit_request')::int as visits
       from site_events e
       join neighborhood_files p on p.slug=e.property_slug
       where e.created_at >= current_timestamp - interval '30 days'
     )
     select
       count(*)::int as active_files,
       count(*) filter (where transaction_type='sell')::int as sale_files,
       count(*) filter (where transaction_type in ('rent','mortgage'))::int as rent_files,
       avg(price / nullif(area_m2,0)) filter (
         where transaction_type='sell' and price is not null and area_m2 > 0
       ) as sale_avg_per_m2,
       avg(rent) filter (
         where transaction_type in ('rent','mortgage') and rent is not null
       ) as rent_avg,
       count(*) filter (
         where published_at >= current_timestamp - interval '30 days'
       )::int as new_files_30d,
       count(*) filter (where coalesce(price_drop_percent,0) > 0)::int as price_drop_files,
       coalesce((select views from event_stats),0)::int as views_30d,
       coalesce((select favorites from event_stats),0)::int as favorites_30d,
       coalesce((select calls from event_stats),0)::int as calls_30d,
       coalesce((select visits from event_stats),0)::int as viewing_requests_30d
     from neighborhood_files`,
    [neighborhood],
  );

  const row = rows[0];
  const numberOrNull = (value: unknown) => {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    neighborhood,
    activeFiles: Number(row?.active_files) || 0,
    saleFiles: Number(row?.sale_files) || 0,
    rentFiles: Number(row?.rent_files) || 0,
    saleAvgPerM2: numberOrNull(row?.sale_avg_per_m2),
    rentAvg: numberOrNull(row?.rent_avg),
    newFiles30d: Number(row?.new_files_30d) || 0,
    priceDropFiles: Number(row?.price_drop_files) || 0,
    views30d: Number(row?.views_30d) || 0,
    favorites30d: Number(row?.favorites_30d) || 0,
    calls30d: Number(row?.calls_30d) || 0,
    viewingRequests30d: Number(row?.viewing_requests_30d) || 0,
    generatedAt: new Date().toISOString(),
  };
}
