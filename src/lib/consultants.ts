import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSql, withSqlTransaction } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole, type AdminPermission } from "@/lib/admin-roles";
import { TEAM } from "@/lib/site";
import { saveConsultantWithSql } from "@/lib/consultant-mutations";

export type ConsultantIcon = "briefcase" | "handshake";

export type Consultant = {
  id: string;
  name: string;
  role: string;
  phone: string;
  phoneDisplay: string;
  icon: ConsultantIcon;
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

type ConsultantRow = {
  id: string;
  name: string;
  role: string;
  phone: string;
  phone_display: string;
  icon: string;
  bio: string;
  whatsapp: string;
  telegram: string;
  eitaa: string;
  instagram: string;
  rubika: string;
  bale: string;
  igap: string;
  soroush: string;
  sort_order: number;
  is_active: boolean;
};

function normalize(row: ConsultantRow): Consultant {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    phoneDisplay: row.phone_display,
    icon: row.icon === "briefcase" ? "briefcase" : "handshake",
    bio: row.bio,
    whatsapp: row.whatsapp,
    telegram: row.telegram,
    eitaa: row.eitaa,
    instagram: row.instagram,
    rubika: row.rubika,
    bale: row.bale,
    igap: row.igap,
    soroush: row.soroush,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function staticConsultants(): Consultant[] {
  return TEAM.map((person, index) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    phone: person.phone,
    phoneDisplay: person.phoneDisplay,
    icon: person.icon,
    bio: "ارتباط مستقیم برای فایل‌ها و پیگیری درخواست‌های ملکی در هیرمند.",
    whatsapp: `https://wa.me/${person.phone.replace(/^0/, "98")}`,
    telegram: "https://t.me/Hirmand_realestate",
    eitaa: "https://eitaa.com/Hirmand_realestate",
    instagram: "https://ig.me/m/hirmand.realestate",
    rubika: "",
    bale: "",
    igap: "",
    soroush: "",
    sortOrder: (index + 1) * 10,
    isActive: true,
  }));
}

async function requireAdmin(permission: AdminPermission = "settings.manage") {
  const session = getCookie(ADMIN_SESSION_COOKIE);
  if (await verifyAdminSessionToken(session)) {
    assertAdminServerFnOrigin();
    const claims = await getAdminSessionClaims(session);
    if (!hasAdminPermission(normalizeAdminRole(claims?.role), permission)) {
      throw new Error("دسترسی لازم برای این عملیات وجود ندارد.");
    }
    return;
  }
  throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
}

const selectColumns =
  "id, name, role, phone, phone_display, icon, bio, whatsapp, telegram, eitaa, instagram, rubika, bale, igap, soroush, sort_order, is_active";

export const listConsultants = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const rows = await sql.query<ConsultantRow>(
      `select ${selectColumns}
       from consultants
       where is_active = true
       order by sort_order asc, name asc`,
    );
    // A successful database read is authoritative, including an empty result.
    // Re-adding bundled profiles here would make deleted consultants reappear.
    return rows.map(normalize);
  } catch (error) {
    console.warn("[consultants] database directory unavailable; using bundled team", error);
  }

  return staticConsultants();
});

const consultantInput = z.object({
  id: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  phoneDisplay: z.string().trim().min(7).max(40),
  icon: z.enum(["briefcase", "handshake"]),
  bio: z.string().trim().max(500),
  whatsapp: z.string().trim().max(500),
  telegram: z.string().trim().max(500),
  eitaa: z.string().trim().max(500),
  instagram: z.string().trim().max(500),
  rubika: z.string().trim().max(500),
  bale: z.string().trim().max(500),
  igap: z.string().trim().max(500),
  soroush: z.string().trim().max(500),
  sortOrder: z.number().int().min(0).max(100000),
  isActive: z.boolean(),
});

export const listAdminConsultants = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const sql = await getSql();
  const rows = await sql.query<ConsultantRow>(
    `select ${selectColumns}
     from consultants
     order by sort_order asc, name asc`,
  );
  return rows.map(normalize);
});

export const saveConsultant = createServerFn({ method: "POST" })
  .validator(consultantInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return withSqlTransaction((sql) => saveConsultantWithSql(sql, data));
  });

export const deleteConsultant = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(2).max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const sql = await getSql();
    await sql.query("delete from consultants where id = $1", [data.id]);
    return { ok: true };
  });
