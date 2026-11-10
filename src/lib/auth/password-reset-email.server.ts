type PasswordResetEmailInput = {
  email: string;
  name: string;
  url: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function getResendEndpoint(): string {
  const configured = process.env.RESEND_API_URL?.trim();
  if (!configured) return "https://api.resend.com/emails";

  // The only supported override is a loopback mock in CI. Production always
  // sends to Resend's fixed HTTPS API; an env mistake cannot redirect secrets.
  let endpoint: URL;
  try {
    endpoint = new URL(configured);
  } catch {
    throw new Error("RESEND_API_URL must be a valid URL.");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
  if (process.env.CI !== "true" || !loopback || endpoint.protocol !== "http:") {
    throw new Error("RESEND_API_URL overrides are permitted only for loopback CI tests.");
  }
  return endpoint.toString();
}

/** Send a short-lived Better Auth reset link through Resend. */
export async function sendPasswordResetEmail({ email, name, url }: PasswordResetEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("Password reset email is not configured: RESEND_API_KEY and RESEND_FROM_EMAIL are required.");
  }

  const safeName = escapeHtml(name || "کاربر هیرمند");
  const safeUrl = escapeHtml(url);
  const response = await fetch(getResendEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "بازیابی رمز عبور حساب هیرمند",
      html: `<!doctype html><html lang="fa" dir="rtl"><body style="margin:0;background:#f4f6f8;padding:32px 12px;font-family:Tahoma,Arial,sans-serif;color:#172b40"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e9ed;border-radius:18px;padding:32px 24px;text-align:right"><h1 style="font-size:22px;color:#10243a">بازیابی رمز عبور</h1><p>سلام ${safeName}،</p><p style="line-height:2">برای تعیین رمز عبور جدید حساب هیرمند، روی دکمه زیر بزنید. این پیوند فقط یک‌بار و تا یک ساعت معتبر است.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#10243a;color:#f2d18c;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold">تعیین رمز عبور جدید</a></p><p style="font-size:13px;line-height:2;color:#687785">اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید. رمز فعلی شما تا زمان تغییر، معتبر می‌ماند.</p></main></body></html>`,
      text: `سلام ${name || "کاربر هیرمند"}،\nبرای تعیین رمز عبور جدید حساب هیرمند، این پیوند را باز کنید (اعتبار: یک ساعت):\n${url}\nاگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Provider response bodies may contain recipient or request details; keep
    // operational logs free of PII and reset-link material.
    throw new Error(`Resend email API returned HTTP ${response.status}.`);
  }
}
