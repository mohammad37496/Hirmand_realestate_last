import type { Sql } from "./db.ts";

export async function loadAdminDashboardConsultantStats(sql: Sql) {
  return sql.query<Record<string, unknown>>(
    `select
      (select count(*)::int from consultants) as total,
      (select count(*)::int from consultants where is_active = true) as active,
      (
        select count(*)::int
        from (
          select contact_name, contact_phone
          from properties
          where coalesce(trim(contact_name), '') <> ''
          group by contact_name, contact_phone
        ) assigned
        inner join consultants c
          on lower(c.name) = lower(assigned.contact_name)
          and c.phone = assigned.contact_phone
      ) as consultants_with_files,
      (
        select count(distinct lower(coalesce(consultant, '')))::int
        from leads
        where coalesce(trim(consultant), '') <> ''
      ) as consultants_with_leads`,
  );
}
