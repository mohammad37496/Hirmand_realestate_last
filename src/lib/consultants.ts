import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { mergePublicConsultantDirectory } from "@/lib/consultant-directory";
import { TEAM } from "@/lib/site";

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

async function requireAdmin() {
  const session = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(session))) {
    throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
  }
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(session);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "team.manage")) {
    throw new Error("سطح دسترسی مدیریت اعضای تیم برای این حساب فعال نیست.");
  }
}

const selectColumns =
  "id, name, role, phone, phone_display, icon, bio, whatsapp, telegram, eitaa, instagram, rubika, bale, igap, soroush, sort_order, is_active";

export const listConsultants = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const rows = await sql.query<ConsultantRow>(
      `select ${selectColumns}
       from consultants
       order by sort_order asc, name asc`,
    );
    const databaseConsultants = rows.map(normalize);
    return mergePublicConsultantDirectory(databaseConsultants, staticConsultants());
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
    const sql = await getSql();
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
    return { ok: true };
  });

export const deleteConsultant = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(2).max(80) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.id === "sheikh" || data.id === "moradi") {
      throw new Error("دو پروفایل اصلی هیرمند حذف نمی‌شوند؛ می‌توانید آن‌ها را غیرفعال کنید.");
    }
    const sql = await getSql();
    await sql.query("delete from consultants where id = $1", [data.id]);
    return { ok: true };
  });
