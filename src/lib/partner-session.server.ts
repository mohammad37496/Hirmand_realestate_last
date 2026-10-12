import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { normalizeDigits } from "./partner-codes";

export { normalizeDigits, normalizePartnerCode } from "./partner-codes";

export const PARTNER_SESSION_COOKIE =
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
    ? "__Host-hirmand-partner"
    : "hirmand-partner";
export const PARTNER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret() {
  const seed =
    process.env.HIRMAND_PARTNER_SESSION_SECRET?.trim() ||
    process.env.HIRMAND_ADMIN_KEY?.trim();

  if (!seed) {
    throw new Error("HIRMAND_ADMIN_KEY یا HIRMAND_PARTNER_SESSION_SECRET تنظیم نشده است.");
  }

  return createHash("sha256").update(seed + "|hirmand-partner-session").digest();
}

export async function createPartnerSessionToken(partnerId: string) {
  return new SignJWT({ role: "partner" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(partnerId)
    .setIssuedAt()
    .setExpirationTime(PARTNER_SESSION_MAX_AGE + "s")
    .sign(sessionSecret());
}

export async function verifyPartnerSessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (payload.role !== "partner" || typeof payload.sub !== "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function normalizePhone(value: string) {
  return normalizeDigits(value).replace(/[^0-9+]/g, "").slice(0, 16);
}

export function isValidPartnerPin(pin: string) {
  return /^\d{6}$/.test(normalizeDigits(pin));
}

export function hashPartnerPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const normalized = normalizeDigits(pin);
  const hash = scryptSync(normalized, salt, 32).toString("hex");
  return { hash, salt };
}

export function verifyPartnerPin(pin: string, hash: string, salt: string) {
  try {
    const actual = scryptSync(normalizeDigits(pin), salt, 32);
    const expected = Buffer.from(hash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generatePartnerCode() {
  return "HR-" + randomBytes(3).toString("hex").toUpperCase();
}

export function generatePartnerPin() {
  return String(randomInt(100000, 1000000));
}

export function generateTrackingCode() {
  const yy = String(new Date().getFullYear()).slice(-2);
  return "HIR-" + yy + "-" + randomBytes(4).toString("hex").toUpperCase();
}
