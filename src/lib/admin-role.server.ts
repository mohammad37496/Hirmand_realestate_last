import { getCookie } from "@tanstack/react-start/server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole, type AdminPermission } from "@/lib/admin-roles";

export async function requireAdminPermission(permission: AdminPermission) {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, permission)) {
    throw new Error("سطح دسترسی این عملیات برای حساب شما کافی نیست.");
  }
  return claims;
}
