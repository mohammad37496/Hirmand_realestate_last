import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createError, getHeader, type H3Event } from "h3";
import { getSql } from "@/lib/db";

export type StaffMobileDeviceAuth = {
  id: string;
  device_id: string;
  staff_id: string;
  status: "pending" | "active" | "revoked";
};

export function generateStaffMobileToken(): string {
  return "hsm_" + randomBytes(32).toString("base64url");
}

export function hashStaffMobileToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function sameDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireStaffMobileDevice(
  event: H3Event,
  options?: { requireActive?: boolean },
): Promise<StaffMobileDeviceAuth> {
  const requireActive = options?.requireActive !== false;
  const authorization = getHeader(event, "authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const deviceId = (getHeader(event, "x-hirmand-device-id") ?? "").trim();

  if (!token || !deviceId) {
    throw createError({ statusCode: 401, statusMessage: "احراز هویت دستگاه انجام نشد." });
  }

  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    device_id: string;
    staff_id: string;
    status: "pending" | "active" | "revoked";
    auth_token_hash: string | null;
  }>(
    "select id,device_id,staff_id,status,auth_token_hash from staff_mobile_devices where device_id=$1 limit 1",
    [deviceId],
  );
  const row = rows[0];

  if (!row?.auth_token_hash || !sameDigest(hashStaffMobileToken(token), row.auth_token_hash)) {
    throw createError({ statusCode: 401, statusMessage: "توکن دستگاه معتبر نیست." });
  }

  if (requireActive && row.status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "دستگاه هنوز توسط مدیریت فعال نشده است." });
  }

  return {
    id: row.id,
    device_id: row.device_id,
    staff_id: row.staff_id,
    status: row.status,
  };
}
