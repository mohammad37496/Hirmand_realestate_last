import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Copy, Home, RefreshCw, Search, UserRound } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { CustomerConversation } from "@/components/hirmand/customer-conversation";
import { SITE } from "@/lib/site";
import { rememberCustomerTrackingCode } from "@/lib/customer-tracking";
import "@/request-tracking.css";

type TrackingResult = {
  trackingCode: string;
  status: string;
  statusLabel: string;
  visitStatus: string;
  visitStatusLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
  consultant: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  visitRequestedAt?: string | null;
  visitPreferredAt: string | null;
  callbackPreferredAt?: string | null;
  offerAmount?: number | null;
  offerConditions?: string;
  customerPropertySubmissionStatus?: "pending" | "approved" | "rejected" | null;
  customerPropertySubmissionReviewNote?: string;
  timeline?: Array<{ type: "created" | "status" | "visit"; label: string; note: string; at: string | null }>;
  property: { title: string; slug: string } | null;
};

function faDate(value: string | null) {
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

function statusStep(status: string) {
  const steps = ["new", "contacted", "follow_up", "visited", "contract"];
  const index = steps.indexOf(status);
  return index >= 0 ? index : status === "closed" ? 4 : 0;
}

export const Route = createFileRoute("/request-tracking")({
  component: RequestTrackingPage,
});

function RequestTrackingPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackInterest, setFeedbackInterest] = useState<"interested" | "unsure" | "not_interested">("unsure");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  async function lookup(value = code) {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(normalized)) {
      setMessage("کد رهگیری را به شکل HIR-26-XXXXXXXXXXXX وارد کنید.");
      setResult(null);
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/public-lead-tracking?code=" + encodeURIComponent(normalized), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = (await response.json().catch(() => null)) as TrackingResult & { statusMessage?: string } | null;
      if (!response.ok || !data?.trackingCode) {
        throw new Error(data?.statusMessage || "درخواستی با این کد پیدا نشد.");
      }
      setResult(data);
      setCode(data.trackingCode);
      rememberCustomerTrackingCode(data.trackingCode);
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : "پیگیری درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefilled = params.get("code");
    if (prefilled) {
      setCode(prefilled);
      void lookup(prefilled);
    }
  }, []);

  function toIsoVisitTime(value: string) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() < Date.now() + 30 * 60 * 1000) return null;
    return parsed.toISOString();
  }

  async function postTrackingAction(body: Record<string, unknown>) {
    const response = await fetch("/api/public-lead-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { success?: boolean; message?: string; statusMessage?: string } | null;
    if (!response.ok || !data?.success) {
      throw new Error(data?.statusMessage || data?.message || "عملیات انجام نشد.");
    }
    return data;
  }

  async function rescheduleVisit() {
    const iso = toIsoVisitTime(rescheduleAt);
    if (!result || !iso) {
      setMessage("زمان جدید بازدید باید معتبر و حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد.");
      return;
    }
    setActionBusy(true);
    try {
      const data = await postTrackingAction({ action: "reschedule", code: result.trackingCode, visitPreferredAt: iso });
      setMessage(data.message || "زمان بازدید تغییر کرد.");
      setRescheduleAt("");
      await lookup(result.trackingCode);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تغییر زمان بازدید انجام نشد.");
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelVisit() {
    if (!result) return;
    setActionBusy(true);
    try {
      const data = await postTrackingAction({ action: "cancel", code: result.trackingCode });
      setMessage(data.message || "بازدید لغو شد.");
      await lookup(result.trackingCode);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "لغو بازدید انجام نشد.");
    } finally {
      setActionBusy(false);
    }
  }

  async function submitFeedback() {
    if (!result || result.visitStatus !== "completed") return;
    setActionBusy(true);
    try {
      const data = await postTrackingAction({
        action: "feedback",
        code: result.trackingCode,
        rating: feedbackRating,
        interest: feedbackInterest,
        note: feedbackNote,
      });
      setFeedbackSubmitted(true);
      setMessage(data.message || "بازخورد ثبت شد.");
      setFeedbackNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت بازخورد انجام نشد.");
    } finally {
      setActionBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("کد رهگیری کپی شد.");
    } catch {
      setMessage("کپی کد در این مرورگر در دسترس نیست.");
    }
  }

  const currentStep = result ? statusStep(result.status) : 0;

  return (
    <SiteChrome>
      <main className="request-tracking-page">
        <section className="request-tracking-hero">
          <div>
            <span className="kicker">پیگیری مشتری</span>
            <h1>وضعیت درخواستتان را آنلاین ببینید.</h1>
            <p>
              کدی را که هنگام ثبت درخواست از هیرمند دریافت کرده‌اید وارد کنید.
              بدون ورود به حساب کاربری، فقط اطلاعات مربوط به همین درخواست نمایش داده می‌شود.
            </p>
          </div>
          <div className="request-tracking-emblem" aria-hidden="true">
            <Clock3 size={46} strokeWidth={1.4} />
          </div>
        </section>

        <section className="request-tracking-card">
          <form
            className="request-tracking-form"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup();
            }}
          >
            <label className="field">
              <span>کد رهگیری</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="HIR-26-XXXXXXXXXXXX"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            <button className="btn-gold" type="submit" disabled={busy}>
              {busy ? <RefreshCw size={17} className="request-tracking-spin" /> : <Search size={17} />}
              {busy ? "در حال بررسی…" : "پیگیری درخواست"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => void copyCode()} disabled={!code.trim()}>
              <Copy size={16} />
              کپی کد
            </button>
          </form>

          {message ? <p className="request-tracking-message" role="alert">{message}</p> : null}

          {result ? (
            <div className="request-tracking-result">
              <div className="request-tracking-success-head">
                <div className="request-tracking-success-icon"><CheckCircle2 size={24} /></div>
                <div>
                  <span className="kicker">درخواست پیدا شد</span>
                  <h2>{result.statusLabel}</h2>
                  <p>آخرین بروزرسانی: {faDate(result.updatedAt || result.createdAt)}</p>
                </div>
              </div>

              <div className="request-tracking-progress" aria-label="مراحل پیگیری">
                {[
                  ["new", "ثبت درخواست"],
                  ["contacted", "تماس"],
                  ["follow_up", "پیگیری"],
                  ["visited", "بازدید"],
                  ["contract", "قرارداد"],
                ].map(([key, label], index) => (
                  <div key={key} className={"request-track-step" + (index <= currentStep ? " is-active" : "")}>
                    <span>{index + 1}</span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>

              <div className="request-tracking-facts">
                <div><UserRound size={17} /><span>مشاور</span><strong>{result.consultant || "در حال تخصیص"}</strong></div>
                <div><Home size={17} /><span>نوع درخواست</span><strong>{result.deal || result.propertyType || "درخواست ملکی"}</strong></div>
                <div><span>محله</span><strong>{result.neighborhood || "ثبت نشده"}</strong></div>
                <div><CalendarDays size={17} /><span>ثبت درخواست</span><strong>{faDate(result.createdAt)}</strong></div>
              </div>

              {result.property ? (
                <div className="request-tracking-property">
                  <div>
                    <span className="kicker">فایل مرتبط</span>
                    <h3>{result.property.title}</h3>
                    <p>{result.neighborhood}</p>
                  </div>
                  {result.property.slug ? (
                    <Link className="btn-ghost" to="/properties/$slug" params={{ slug: result.property.slug }}>
                      مشاهده فایل
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {result.callbackPreferredAt ? (
                <div className="request-tracking-notice">
                  زمان تماس پیشنهادی: <strong>{new Date(result.callbackPreferredAt).toLocaleString("fa-IR")}</strong>
                </div>
              ) : null}
              {result.offerAmount ? (
                <div className="request-tracking-notice">
                  پیشنهاد قیمت ثبت‌شده: <strong>{Number(result.offerAmount).toLocaleString("fa-IR")} تومان</strong>
                  {result.offerConditions ? <span> · {result.offerConditions}</span> : null}
                </div>
              ) : null}
              {result.customerPropertySubmissionStatus === "rejected" ? (
                <div className="request-tracking-revision">
                  <div>
                    <span className="kicker">نیازمند اصلاح</span>
                    <h3>اطلاعات ملک نیاز به اصلاح دارد.</h3>
                    <p>{result.customerPropertySubmissionReviewNote || "مواردی که کارشناس اعلام کرده را اصلاح کنید و دوباره ارسال کنید."}</p>
                  </div>
                  <a className="btn-gold" href={"/submit-property?code=" + encodeURIComponent(result.trackingCode)}>
                    اصلاح و ارسال مجدد
                  </a>
                </div>
              ) : null}

              {result.timeline?.length ? (
                <div className="request-tracking-timeline">
                  <div className="request-tracking-timeline-head">
                    <div><span className="kicker">تاریخچه درخواست</span><h3>آخرین رویدادها</h3></div>
                    <span>تا ۶ رویداد اخیر</span>
                  </div>
                  <div className="request-tracking-timeline-list">
                    {result.timeline.slice(-6).reverse().map((event, index) => (
                      <div className="request-tracking-timeline-item" key={event.type + "-" + (event.at || "na") + "-" + index}>
                        <span className="request-tracking-timeline-dot" aria-hidden="true">
                          {event.type === "visit" ? <CalendarDays size={13} /> : <CheckCircle2 size={13} />}
                        </span>
                        <div>
                          <strong>{event.label}</strong>
                          <p>{event.note}</p>
                          <time>{faDate(event.at)}</time>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <CustomerConversation code={result.trackingCode} customerName="" />

              {result.visitStatus !== "none" ? (
                <div className="request-tracking-visit">
                  <div>
                    <span className="kicker">بازدید</span>
                    <strong>{result.visitStatusLabel}</strong>
                  </div>
                  <div>
                    <span>زمان پیشنهادی</span>
                    <strong>{faDate(result.visitPreferredAt)}</strong>
                  </div>
                  {result.visitStatus === "requested" || result.visitStatus === "confirmed" ? (
                    <div className="request-tracking-visit-actions">
                      <label className="field">
                        <span>زمان جدید</span>
                        <input
                          type="datetime-local"
                          value={rescheduleAt}
                          onChange={(event) => setRescheduleAt(event.target.value)}
                          disabled={actionBusy}
                        />
                      </label>
                      <div className="request-tracking-action-row">
                        <button type="button" className="btn-gold" onClick={() => void rescheduleVisit()} disabled={actionBusy || !rescheduleAt}>
                          تغییر زمان بازدید
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void cancelVisit()}
                          disabled={actionBusy}
                        >
                          لغو بازدید
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {result.visitStatus === "completed" ? (
                <div className="request-tracking-feedback">
                  {feedbackSubmitted ? (
                    <div className="request-tracking-feedback-success">
                      <CheckCircle2 size={20} />
                      <strong>بازخورد شما ثبت شد. از همراهی‌تان ممنونیم.</strong>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="kicker">تجربه بازدید</span>
                        <h3>بازدید چطور بود؟</h3>
                        <p>امتیاز و نظر شما فقط برای بهبود خدمات هیرمند ثبت می‌شود.</p>
                      </div>
                      <div className="request-tracking-rating" role="radiogroup" aria-label="امتیاز بازدید">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={value <= feedbackRating ? "is-active" : ""}
                            onClick={() => setFeedbackRating(value)}
                            aria-label={value.toLocaleString("fa-IR") + " از ۵"}
                            aria-pressed={value === feedbackRating}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <label className="field">
                        <span>میزان علاقه شما</span>
                        <select value={feedbackInterest} onChange={(event) => setFeedbackInterest(event.target.value as typeof feedbackInterest)} disabled={actionBusy}>
                          <option value="interested">برای این ملک علاقه‌مندم</option>
                          <option value="unsure">هنوز مطمئن نیستم</option>
                          <option value="not_interested">مناسب من نبود</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>نظر یا نکته (اختیاری)</span>
                        <textarea rows={3} maxLength={1000} value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} disabled={actionBusy} />
                      </label>
                      <button type="button" className="btn-gold" onClick={() => void submitFeedback()} disabled={actionBusy}>
                        {actionBusy ? "در حال ثبت…" : "ثبت بازخورد"}
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="request-tracking-code">
                <span>کد رهگیری شما</span>
                <strong dir="ltr">{result.trackingCode}</strong>
                <Link className="request-tracking-code-link" to="/my-hirmand">مشاهده همه پرونده‌های من</Link>
              </div>
            </div>
          ) : (
            <div className="request-tracking-empty">
              <span className="request-tracking-empty-icon"><Search size={22} /></span>
              <h2>هنوز کدی وارد نشده است.</h2>
              <p>کد رهگیری را وارد کنید تا وضعیت درخواست، مشاور مسئول و در صورت وجود، زمان بازدید را ببینید.</p>
            </div>
          )}
        </section>

        <section className="request-tracking-note">
          <strong>نکته امنیتی</strong>
          <p>نام، شماره موبایل، توضیحات خصوصی و سایر اطلاعات حساس شما در این صفحه نمایش داده نمی‌شود.</p>
          <Link to="/">بازگشت به صفحه اصلی {SITE.shortName}</Link>
        </section>
      </main>
    </SiteChrome>
  );
}
