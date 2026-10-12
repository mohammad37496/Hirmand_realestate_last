import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requirePhoneBridgeContactsAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw new Error("برای مشاهدهٔ مخاطبین Phone Bridge مجوز امنیت مدیران لازم است.");
  }
}

const input = z.object({
  deviceId: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(200).optional().default(100),
  search: z.string().trim().max(120).optional().default(""),
});

export type PhoneBridgeContact = {
  id: string;
  deviceId: string;
  deviceName: string;
  contactId: string;
  name: string;
  numbers: string[];
  phoneUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function numbersOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 20);
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function mapContact(row: Record<string, unknown>): PhoneBridgeContact {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    deviceName: String(row.device_name ?? "گوشی ناشناس"),
    contactId: String(row.contact_id ?? ""),
    name: String(row.name ?? ""),
    numbers: numbersOf(row.numbers),
    phoneUpdatedAt: row.phone_updated_at ? new Date(String(row.phone_updated_at)).toISOString() : null,
    firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
  };
}

export const listPhoneBridgeContacts = createServerFn({ method: "POST" })
  .validator(input.extend({ page: z.number().int().min(1).max(500).optional().default(1) }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeContactsAdmin();
    if (dbSource === "unconfigured") return { contacts: [] as PhoneBridgeContact[], total: 0, page: data.page, limit: data.limit };

    const sql = await getSql();
    const search = data.search.trim();
    const pattern = "%" + search + "%";
    const countRows = await sql.query<{ count: number }>(
      `select count(*)::int as count
       from phone_bridge_contacts
       where device_id=$1
         and ($2='' or name ilike $3 or contact_id ilike $3
              or exists (select 1 from jsonb_array_elements_text(numbers) n where n ilike $3))`,
      [data.deviceId, search, pattern],
    );
    const total = Number(countRows[0]?.count ?? 0);
    const offset = (data.page - 1) * data.limit;

    const rows = await sql.query<Record<string, unknown>>(
      `select c.id,c.device_id,c.contact_id,c.name,c.numbers,c.phone_updated_at,c.first_seen_at,c.last_seen_at,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_contacts c
       left join phone_bridge_devices d on d.id=c.device_id
       where c.device_id=$1
         and ($2='' or c.name ilike $3 or c.contact_id ilike $3
              or exists (select 1 from jsonb_array_elements_text(c.numbers) n where n ilike $3))
       order by c.name asc, c.id asc
       limit $4 offset $5`,
      [data.deviceId, search, pattern, data.limit, offset],
    );
    return { contacts: rows.map(mapContact), total, page: data.page, limit: data.limit };
  });

export const listPhoneBridgeNewContacts = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(100).optional().default(50),
    sinceDays: z.number().int().min(1).max(3650).optional().default(30),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeContactsAdmin();
    if (dbSource === "unconfigured") return [] as PhoneBridgeContact[];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select c.id,c.device_id,c.contact_id,c.name,c.numbers,c.phone_updated_at,c.first_seen_at,c.last_seen_at,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_contacts c
       left join phone_bridge_devices d on d.id=c.device_id
       where c.device_id=$1
         and c.first_seen_at >= current_timestamp - make_interval(days => $2::int)
       order by c.first_seen_at desc
       limit $3`,
      [data.deviceId, data.sinceDays, data.limit],
    );
    return rows.map(mapContact);
  });
