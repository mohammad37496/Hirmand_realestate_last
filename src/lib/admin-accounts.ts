import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";
import { hashAdminPassword } from "@/lib/admin-password.server";
import { hasAdminPermission, normalizeAdminRole, type AdminRole } from "@/lib/admin-roles";

async function requireAccountsAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "accounts.manage")) {
    throw new Error("فقط مالک سیستم می‌تواند حساب‌های مدیران را مدیریت کند.");
  }
  return claims;
}

const roleSchema = z.enum(["owner","manager","sales","content","staff","viewer"]);

export type AdminAccountSummary = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export const listAdminAccounts = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const current = await requireAccountsAdmin();
    if (dbSource === "unconfigured") return { accounts: [], currentAccountId: current?.accountId ?? null };
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      'select id, username, display_name, role, is_active, created_at, last_login_at from admin_accounts order by is_active desc, created_at asc',
    );
    return {
      currentAccountId: current?.accountId ?? null,
      accounts: rows.map((row) => ({
        id: String(row.id),
        username: String(row.username ?? ""),
        displayName: String(row.display_name ?? ""),
        role: normalizeAdminRole(row.role),
        isActive: Boolean(row.is_active),
        createdAt: new Date(String(row.created_at)).toISOString(),
        lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null,
      })),
    };
  });

export const createAdminAccount = createServerFn({ method: "POST" })
  .validator(z.object({
    username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
    displayName: z.string().trim().min(2).max(100),
    password: z.string().min(10).max(200),
    role: roleSchema,
  }))
  .handler(async ({ data }) => {
    await requireAccountsAdmin();
    if (dbSource === "unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
    const sql = await getSql();
    const exists = await sql.query<{ id: string }>(
      'select id from admin_accounts where lower(username)=lower($1) limit 1',
      [data.username],
    );
    if (exists.length) throw new Error("این نام کاربری قبلاً ثبت شده است.");
    const id = crypto.randomUUID();
    const passwordHash = await hashAdminPassword(data.password);
    await sql.query(
      'insert into admin_accounts (id, username, display_name, password_hash, role) values ($1,$2,$3,$4,$5)',
      [id, data.username, data.displayName, passwordHash, data.role],
    );
    await writeAdminAuditLog({
      action: "admin_account_created",
      entityType: "admin_account",
      entityId: id,
      entityTitle: data.displayName,
      metadata: { username: data.username, role: data.role },
    });
    return { success: true, id };
  });

export const setAdminAccountActive = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const current = await requireAccountsAdmin();
    if (current?.accountId && current.accountId === data.id && !data.active) {
      throw new Error("حسابی که با آن وارد شده‌اید را نمی‌توان غیرفعال کرد.");
    }
    if (dbSource === "unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
    const sql = await getSql();
    if (!data.active) {
      const target = await sql.query<{ role: string; is_active: boolean }>(
        'select role,is_active from admin_accounts where id=$1 limit 1',
        [data.id],
      );
      if (target[0]?.is_active && normalizeAdminRole(target[0].role) === "owner") {
        const owners = await sql.query<{ count: number }>(
          "select count(*)::int as count from admin_accounts where role='owner' and is_active=true",
        );
        if (Number(owners[0]?.count) <= 1) throw new Error("حداقل یک مالک سیستم فعال باید باقی بماند.");
      }
    }
    const rows = await sql.query<{ id: string }>(
      'update admin_accounts set is_active=$2, updated_at=current_timestamp where id=$1 returning id',
      [data.id, data.active],
    );
    if (!rows[0]) throw new Error("حساب مدیر پیدا نشد.");
    await writeAdminAuditLog({
      action: data.active ? "admin_account_activated" : "admin_account_deactivated",
      entityType: "admin_account",
      entityId: data.id,
    });
    return { success: true };
  });

export const resetAdminAccountPassword = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), password: z.string().min(10).max(200) }))
  .handler(async ({ data }) => {
    await requireAccountsAdmin();
    if (dbSource === "unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
    const sql = await getSql();
    const passwordHash = await hashAdminPassword(data.password);
    const rows = await sql.query<{ id: string }>(
      'update admin_accounts set password_hash=$2, updated_at=current_timestamp where id=$1 returning id',
      [data.id, passwordHash],
    );
    if (!rows[0]) throw new Error("حساب مدیر پیدا نشد.");
    await sql.query(
      "update admin_sessions set revoked_at=current_timestamp where account_id=$1 and revoked_at is null",
      [data.id],
    );
    await writeAdminAuditLog({
      action: "admin_account_password_reset",
      entityType: "admin_account",
      entityId: data.id,
    });
    return { success: true };
  });
