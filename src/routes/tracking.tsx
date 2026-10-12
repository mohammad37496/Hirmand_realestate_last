import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Check, Copy, Gift, History, KeyRound, LogIn, LogOut, RefreshCw, Send, Ticket } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/hirmand/logo";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { SITE } from "@/lib/site";
import { trackingHead } from "@/lib/seo";
import type { PartnerContract, PartnerOverview } from "@/lib/partner-program.server";
import { partnerPortalUrl, partnerQrImageUrl } from "@/lib/partner-links";
import { isValidTrackingCode, normalizeDigits, normalizePartnerCode, normalizeTrackingCode } from "@/lib/partner-codes";

const TX_LABEL: Record<string, string> = {
  buy: "درخواست خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار تأیید",
  approved: "تأییدشده",
  rejected: "ردشده",
};


function faDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tehran",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function StampGrid({ partner }: { partner: PartnerOverview }) {
  const next = partner.contractCount % 3 === 0 ? 3 : 3 - (partner.contractCount % 3);
  return (
    <section className="partner-card-panel">
      <div className="partner-card-head">
        <div>
          <span className="kicker">کارت فیزیکی شما</span>
          <h2>کارت شماره {partner.cardNumber.toLocaleString("fa-IR")}</h2>
        </div>
        <strong>{partner.cardStamps.toLocaleString("fa-IR")} / ۱۲ مهر</strong>
      </div>
      <div className="partner-stamp-grid" aria-label="۱۲ خانه مهر">
        {Array.from({ length: 12 }, (_, index) => {
          const filled = index < partner.cardStamps;
          return (
            <span key={index} className={"partner-stamp-box" + (filled ? " is-filled" : "")}>
              {filled ? <Check size={18} strokeWidth={3} /> : index + 1}
            </span>
          );
        })}
      </div>
      <div className="partner-card-progress">
        <span style={{ width: Math.min(100, (partner.cardStamps / 12) * 100) + "%" }} />
      </div>
      <div className="partner-card-foot">
        <span>هر ۳ قرارداد تأییدشده = یک ثبت رایگان</span>
        {partner.availableRewards > 0 ? (
          <b className="partner-reward-ready"><Gift size={15} /> {partner.availableRewards.toLocaleString("fa-IR")} پاداش آماده</b>
        ) : partner.cardStamps >= 12 ? (
          <b>کارت کامل شده؛ برای کارت بعدی با هیرمند هماهنگ کنید.</b>
        ) : (
          <b>{next.toLocaleString("fa-IR")} قرارداد تا پاداش بعدی</b>
        )}
      </div>
    </section>
  );
}

function ContractRow({ contract }: { contract: PartnerContract }) {
  return (
    <article className="partner-contract-row">
      <div className="partner-contract-code" dir="ltr">
        <Ticket size={15} />
        {contract.trackingCode}
      </div>
      <div className="partner-contract-main">
        <strong>{STATUS_LABEL[contract.status] ?? contract.status}</strong>
        <span>{TX_LABEL[contract.transactionType] ?? contract.transactionType}</span>
        {contract.contractReference ? <small>شناسه قرارداد: {contract.contractReference}</small> : null}
      </div>
      <div className="partner-contract-date">{faDate(contract.createdAt)}</div>
    </article>
  );
}

export const Route = createFileRoute("/tracking")({
  component: TrackingPage,
  head: () => trackingHead(),
});

function TrackingPage() {
  const [partner, setPartner] = useState<PartnerOverview | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<{
    trackingCode: string;
    transactionLabel: string;
    statusLabel: string;
    status: string;
    agencyName: string;
    createdAt: string;
    approvedAt: string | null;
  } | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const [contractForm, setContractForm] = useState({
    contractReference: "",
    clientName: "",
    transactionType: "sell",
    note: "",
  });
  const [message, setMessage] = useState("");

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} کپی شد.`);
    } catch {
      setMessage(`کپی ${label} در این مرورگر در دسترس نیست.`);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const prefilled = params.get("code");
        if (prefilled && !cancelled) setCode(normalizePartnerCode(prefilled));
        const response = await fetch("/api/partner/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "me" }),
        });
        const data = (await response.json().catch(() => null)) as { partner?: PartnerOverview | null; authenticated?: boolean } | null;
        if (!cancelled && response.ok && data?.authenticated && data.partner) setPartner(data.partner);
      } catch {
        if (!cancelled) setMessage("بررسی نشست همکاری انجام نشد. دوباره تلاش کنید.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (loginBusy) return;
    const normalizedPin = normalizeDigits(pin).replace(/\D/g, "").slice(0, 6);
    if (!code.trim() || normalizedPin.length !== 6) {
      setMessage("کد همکاری و رمز ۶ رقمی را کامل وارد کنید.");
      return;
    }
    setLoginBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "login", partnerCode: code, pin: normalizedPin }),
      });
      const data = (await response.json().catch(() => null)) as
        | { partner?: PartnerOverview | null; statusMessage?: string; message?: string }
        | null;
      if (!response.ok || !data?.partner) {
        throw new Error(data?.statusMessage || data?.message || "ورود انجام نشد.");
      }
      setPartner(data.partner);
      setPin("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ورود انجام نشد.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/partner/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
    setPartner(null);
    setMessage("");
  }

  async function lookupTracking(event: FormEvent) {
    event.preventDefault();
    if (lookupBusy) return;
    const normalized = normalizeTrackingCode(trackingCode);
    setTrackingCode(normalized);
    if (!isValidTrackingCode(normalized)) {
      setMessage("کد رهگیری را به شکل HIR-YY-XXXXXXXX وارد کنید.");
      return;
    }
    setLookupBusy(true);
    setLookup(null);
    setMessage("");
    try {
      const response = await fetch("/api/partner/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackingCode: normalized }),
      });
      const data = (await response.json().catch(() => null)) as {
        trackingCode?: string;
        transactionLabel?: string;
        statusLabel?: string;
        status?: string;
        agencyName?: string;
        createdAt?: string;
        approvedAt?: string | null;
        statusMessage?: string;
        message?: string;
      } | null;
      if (!response.ok || !data?.trackingCode) {
        throw new Error(data?.statusMessage || data?.message || "کد رهگیری پیدا نشد.");
      }
      setLookup({
        trackingCode: normalizeTrackingCode(data.trackingCode),
        transactionLabel: data.transactionLabel || "—",
        statusLabel: data.statusLabel || "—",
        status: data.status || "pending",
        agencyName: data.agencyName || "—",
        createdAt: data.createdAt || "",
        approvedAt: data.approvedAt || null,
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "استعلام کد رهگیری انجام نشد.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function submitContract(event: FormEvent) {
    event.preventDefault();
    if (contractBusy) return;
    if (!partner) return;
    if (!contractForm.transactionType) {
      setMessage("نوع قرارداد را انتخاب کنید.");
      return;
    }
    setContractBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "create", ...contractForm }),
      });
      const data = (await response.json().catch(() => null)) as
        | { contract?: PartnerContract | null; statusMessage?: string; message?: string }
        | null;
      if (!response.ok || !data?.contract) {
        throw new Error(data?.statusMessage || data?.message || "ثبت قرارداد انجام نشد.");
      }

      setContractForm({ contractReference: "", clientName: "", transactionType: "sell", note: "" });
      setMessage("قرارداد ثبت شد و برای تأیید هیرمند ارسال شد. بعد از تأیید، یک مهر روی کارت شما می‌نشیند.");
      const refresh = await fetch("/api/partner/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "me" }),
      });
      const refreshed = (await refresh.json().catch(() => null)) as { partner?: PartnerOverview | null } | null;
      if (refresh.ok && refreshed?.partner) setPartner(refreshed.partner);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت قرارداد انجام نشد.");
    } finally {
      setContractBusy(false);
    }
  }

  return (
    <SiteChrome className="partner-portal-shell">
      <main className="partner-portal" id="top">
        <header className="partner-portal-hero">
          <BrandLogo size="soon" />
          <nav className="partner-portal-hero-actions" aria-label="دسترسی سریع">
            <a href="#partner-lookup" className="partner-quick-link">استعلام کد رهگیری</a>
            {!partner ? <a href="#partner-login" className="partner-quick-link is-primary">ورود همکار</a> : <a href="#partner-account" className="partner-quick-link is-primary">حساب من</a>}
          </nav>
          <span className="kicker">باشگاه همکاران هیرمند</span>
          <h1>ثبت قرارداد و کد رهگیری</h1>
          <p>
            هر قرارداد پس از تأیید هیرمند یک مهر روی کارت همکاری شما ثبت می‌کند؛
            هر ۳ مهر، یک ثبت قرارداد رایگان برای شما ایجاد می‌شود.
          </p>
        </header>

        {message ? <div className="partner-alert" role="status" aria-live="polite">{message}</div> : null}

        <section className="partner-portal-grid">
          <section className="partner-portal-card" id="partner-lookup">
            <div className="partner-portal-card-head">
              <div>
                <span className="kicker">استعلام عمومی</span>
                <h2>کد رهگیری قرارداد</h2>
              </div>
              <BadgeCheck size={22} />
            </div>
            <form className="partner-lookup-form" onSubmit={lookupTracking}>
              <label className="field">
                <span>کد رهگیری</span>
                <input
                  value={trackingCode}
                  onChange={(event) => setTrackingCode(normalizeTrackingCode(event.target.value).slice(0, 15))}
                  placeholder="HIR-YY-XXXXXXXX"
                  maxLength={15}
                  autoComplete="off"
                  aria-describedby="tracking-format-hint"
                  dir="ltr"
                />
              </label>
              <div className="partner-lookup-actions">
                <button className="btn-gold" type="submit" disabled={lookupBusy}>
                  {lookupBusy ? <RefreshCw size={16} className="admin-spin" /> : <Ticket size={16} />}
                  استعلام
                </button>
                {(trackingCode || lookup) ? <button type="button" className="btn-ghost" onClick={() => { setTrackingCode(""); setLookup(null); setMessage(""); }}>پاک کردن</button> : null}
              </div>
            </form>
            <p className="partner-field-hint" id="tracking-format-hint">فرمت کد: <b dir="ltr">HIR-YY-XXXXXXXX</b> — حروف و عدد قابل قبول است.</p>
            {lookup ? (
              <div className="partner-lookup-result">
                <div className="partner-lookup-code-row">
                  <div className="partner-lookup-code" dir="ltr">{lookup.trackingCode}</div>
                  <button
                    type="button"
                    className="btn-ghost partner-inline-copy"
                    onClick={() => void copyValue(lookup.trackingCode, "کد رهگیری")}
                  >
                    <Copy size={15} /> کپی
                  </button>
                </div>
                <div><span>وضعیت</span><strong data-status={lookup.status}>{lookup.statusLabel}</strong></div>
                <div><span>نوع قرارداد</span><strong>{lookup.transactionLabel}</strong></div>
                <div><span>املاک همکار</span><strong>{lookup.agencyName}</strong></div>
                <div><span>ثبت شده</span><strong>{faDate(lookup.createdAt)}</strong></div>
                {lookup.approvedAt ? <div><span>تأیید شده</span><strong>{faDate(lookup.approvedAt)}</strong></div> : null}
              </div>
            ) : (
              <p className="partner-muted">کد رهگیری برای مشتری یا طرف قرارداد قابل استعلام است و اطلاعات خصوصی مالی نمایش داده نمی‌شود.</p>
            )}
          </section>

          {!checking && !partner ? (
            <section className="partner-portal-card" id="partner-login">
              <div className="partner-portal-card-head">
                <div>
                  <span className="kicker">ورود همکار</span>
                  <h2>حساب املاک شما</h2>
                </div>
                <LogIn size={22} />
              </div>
              <form className="partner-login-form" onSubmit={login}>
                <label className="field">
                  <span>کد همکاری</span>
                  <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="HR-XXXXXX" dir="ltr" autoCapitalize="characters" />
                </label>
                <label className="field">
                  <span>رمز ۶ رقمی</span>
                  <input value={pin} onChange={(event) => setPin(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 6))} placeholder="••••••" inputMode="numeric" dir="ltr" autoComplete="current-password" />
                </label>
                <button className="btn-gold" type="submit" disabled={loginBusy}>
                  {loginBusy ? <RefreshCw size={16} className="admin-spin" /> : <KeyRound size={16} />}
                  ورود به حساب همکار
                </button>
              </form>
              <p className="partner-muted">کد همکاری و رمز را از مدیریت هیرمند دریافت کنید.</p>
            </section>
          ) : null}

          {partner ? (
            <section className="partner-dashboard partner-portal-card" id="partner-account">
              <div className="partner-dashboard-head">
                <div>
                  <span className="kicker">حساب فعال</span>
                  <h2>{partner.agencyName}</h2>
                  <p>{partner.contactName} · {partner.phone} · <button type="button" className="partner-inline-code" onClick={() => void copyValue(partner.partnerCode, "کد همکاری")} dir="ltr">{partner.partnerCode}</button></p>
                </div>
                <button type="button" className="btn-ghost" onClick={() => void logout()}>
                  <LogOut size={16} /> خروج
                </button>
              </div>

              <StampGrid partner={partner} />

              <div className="partner-digital-access">
                <div>
                  <span className="kicker">کارت دیجیتال</span>
                  <h3>ورود سریع با QR</h3>
                  <p>
                    این QR را می‌توانید روی کارت ویزیت املاک قرار دهید؛ با اسکن آن، صفحه همکاری باز می‌شود و کد املاک از قبل وارد شده است.
                  </p>
                  <a
                    href={partnerPortalUrl(partner.partnerCode)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    <Ticket size={15} /> لینک اختصاصی حساب
                  </a>
                </div>
                <img
                  src={partnerQrImageUrl(partner.partnerCode)}
                  alt={"QR ورود " + partner.agencyName}
                  loading="lazy"
                  width={180}
                  height={180}
                />
              </div>

              <div className="partner-metric-grid">
                <div><span>کل قرارداد تأییدشده</span><strong>{partner.contractCount.toLocaleString("fa-IR")}</strong></div>
                <div><span>پاداش قابل استفاده</span><strong>{partner.availableRewards.toLocaleString("fa-IR")}</strong></div>
                <div><span>در انتظار بررسی</span><strong>{partner.pendingContracts.toLocaleString("fa-IR")}</strong></div>
                <div><span>پاداش کسب‌شده</span><strong>{partner.rewardsEarned.toLocaleString("fa-IR")}</strong></div>
              </div>

              <section className="partner-submit-section">
                <div className="partner-section-head">
                  <div>
                    <span className="kicker">ثبت قرارداد جدید</span>
                    <h3>قرارداد را برای تأیید بفرستید</h3>
                  </div>
                  <Send size={20} />
                </div>
                <form className="partner-submit-form" onSubmit={submitContract} aria-busy={contractBusy}>
                  <label className="field">
                    <span>نوع قرارداد</span>
                    <select value={contractForm.transactionType} onChange={(event) => setContractForm({ ...contractForm, transactionType: event.target.value })}>
                      <option value="sell">فروش</option>
                      <option value="buy">درخواست خرید</option>
                      <option value="rent">اجاره</option>
                      <option value="mortgage">رهن</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>شناسه/شماره قرارداد</span>
                    <input value={contractForm.contractReference} onChange={(event) => setContractForm({ ...contractForm, contractReference: event.target.value })} placeholder="اختیاری، برای جلوگیری از ثبت تکراری" />
                  </label>
                  <label className="field">
                    <span>نام مشتری</span>
                    <input value={contractForm.clientName} onChange={(event) => setContractForm({ ...contractForm, clientName: event.target.value })} />
                  </label>
                  <label className="field admin-span-2">
                    <span>یادداشت</span>
                    <textarea value={contractForm.note} onChange={(event) => setContractForm({ ...contractForm, note: event.target.value })} rows={3} placeholder="توضیح کوتاه درباره قرارداد..." />
                  </label>
                  <div className="partner-submit-actions admin-span-2">
                    <button className="btn-gold" type="submit" disabled={contractBusy || partner.cardComplete}>
                      {contractBusy ? <RefreshCw size={16} className="admin-spin" /> : <Send size={16} />}
                      ارسال برای تأیید
                    </button>
                    {partner.cardComplete ? <span>کارت فعلی ۱۲ مهر دارد؛ برای ادامه کارت جدید لازم است.</span> : null}
                  </div>
                </form>
              </section>

              <section className="partner-history-section">
                <div className="partner-section-head">
                  <div><span className="kicker">سوابق</span><h3>آخرین قراردادها</h3></div>
                  <History size={20} />
                </div>
                {partner.contracts.length === 0 ? (
                  <div className="partner-empty"><History size={25} /><strong>هنوز قراردادی ثبت نشده</strong><span>اولین قرارداد را از فرم بالا ارسال کنید.</span></div>
                ) : (
                  <div className="partner-contract-list">
                    {partner.contracts.map((contract) => <ContractRow key={contract.id} contract={contract} />)}
                  </div>
                )}
              </section>
            </section>
          ) : null}
        </section>

        <section className="partner-how">
          <div><Check size={16} /> ثبت قرارداد توسط همکار</div>
          <div><BadgeCheck size={16} /> تأیید توسط هیرمند</div>
          <div><Gift size={16} /> ثبت یک مهر</div>
          <div><strong>۳ مهر</strong> <span>یک ثبت رایگان</span></div>
          <div><Copy size={16} /> کد رهگیری برای پیگیری</div>
        </section>

        <footer className="partner-portal-footer">
          <span>{SITE.nameFa}</span>
          <Link to="/">بازگشت به سایت</Link>
        </footer>
      </main>
    </SiteChrome>
  );
}
