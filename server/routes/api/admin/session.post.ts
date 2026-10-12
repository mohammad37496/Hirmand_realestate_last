import { createHash, randomUUID } from "node:crypto";
import {
  createError,
  defineEventHandler,
  getCookie,
  readBody,
  setCookie,
  setResponseHeader,
} from "h3";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  getAdminSessionClaims,
  isAdminKeyValid,
} from "@/lib/admin-session.server";
import { verifyAdminPassword } from "@/lib/admin-password.server";
import { normalizeAdminRole } from "@/lib/admin-roles";
import { dbSource, getSql } from "@/lib/db";
import {
  assertSameOrigin,
  clearAdminAttempts,
  clientFingerprint,
  consumeAdminAttempt,
  tooManyAttemptsError,
} from "@/lib/admin-rate-limit.server";

type Body = {
  action?: "login" | "logout";
  adminKey?: string;
  username?: string;
  password?: string;
};

const secureCookie = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const body = (await readBody(event).catch(() => ({}))) as Body;
  const action = body.action ?? "login";

  assertSameOrigin(event);

  if (action === "logout") {
    const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
    if (claims?.sessionId && dbSource !== "unconfigured") {
      const sql = await getSql();
      await sql.query(
        "update admin_sessions set revoked_at = current_timestamp where id = $1 and revoked_at is null",
        [claims.sessionId],
      ).catch(() => {});
    }
    setCookie(event, ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 0,
    });
    return { success: true };
  }

  const existingClaims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
  if (existingClaims) {
    return {
      success: true,
      authenticated: true,
      role: existingClaims.role,
      accountId: existingClaims.accountId,
      displayName: existingClaims.displayName,
    };
  }

  // The key is shared by every operator, so guessing is the only attack. Count
  // every submitted key — valid or not — and lock the caller out once the
  // window is exhausted. A session probe (no key at all, which is what a plain
  // `/admin` page load sends) never counts, so refreshing while signed out can
  // never lock the operator out of their own panel.
  const fingerprint = clientFingerprint(event);
  const submittedKey = typeof body.adminKey === "string" ? body.adminKey : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const accountLogin = Boolean(username || password);

  // A signed-out session probe is not a failed login attempt.
  if (!submittedKey && !accountLogin) return { success: true, authenticated: false };

  const rateKey = accountLogin ? `admin-account-login:${fingerprint}` : `admin-login:${fingerprint}`;
  const attempt = await consumeAdminAttempt(rateKey);
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  let role = normalizeAdminRole("owner");
  let accountId: string | null = null;
  let displayName: string | null = null;

  if (accountLogin) {
    if (!username || !password) {
      throw createError({ statusCode: 401, statusMessage: "نام کاربری و رمز عبور را کامل وارد کنید." });
    }
    if (dbSource === "unconfigured") {
      throw createError({ statusCode: 503, statusMessage: "ورود با حساب کاربری بدون پایگاه داده فعال نیست." });
    }
    const sql = await getSql();
    const rows = await sql.query<{ id: string; display_name: string; password_hash: string; role: string }>(
      "select id,display_name,password_hash,role from admin_accounts where lower(username)=lower($1) and is_active=true limit 1",
      [username],
    );
    const account = rows[0];
    if (!account || !(await verifyAdminPassword(password, account.password_hash))) {
      throw createError({ statusCode: 401, statusMessage: "نام کاربری یا رمز عبور نادرست است." });
    }
    accountId = String(account.id);
    role = normalizeAdminRole(account.role);
    displayName = String(account.display_name || username);
  } else {
    if (!isAdminKeyValid(submittedKey)) {
      throw createError({ statusCode: 401, statusMessage: "کلید مدیریت نادرست است." });
    }
  }

  const sessionId = randomUUID();
  const token = await createAdminSessionToken(sessionId, { role, accountId });
  if (dbSource !== "unconfigured") {
    try {
      const sql = await getSql();
      await sql.query(
        `insert into admin_sessions (id, account_id, role, expires_at, client_hash, user_agent)
         values ($1,$2,$3,current_timestamp + interval '8 hours',$4,$5)`,
        [
          sessionId,
          accountId,
          role,
          createHash("sha256").update(fingerprint).digest("hex"),
          String(event.req.headers.get("user-agent") ?? "").slice(0, 500),
        ],
      );
      if (accountId) {
        await sql.query("update admin_accounts set last_login_at=current_timestamp,updated_at=current_timestamp where id=$1", [accountId]);
      }
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: "ثبت نشست مدیریت در پایگاه داده انجام نشد.",
      });
    }
  }
  await clearAdminAttempts(rateKey);
  setCookie(event, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  return { success: true, authenticated: true, role, accountId, displayName };
});
