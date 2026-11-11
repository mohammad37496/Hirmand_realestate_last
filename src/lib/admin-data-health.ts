import type { Sql } from "./db.ts";

/** Run every integrity check; a failed check must not look like a clean scan. */
export async function loadAdminDataHealthChecks(sql: Pick<Sql, "query">) {
  return Promise.all([
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.property_id from leads l left join properties p on p.id=l.property_id where l.property_id is not null and p.id is null limit 50",
    ),
    sql.query<Record<string, unknown>>(
      `select l.id,l.name,l.consultant,l.consultant_link_state,
              (select count(*)::int from consultants c
                where lower(regexp_replace(translate(trim(c.name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g'))
                    = lower(regexp_replace(translate(trim(l.consultant), 'كي', 'کی'), '[[:space:]]+', ' ', 'g'))
              ) as candidate_count
         from leads l
        where l.consultant_id is null
          and l.consultant_link_state='legacy_unresolved'
          and trim(coalesce(l.consultant,''))<>''
        order by l.created_at desc
        limit 50`,
    ),
    sql.query<Record<string, unknown>>(
      "select id,title,slug from properties where deleted_at is null and status='published' and (trim(coalesce(title,''))='' or trim(coalesce(neighborhood,''))='') limit 50",
    ),
    sql.query<Record<string, unknown>>(
      "select phone,count(*)::int as count from leads where trim(coalesce(phone,''))<>'' group by phone having count(*) > 1 order by count desc limit 30",
    ),
    sql.query<Record<string, unknown>>(
      "select id,title,latitude,longitude from properties where deleted_at is null and ((latitude is null) <> (longitude is null)) limit 50",
    ),
  ]);
}
