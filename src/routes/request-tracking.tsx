import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Copy, Home, RefreshCw, Search, UserRound } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { CustomerConversation } from "@/components/hirmand/customer-conversation";
import { SITE } from "@/lib/site";
import { rememberCustomerTrackingCode } from "@/lib/customer-tracking";
import { compareDecimalStrings } from "@/lib/decimal-money";
import { formatTomanExact } from "@/lib/money";
import { isValidPublicTrackingToken, TRACKING_TOKEN_MAX_LENGTH } from "@/lib/tracking-token";
import { isDuplicatePublicVisitFeedbackConflict } from "@/lib/public-visit-feedback";
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
  offerAmount?: string | null;
  offerConditions?: string;
  feedbackSubmitted?: boolean;
  customerPropertySubmissionStatus?: "pending" | "approved" | "rejected" | null;
  customerPropertySubmissionReviewNote?: string;
  timeline?: Array<{ type: "created" | "status" | "visit"; label: string; note: string; at: string | null }>;
  property: { title: string; slug: string } | null;
};

function faDate(value: string | null) {
  if (!value) return "â€”";
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

class TrackingActionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "TrackingActionError";
  }
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
    if (!isValidPublicTrackingToken(normalized)) {
      setMessage("Ú©Ø¯ Ø±Ù‡Ú¯ÛŒØ±ÛŒ ÙˆØ§Ø±Ø¯Ø´Ø¯Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.");
      setResult(null);
      setFeedbackSubmitted(false);
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
        throw new Error(data?.statusMessage || "Ø¯Ø±Ø®ÙˆØ§Ø³ØªÛŒ Ø¨Ø§ Ø§ÛŒÙ† Ú©Ø¯ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯.");
      }
      setResult(data);
      setCode(data.trackingCode);
      setFeedbackSubmitted(data.feedbackSubmitted === true);
      rememberCustomerTrackingCode(data.trackingCode);
    } catch (error) {
      setResult(null);
      setFeedbackSubmitted(false);
      setMessage(error instanceof Error ? error.message : "Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯.");
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
      throw new TrackingActionError(response.status, data?.statusMessage || data?.message || "Ø¹Ù…Ù„ÛŒØ§Øª Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯.");
    }
    return data;
  }

  async function rescheduleVisit() {
    const iso = toIsoVisitTime(rescheduleAt);
    if (!result || !iso) {
      setMessage("Ø²Ù…Ø§Ù† Ø¬Ø¯ÛŒØ¯ Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ø¨Ø§ÛŒØ¯ Ù…Ø¹ØªØ¨Ø± Ùˆ Ø­Ø¯Ø§Ù‚Ù„ Û³Û° Ø¯Ù‚ÛŒÙ‚Ù‡ Ø§Ø² Ø§Ú©Ù†ÙˆÙ† ÙØ§ØµÙ„Ù‡ Ø¯Ø§Ø´ØªÙ‡ Ø¨Ø§Ø´Ø¯.");
      return;
    }
    setActionBusy(true);
    try {
      const data = await postTrackingAction({ action: "reschedule", code: result.trackingCode, visitPreferredAt: iso });
      setMessage(data.message || "Ø²Ù…Ø§Ù† Ø¨Ø§Ø²Ø¯ÛŒØ¯ ØªØºÛŒÛŒØ± Ú©Ø±Ø¯.");
      setRescheduleAt("");
      await lookup(result.trackingCode);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ØªØºÛŒÛŒØ± Ø²Ù…Ø§Ù† Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯.");
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelVisit() {
    if (!result) return;
    setActionBusy(true);
    try {
      const data = await postTrackingAction({ action: "cancel", code: result.trackingCode });
      setMessage(data.message || "Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ù„ØºÙˆ Ø´Ø¯.");
      await lookup(result.trackingCode);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ù„ØºÙˆ Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯.");
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
      setMessage(data.message || "Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ø«Ø¨Øª Ø´Ø¯.");
      setFeedbackNote("");
    } catch (error) {
      if (error instanceof TrackingActionError && isDuplicatePublicVisitFeedbackConflict(error.status, error.message)) {
        setFeedbackSubmitted(true);
        setFeedbackNote("");
        setMessage("Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ø§ÛŒÙ† Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ù‚Ø¨Ù„Ø§Ù‹ Ø«Ø¨Øª Ø´Ø¯Ù‡ Ø§Ø³Øª.");
      } else {
        setMessage(error instanceof Error ? error.message : "Ø«Ø¨Øª Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯.");
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Ú©Ø¯ Ø±Ù‡Ú¯ÛŒØ±ÛŒ Ú©Ù¾ÛŒ Ø´Ø¯.");
    } catch {
      setMessage("Ú©Ù¾ÛŒ Ú©Ø¯ Ø¯Ø± Ø§ÛŒÙ† Ù…Ø±ÙˆØ±Ú¯Ø± Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª.");
    }
  }

  const currentStep = result ? statusStep(result.status) : 0;

  return (
    <SiteChrome>
      <main className="request-tracking-page">
        <section className="request-tracking-hero">
          <div>
            <span className="kicker">Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ù…Ø´ØªØ±ÛŒ</span>
            <h1>ÙˆØ¶Ø¹ÛŒØª Ø¯Ø±Ø®ÙˆØ§Ø³ØªØªØ§Ù† Ø±Ø§ Ø¢Ù†Ù„Ø§ÛŒÙ† Ø¨Ø¨ÛŒÙ†ÛŒØ¯.</h1>
            <p>
              Ú©Ø¯ÛŒ Ø±Ø§ Ú©Ù‡ Ù‡Ù†Ú¯Ø§Ù… Ø«Ø¨Øª Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø§Ø² Ù‡ÛŒØ±Ù…Ù†Ø¯ Ø¯Ø±ÛŒØ§ÙØª Ú©Ø±Ø¯Ù‡â€ŒØ§ÛŒØ¯ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.
              Ø¨Ø¯ÙˆÙ† ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒØŒ ÙÙ‚Ø· Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø±Ø¨ÙˆØ· Ø¨Ù‡ Ù‡Ù…ÛŒÙ† Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.
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
              <span>Ú©Ø¯ Ø±Ù‡Ú¯ÛŒØ±ÛŒ</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="HIR-26-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                maxLength={TRACKING_TOKEN_MAX_LENGTH}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            <button className="btn-gold" type="submit" disabled={busy}>
              {busy ? <RefreshCw size={17} className="request-tracking-spin" /> : <Search size={17} />}
              {busy ? "Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒâ€¦" : "Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ø¯Ø±Ø®ÙˆØ§Ø³Øª"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => void copyCode()} disabled={!code.trim()}>
              <Copy size={16} />
              Ú©Ù¾ÛŒ Ú©Ø¯
            </button>
          </form>

          {message ? <p className="request-tracking-message" role="alert">{message}</p> : null}

          {result ? (
            <div className="request-tracking-result">
              <div className="request-tracking-success-head">
                <div className="request-tracking-success-icon"><CheckCircle2 size={24} /></div>
                <div>
                  <span className="kicker">Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù¾ÛŒØ¯Ø§ Ø´Ø¯</span>
                  <h2>{result.statusLabel}</h2>
                  <p>Ø¢Ø®Ø±ÛŒÙ† Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ: {faDate(result.updatedAt || result.createdAt)}</p>
                </div>
              </div>

              <div className="request-tracking-progress" aria-label="Ù…Ø±Ø§Ø­Ù„ Ù¾ÛŒÚ¯ÛŒØ±ÛŒ">
                {[
                  ["new", "Ø«Ø¨Øª Ø¯Ø±Ø®ÙˆØ§Ø³Øª"],
                  ["contacted", "ØªÙ…Ø§Ø³"],
                  ["follow_up", "Ù¾ÛŒÚ¯ÛŒØ±ÛŒ"],
                  ["visited", "Ø¨Ø§Ø²Ø¯ÛŒØ¯"],
                  ["contract", "Ù‚Ø±Ø§Ø±Ø¯Ø§Ø¯"],
                ].map(([key, label], index) => (
                  <div key={key} className={"request-track-step" + (index <= currentStep ? " is-active" : "")}>
                    <span>{index + 1}</span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>

              <div className="request-tracking-facts">
                <div><UserRound size={17} /><span>Ù…Ø´Ø§ÙˆØ±</span><strong>{result.consultant || "Ø¯Ø± Ø­Ø§Ù„ ØªØ®ØµÛŒØµ"}</strong></div>
                <div><Home size={17} /><span>Ù†ÙˆØ¹ Ø¯Ø±Ø®ÙˆØ§Ø³Øª</span><strong>{result.deal || result.propertyType || "Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù…Ù„Ú©ÛŒ"}</strong></div>
                <div><span>Ù…Ø­Ù„Ù‡</span><strong>{result.neighborhood || "Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡"}</strong></div>
                <div><CalendarDays size={17} /><span>Ø«Ø¨Øª Ø¯Ø±Ø®ÙˆØ§Ø³Øª</span><strong>{faDate(result.createdAt)}</strong></div>
              </div>

              {result.property ? (
                <div className="request-tracking-property">
                  <div>
                    <span className="kicker">ÙØ§ÛŒÙ„ Ù…Ø±ØªØ¨Ø·</span>
                    <h3>{result.property.title}</h3>
                    <p>{result.neighborhood}</p>
                  </div>
                  {result.property.slug ? (
                    <Link className="btn-ghost" to="/properties/$slug" params={{ slug: result.property.slug }}>
                      Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙØ§ÛŒÙ„
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {result.callbackPreferredAt ? (
                <div className="request-tracking-notice">
                  Ø²Ù…Ø§Ù† ØªÙ…Ø§Ø³ Ù¾ÛŒØ´Ù†Ù‡Ø§Ø¯ÛŒ: <strong>{new Date(result.callbackPreferredAt).toLocaleString("fa-IR")}</strong>
                </div>
              ) : null}
              {result.offerAmount != null && compareDecimalStrings(result.offerAmount, "0") > 0 ? (
                <div className="request-tracking-notice">
                  Ù¾ÛŒØ´Ù†Ù‡Ø§Ø¯ Ù‚ÛŒÙ…Øª Ø«Ø¨Øªâ€ŒØ´Ø¯Ù‡: <strong>{formatTomanExact(result.offerAmount)}</strong>
                  {result.offerConditions ? <span> Â· {result.offerConditions}</span> : null}
                </div>
              ) : null}
              {result.customerPropertySubmissionStatus === "rejected" ? (
                <div className="request-tracking-revision">
                  <div>
                    <span className="kicker">Ù†ÛŒØ§Ø²Ù…Ù†Ø¯ Ø§ØµÙ„Ø§Ø­</span>
                    <h3>Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ù„Ú© Ù†ÛŒØ§Ø² Ø¨Ù‡ Ø§ØµÙ„Ø§Ø­ Ø¯Ø§Ø±Ø¯.</h3>
                    <p>{result.customerPropertySubmissionReviewNote || "Ù…ÙˆØ§Ø±Ø¯ÛŒ Ú©Ù‡ Ú©Ø§Ø±Ø´Ù†Ø§Ø³ Ø§Ø¹Ù„Ø§Ù… Ú©Ø±Ø¯Ù‡ Ø±Ø§ Ø§ØµÙ„Ø§Ø­ Ú©Ù†ÛŒØ¯ Ùˆ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø§Ø±Ø³Ø§Ù„ Ú©Ù†ÛŒØ¯."}</p>
                  </div>
                  <a className="btn-gold" href={"/submit-property?code=" + encodeURIComponent(result.trackingCode)}>
                    Ø§ØµÙ„Ø§Ø­ Ùˆ Ø§Ø±Ø³Ø§Ù„ Ù…Ø¬Ø¯Ø¯
                  </a>
                </div>
              ) : null}

              {result.timeline?.length ? (
                <div className="request-tracking-timeline">
                  <div className="request-tracking-timeline-head">
                    <div><span className="kicker">ØªØ§Ø±ÛŒØ®Ú†Ù‡ Ø¯Ø±Ø®ÙˆØ§Ø³Øª</span><h3>Ø¢Ø®Ø±ÛŒÙ† Ø±ÙˆÛŒØ¯Ø§Ø¯Ù‡Ø§</h3></div>
                    <span>ØªØ§ Û¶ Ø±ÙˆÛŒØ¯Ø§Ø¯ Ø§Ø®ÛŒØ±</span>
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
                    <span className="kicker">Ø¨Ø§Ø²Ø¯ÛŒØ¯</span>
                    <strong>{result.visitStatusLabel}</strong>
                  </div>
                  <div>
                    <span>Ø²Ù…Ø§Ù† Ù¾ÛŒØ´Ù†Ù‡Ø§Ø¯ÛŒ</span>
                    <strong>{faDate(result.visitPreferredAt)}</strong>
                  </div>
                  {result.visitStatus === "requested" || result.visitStatus === "confirmed" ? (
                    <div className="request-tracking-visit-actions">
                      <label className="field">
                        <span>Ø²Ù…Ø§Ù† Ø¬Ø¯ÛŒØ¯</span>
                        <input
                          type="datetime-local"
                          value={rescheduleAt}
                          onChange={(event) => setRescheduleAt(event.target.value)}
                          disabled={actionBusy}
                        />
                      </label>
                      <div className="request-tracking-action-row">
                        <button type="button" className="btn-gold" onClick={() => void rescheduleVisit()} disabled={actionBusy || !rescheduleAt}>
                          ØªØºÛŒÛŒØ± Ø²Ù…Ø§Ù† Ø¨Ø§Ø²Ø¯ÛŒØ¯
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void cancelVisit()}
                          disabled={actionBusy}
                        >
                          Ù„ØºÙˆ Ø¨Ø§Ø²Ø¯ÛŒØ¯
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
                      <strong>Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ø«Ø¨Øª Ø´Ø¯Ù‡ Ø§Ø³Øª. Ø§Ø² Ù‡Ù…Ø±Ø§Ù‡ÛŒâ€ŒØªØ§Ù† Ù…Ù…Ù†ÙˆÙ†ÛŒÙ….</strong>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="kicker">ØªØ¬Ø±Ø¨Ù‡ Ø¨Ø§Ø²Ø¯ÛŒØ¯</span>
                        <h3>Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ú†Ø·ÙˆØ± Ø¨ÙˆØ¯ØŸ</h3>
                        <p>Ø§Ù…ØªÛŒØ§Ø² Ùˆ Ù†Ø¸Ø± Ø´Ù…Ø§ ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ø¨Ù‡Ø¨ÙˆØ¯ Ø®Ø¯Ù…Ø§Øª Ù‡ÛŒØ±Ù…Ù†Ø¯ Ø«Ø¨Øª Ù…ÛŒâ€ŒØ´ÙˆØ¯.</p>
                      </div>
                      <div className="request-tracking-rating" role="radiogroup" aria-label="Ø§Ù…ØªÛŒØ§Ø² Ø¨Ø§Ø²Ø¯ÛŒØ¯">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={value <= feedbackRating ? "is-active" : ""}
                            onClick={() => setFeedbackRating(value)}
                            aria-label={value.toLocaleString("fa-IR") + " Ø§Ø² Ûµ"}
                            aria-pressed={value === feedbackRating}
                          >
                            â˜…
                          </button>
                        ))}
                      </div>
                      <label className="field">
                        <span>Ù…ÛŒØ²Ø§Ù† Ø¹Ù„Ø§Ù‚Ù‡ Ø´Ù…Ø§</span>
                        <select value={feedbackInterest} onChange={(event) => setFeedbackInterest(event.target.value as typeof feedbackInterest)} disabled={actionBusy}>
                          <option value="interested">Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† Ù…Ù„Ú© Ø¹Ù„Ø§Ù‚Ù‡â€ŒÙ…Ù†Ø¯Ù…</option>
                          <option value="unsure">Ù‡Ù†ÙˆØ² Ù…Ø·Ù…Ø¦Ù† Ù†ÛŒØ³ØªÙ…</option>
                          <option value="not_interested">Ù…Ù†Ø§Ø³Ø¨ Ù…Ù† Ù†Ø¨ÙˆØ¯</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Ù†Ø¸Ø± ÛŒØ§ Ù†Ú©ØªÙ‡ (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)</span>
                        <textarea rows={3} maxLength={1000} value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} disabled={actionBusy} />
                      </label>
                      <button type="button" className="btn-gold" onClick={() => void submitFeedback()} disabled={actionBusy}>
                        {actionBusy ? "Ø¯Ø± Ø­Ø§Ù„ Ø«Ø¨Øªâ€¦" : "Ø«Ø¨Øª Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯"}
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="request-tracking-code">
                <span>Ú©Ø¯ Ø±Ù‡Ú¯ÛŒØ±ÛŒ Ø´Ù…Ø§</span>
                <strong dir="ltr">{result.trackingCode}</strong>
                <Link className="request-tracking-code-link" to="/my-hirmand">Ù…Ø´Ø§Ù‡Ø¯Ù‡ Ù‡Ù…Ù‡ Ù¾Ø±ÙˆÙ†Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ù…Ù†</Link>
              </div>
            </div>
          ) : (
            <div className="request-tracking-empty">
              <span className="request-tracking-empty-icon"><Search size={22} /></span>
              <h2>Ù‡Ù†ÙˆØ² Ú©Ø¯ÛŒ ÙˆØ§Ø±Ø¯ Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª.</h2>
              <p>Ú©Ø¯ Ø±Ù‡Ú¯ÛŒØ±ÛŒ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯ ØªØ§ ÙˆØ¶Ø¹ÛŒØª Ø¯Ø±Ø®ÙˆØ§Ø³ØªØŒ Ù…Ø´Ø§ÙˆØ± Ù…Ø³Ø¦ÙˆÙ„ Ùˆ Ø¯Ø± ØµÙˆØ±Øª ÙˆØ¬ÙˆØ¯ØŒ Ø²Ù…Ø§Ù† Ø¨Ø§Ø²Ø¯ÛŒØ¯ Ø±Ø§ Ø¨Ø¨ÛŒÙ†ÛŒØ¯.</p>
            </div>
          )}
        </section>

        <section className="request-tracking-note">
          <strong>Ù†Ú©ØªÙ‡ Ø§Ù…Ù†ÛŒØªÛŒ</strong>
          <p>Ù†Ø§Ù…ØŒ Ø´Ù…Ø§Ø±Ù‡ Ù…ÙˆØ¨Ø§ÛŒÙ„ØŒ ØªÙˆØ¶ÛŒØ­Ø§Øª Ø®ØµÙˆØµÛŒ Ùˆ Ø³Ø§ÛŒØ± Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø­Ø³Ø§Ø³ Ø´Ù…Ø§ Ø¯Ø± Ø§ÛŒÙ† ØµÙØ­Ù‡ Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.</p>
          <Link to="/">Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ ØµÙØ­Ù‡ Ø§ØµÙ„ÛŒ {SITE.shortName}</Link>
        </section>
      </main>
    </SiteChrome>
  );
}
