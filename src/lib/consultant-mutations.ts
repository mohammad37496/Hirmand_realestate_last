import type { Sql } from "@/lib/db";

export type ConsultantMutationInput = {
  id: string;
  name: string;
  role: string;
  phone: string;
  phoneDisplay: string;
  icon: "briefcase" | "handshake";
  bio: string;
  whatsapp: string;
  telegram: string;
  eitaa: string;
  instagram: string;
  rubika: string;
  bale: string;
  igap: string;
  soroush: string;
  sortOrder: number;
  isActive: boolean;
};

/** Save a consultant and refresh its CRM lead assignments and property contact snapshots on one transaction. */
export async function saveConsultantWithSql(
  sql: Pick<Sql, "query">,
  data: ConsultantMutationInput,
) {
  // Serialize name checks so concurrent saves cannot create two consultants
  // whose assignments would be indistinguishable in name-based CRM queries.
  await sql.query("lock table consultants in share row exclusive mode");
  const duplicate = await sql.query<{ id: string }>(
    `select id
       from consultants
      where lower(trim(name)) = lower(trim($1))
        and id <> $2
      limit 1`,
    [data.name.trim(), data.id],
  );
  if (duplicate.length > 0) throw new Error("A consultant with this name already exists.");

  const existing = await sql.query<{ name: string }>(
    "select name from consultants where id = $1 limit 1 for update",
    [data.id],
  );
  const previousName = String(existing[0]?.name ?? "").trim();

  await sql.query(
    `insert into consultants
      (id, name, role, phone, phone_display, icon, bio, whatsapp, telegram, eitaa, instagram, rubika, bale, igap, soroush, sort_order, is_active, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,current_timestamp)
     on conflict (id) do update set
      name=excluded.name,
      role=excluded.role,
      phone=excluded.phone,
      phone_display=excluded.phone_display,
      icon=excluded.icon,
      bio=excluded.bio,
      whatsapp=excluded.whatsapp,
      telegram=excluded.telegram,
      eitaa=excluded.eitaa,
      instagram=excluded.instagram,
      rubika=excluded.rubika,
      bale=excluded.bale,
      igap=excluded.igap,
      soroush=excluded.soroush,
      sort_order=excluded.sort_order,
      is_active=excluded.is_active,
      updated_at=current_timestamp`,
    [
      data.id,
      data.name,
      data.role,
      data.phone,
      data.phoneDisplay,
      data.icon,
      data.bio,
      data.whatsapp,
      data.telegram,
      data.eitaa,
      data.instagram,
      data.rubika,
      data.bale,
      data.igap,
      data.soroush,
      data.sortOrder,
      data.isActive,
    ],
  );

  if (previousName && previousName !== data.name.trim()) {
    await sql.query(
      `update leads
          set consultant = $1,
              updated_at = current_timestamp
        where lower(trim(consultant)) = lower(trim($2))`,
      [data.name.trim(), previousName],
    );
  }

  if (previousName) {
    await sql.query(
      `update properties
          set contact_name = $1,
              contact_phone = $2,
              updated_at = current_timestamp
        where lower(trim(contact_name)) = lower(trim($3))`,
      [data.name.trim(), data.phone.trim(), previousName],
    );
  }

  return { ok: true };
}
