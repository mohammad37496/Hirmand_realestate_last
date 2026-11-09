import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSafeLoginReturnPath } from "@/lib/auth/return-path.mjs";
import { SITE } from "@/lib/site";
import "@/login.css";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: getSafeLoginReturnPath(search.next),
    ...(typeof search.token === "string" ? { token: search.token } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
    ...(search.reset === "success" ? { reset: "success" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: `ورود و ساخت حساب | ${SITE.nameFa}` },
      { name: "description", content: "ورود امن به حساب هیرمند برای نگهداری علاقه‌مندی‌ها و جست‌وجوها روی همه دستگاه‌ها." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { next, token, error: resetError, reset } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(token || resetError ? "reset" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(reset === "success" ? "رمز عبور با موفقیت تغییر کرد. برای ورود، رمز جدید را وارد کنید." : "");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (token || resetError) setMode("reset");
  }, [token, resetError]);

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/login`,
      });
      if (result.error) {
        if (result.error.status === 429) throw new Error("درخواست‌های بازیابی بیش از حد مجاز است. یک دقیقه دیگر دوباره تلاش کنید.");
        throw new Error("ارسال درخواست انجام نشد. کمی بعد دوباره تلاش کنید.");
      }
      setMessage("اگر این ایمیل در هیرمند حساب کاربری داشته باشد، پیوند بازیابی برای آن ارسال می‌شود. پوشه هرزنامه را هم بررسی کنید.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سامانه بازیابی برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError("پیوند بازیابی معتبر نیست یا اعتبار آن پایان یافته است. درخواست پیوند تازه بدهید.");
      return;
    }
    if (password !== confirmPassword) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        const code = result.error.code;
        if (code === "INVALID_TOKEN") throw new Error("پیوند بازیابی نامعتبر، منقضی یا قبلاً استفاده شده است. پیوند تازه‌ای درخواست کنید.");
        if (code === "PASSWORD_TOO_SHORT") throw new Error("رمز جدید باید حداقل ۸ نویسه داشته باشد.");
        if (code === "PASSWORD_TOO_LONG") throw new Error("رمز جدید نباید بیشتر از ۱۲۸ نویسه باشد.");
        throw new Error("تغییر رمز انجام نشد. پیوند تازه‌ای درخواست کنید یا دوباره تلاش کنید.");
      }
      // Reset revokes DB sessions. Explicitly clear this browser's cached
      // session/cookies as well, then reload so the sign-in form is authoritative.
      await authClient.signOut().catch(() => undefined);
      window.location.replace("/login?reset=success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تغییر رمز انجام نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: next })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: next });
      if (result.error) throw new Error(result.error.message || "ورود به حساب انجام نشد.");
      window.location.assign(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سامانه ورود برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteChrome>
      <main className="customer-login-page" id="top">
        <section className="customer-login-card" aria-labelledby="customer-login-title">
          <div className="customer-login-brand"><span><UserRound size={24} /></span><small>فضای شخصی هیرمند</small></div>
          {!mounted || isPending ? (
            <div className="customer-login-loading"><LoaderCircle size={22} /> در حال بررسی حساب…</div>
          ) : mode === "forgot" ? (
            <>
              <h1 id="customer-login-title">بازیابی رمز عبور</h1>
              <p className="customer-login-intro">ایمیل حساب خود را وارد کنید تا در صورت وجود حساب، پیوند امن بازیابی برایتان ارسال شود.</p>
              <form className="customer-login-form" onSubmit={(event) => void requestPasswordReset(event)}>
                <label><span>ایمیل حساب</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="name@example.com" dir="ltr" /></div></label>
                {error ? <p className="customer-login-error" role="alert">{error}</p> : null}
                {message ? <p className="customer-login-notice" role="status">{message}</p> : null}
                <button type="submit" className="customer-login-submit" disabled={busy}>
                  {busy ? <LoaderCircle size={17} className="customer-login-spin" /> : <Mail size={17} />}
                  {busy ? "در حال ارسال…" : "ارسال پیوند بازیابی"}
                </button>
              </form>
              <button type="button" className="customer-login-text-button" onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>بازگشت به ورود</button>
            </>
          ) : mode === "reset" ? (
            <>
              <h1 id="customer-login-title">تعیین رمز عبور جدید</h1>
              <p className="customer-login-intro">رمز جدید باید حداقل ۸ و حداکثر ۱۲۸ نویسه داشته باشد. پیوند بازیابی فقط یک‌بار و تا یک ساعت معتبر است.</p>
              {token ? (
                <form className="customer-login-form" onSubmit={(event) => void resetPassword(event)}>
                  <label><span>رمز عبور جدید</span><div><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="حداقل ۸ نویسه" dir="ltr" /></div></label>
                  <label><span>تکرار رمز عبور جدید</span><div><KeyRound size={17} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="رمز جدید را دوباره وارد کنید" dir="ltr" /></div></label>
                  {error ? <p className="customer-login-error" role="alert">{error}</p> : null}
                  <button type="submit" className="customer-login-submit" disabled={busy}>
                    {busy ? <LoaderCircle size={17} className="customer-login-spin" /> : <ShieldCheck size={17} />}
                    {busy ? "در حال ذخیره…" : "ثبت رمز جدید"}
                  </button>
                </form>
              ) : (
                <p className="customer-login-error" role="alert">پیوند بازیابی نامعتبر یا منقضی شده است.</p>
              )}
              <button type="button" className="customer-login-text-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>درخواست پیوند بازیابی تازه</button>
            </>
          ) : user ? (
            <div className="customer-login-signed-in">
              <ShieldCheck size={34} />
              <h1 id="customer-login-title">شما وارد حساب شده‌اید</h1>
              <p>{user.displayName || user.primaryEmail || "کاربر هیرمند"}</p>
              <Link to={next} className="customer-login-submit">ادامه به صفحه موردنظر <ArrowLeft size={16} /></Link>
            </div>
          ) : !authEnabled ? (
            <div className="customer-login-signed-in">
              <h1 id="customer-login-title">ورود در دسترس نیست</h1>
              <p>سامانه حساب کاربری در این محیط فعال نشده است.</p>
              <Link to="/" className="customer-login-submit">بازگشت به سایت</Link>
            </div>
          ) : (
            <>
              <h1 id="customer-login-title">{mode === "signup" ? "ساخت حساب کاربری" : "به هیرمند خوش آمدید"}</h1>
              <p className="customer-login-intro">با حساب خود علاقه‌مندی‌ها، جست‌وجوهای ذخیره‌شده و فایل‌های اخیر را روی موبایل و کامپیوتر همراه داشته باشید.</p>

              <div className="customer-login-tabs" role="tablist" aria-label="نوع ورود">
                <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "is-active" : ""} onClick={() => { setMode("signin"); setError(""); }}>ورود</button>
                <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(""); }}>ساخت حساب</button>
              </div>

              <form className="customer-login-form" onSubmit={(event) => void submit(event)}>
                {mode === "signup" ? (
                  <label><span>نام و نام خانوادگی</span><div><UserRound size={17} /><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} required placeholder="نام شما" /></div></label>
                ) : null}
                <label><span>ایمیل</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="name@example.com" dir="ltr" /></div></label>
                <label><span>رمز عبور</span><div><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} maxLength={128} required placeholder="حداقل ۸ نویسه" dir="ltr" /></div></label>
                {error ? <p className="customer-login-error" role="alert">{error}</p> : null}
                {message ? <p className="customer-login-notice" role="status">{message}</p> : null}
                <button type="submit" className="customer-login-submit" disabled={busy}>
                  {busy ? <LoaderCircle size={17} className="customer-login-spin" /> : <ShieldCheck size={17} />}
                  {busy ? "در حال انجام…" : mode === "signup" ? "ساخت حساب و ورود" : "ورود به حساب"}
                </button>
              </form>

              {mode === "signin" ? <button type="button" className="customer-login-text-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>رمز عبور را فراموش کرده‌اید؟</button> : null}

              {GROK_PROVIDERS.length ? <>
                <div className="customer-login-divider"><span>یا ورود با</span></div>
                <div className="customer-login-providers">
                  {GROK_PROVIDERS.map((provider) => (
                    <button key={provider.providerId} type="button" onClick={() => {
                      setBusy(true);
                      setError("");
                      void signIn(provider.providerId, {
                        callbackURL: next,
                        errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
                      }).catch((cause) => {
                        setError(cause instanceof Error ? cause.message : "ورود انجام نشد. دوباره تلاش کنید.");
                        setBusy(false);
                      });
                    }} disabled={busy}>{provider.label}</button>
                  ))}
                </div>
              </> : null}
              <p className="customer-login-privacy">اطلاعات حساب شما برای نگهداری فضای شخصی استفاده می‌شود و هر کاربر فقط به داده‌های حساب خودش دسترسی دارد.</p>
            </>
          )}
          <Link to="/" className="customer-login-back"><ArrowLeft size={14} /> بازگشت به سایت</Link>
        </section>
      </main>
    </SiteChrome>
  );
}
