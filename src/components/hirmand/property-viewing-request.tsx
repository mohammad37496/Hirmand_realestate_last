import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Download, ExternalLink, X } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { formatPersianDate } from "@/lib/persian-date";
import { PersianDatePicker } from "./persian-date-picker";
import type { PropertyAvailabilityStatus } from "@/lib/properties";
import "@/property-viewing-request.css";

type PropertyViewingRequestProps = {
  property: {
    id: string;
    slug: string;
    title: string;
    neighborhood: string;
    availabilityStatus: PropertyAvailabilityStatus;
  };
};

const AVAILABILITY_LABEL: Record<PropertyAvailabilityStatus, string> = {
  available: "موجود",
  reserved: "رزرو موقت",
  sold: "فروخته‌شده",
  rented: "اجاره‌داده‌شده",
  unavailable: "فعلاً ناموجود",
};

const TIMES = Array.from({ length: 23 }, (_, index) => {
  const minutes = 9 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}).filter((time) => time <= "20:00");

function faDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function toIranIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+03:30`).toISOString();
}

function calendarUtcStamp(date: string, time: string) {
  return toIranIso(date, time).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function createViewingIcs(
  property: PropertyViewingRequestProps["property"],
  date: string,
  time: string,
  trackingToken: string,
) {
  const start = toIranIso(date, time);
  const end = new Date(new Date(start).getTime() + 45 * 60 * 1000).toISOString();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hirmand Real Estate//Viewing//FA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:hirmand-viewing-${property.id}-${date}-${time.replace(":", "")}@hirmandrealestate.ir`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${calendarUtcStamp(date, time)}`,
    `DTEND:${end.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `SUMMARY:${escapeIcs("بازدید ملک هیرمند | " + property.title)}`,
    `LOCATION:${escapeIcs(property.neighborhood + "، اصفهان")}`,
    `DESCRIPTION:${escapeIcs(
      "قرار پیشنهادی بازدید از فایل " +
        property.title +
        " در هیرمند\\nکد رهگیری: " +
        (trackingToken || "—") +
        "\\nاین زمان پیشنهادی است و هماهنگی نهایی با مشاور انجام می‌شود.",
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

function downloadViewingCalendar(
  property: PropertyViewingRequestProps["property"],
  date: string,
  time: string,
  trackingToken: string,
) {
  const ics = createViewingIcs(property, date, time, trackingToken);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hirmand-viewing-${property.slug || property.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function googleCalendarUrl(
  property: PropertyViewingRequestProps["property"],
  date: string,
  time: string,
  trackingToken: string,
) {
  const start = calendarUtcStamp(date, time);
  const endIso = new Date(new Date(toIranIso(date, time)).getTime() + 45 * 60 * 1000).toISOString();
  const end = endIso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `بازدید ملک هیرمند | ${property.title}`,
    dates: `${start}/${end}`,
    location: `${property.neighborhood}، اصفهان`,
    details: `قرار پیشنهادی بازدید از فایل ${property.title}.\\nکد رهگیری: ${trackingToken || "—"}\\nاین زمان پیشنهادی است و هماهنگی نهایی با مشاور انجام می‌شود.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function PropertyViewingRequest({ property }: PropertyViewingRequestProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const visitAllowed = property.availabilityStatus === "available" || property.availabilityStatus === "reserved";
  const minimumDate = useMemo(() => todayIsoDate(), []);

  useEffect(() => {
    if (!open || !date || !property.id) return;
    let cancelled = false;
    setLoadingSlots(true);
    void fetch("/api/property-viewing-slots?propertyId=" + encodeURIComponent(property.id) + "&date=" + encodeURIComponent(date), {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (cancelled) return;
        const next = Array.isArray(payload?.occupiedTimes)
          ? payload.occupiedTimes.filter((value: unknown): value is string => typeof value === "string")
          : [];
        setOccupiedTimes(next);
        if (next.includes(time)) {
          const firstAvailable = TIMES.find((slot) => !next.includes(slot));
          if (firstAvailable) setTime(firstAvailable);
        }
      })
      .catch(() => {
        if (!cancelled) setOccupiedTimes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => { cancelled = true; };
  }, [open, date, property.id]);

  function close() {
    if (busy) return;
    setOpen(false);
    setDone(false);
    setError("");
    setTrackingToken("");
    setOccupiedTimes([]);
  }

  async function submit() {
    const normalizedPhone = faDigits(phone).replace(/\D/g, "");
    if (name.trim().length < 2) {
      setError("نام و نام خانوادگی را وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(normalizedPhone)) {
      setError("شماره موبایل را به‌صورت ۰۹xxxxxxxxx وارد کنید.");
      return;
    }
    if (!date || !time) {
      setError("روز و ساعت بازدید را مشخص کنید.");
      return;
    }

    const preferredAt = toIranIso(date, time);
    if (new Date(preferredAt).getTime() < Date.now() + 30 * 60 * 1000) {
      setError("زمان انتخابی باید حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizedPhone,
          peopleCount: 1,
          job: "",
          deal: "بازدید",
          propertyType: "بازدید فایل",
          neighborhood: property.neighborhood,
          floorPreference: "",
          requestedBedrooms: undefined,
          requestedAmenities: [],
          consultant: "",
          note: note.trim(),
          source: "website",
          propertyId: property.id,
          visitPreferredAt: preferredAt,
          matches: [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.statusMessage || payload?.message || "ثبت درخواست بازدید انجام نشد.");
      }
      if (payload?.trackingToken) setTrackingToken(payload.trackingToken);
      setDone(true);
      trackAnalyticsEvent("visit_request", property.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت درخواست بازدید انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-gold property-viewing-trigger"
        disabled={!visitAllowed}
        onClick={() => {
          setOpen(true);
          setError("");
          setDone(false);
          trackAnalyticsEvent("visit_request_click", property.slug);
        }}
      >
        <CalendarDays size={17} aria-hidden="true" />
        {visitAllowed ? "رزرو بازدید" : AVAILABILITY_LABEL[property.availabilityStatus]}
      </button>

      {open ? (
        <div className="property-viewing-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section
            className="property-viewing-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-viewing-title"
          >
            <button type="button" className="property-viewing-close" onClick={close} aria-label="بستن">
              <X size={19} />
            </button>

            {done ? (
              <div className="property-viewing-success">
                <div className="property-viewing-success-icon"><Check size={25} /></div>
                <span className="kicker">درخواست ثبت شد</span>
                <h2>درخواست بازدید شما دریافت شد.</h2>
                <p>
                  زمان پیشنهادی شما ثبت شد. مشاور هیرمند برای هماهنگی نهایی با شما تماس می‌گیرد.
                </p>
                <div className="property-viewing-summary">
                  <strong>{property.title}</strong>
                  <span><CalendarDays size={15} /> {formatPersianDate(date)}</span>
                  <span><Clock3 size={15} /> {time}</span>
                </div>
                <div className="property-viewing-tracking">
                  <span className="kicker">کد رهگیری</span>
                  <strong dir="ltr">{trackingToken || "—"}</strong>
                  <a className="btn-ghost" href={trackingToken ? "/request-tracking?code=" + encodeURIComponent(trackingToken) : "/request-tracking"}>
                    پیگیری آنلاین
                  </a>
                </div>
                <div className="property-viewing-calendar-actions">
                  <button
                    type="button"
                    className="btn-gold property-viewing-calendar-btn"
                    onClick={() => downloadViewingCalendar(property, date, time, trackingToken)}
                  >
                    <Download size={17} aria-hidden="true" />
                    افزودن به تقویم
                  </button>
                  <a
                    className="btn-ghost property-viewing-calendar-btn"
                    href={googleCalendarUrl(property, date, time, trackingToken)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                    Google Calendar
                  </a>
                </div>
                <button type="button" className="btn-ghost property-viewing-done" onClick={close}>متوجه شدم</button>
              </div>
            ) : (
              <>
                <div className="property-viewing-head">
                  <span className="kicker">هماهنگی بازدید</span>
                  <h2 id="property-viewing-title">برای این فایل زمان مناسب انتخاب کنید.</h2>
                  <p>
                    فایل «{property.title}» · {property.neighborhood}
                  </p>
                </div>

                <div className="property-viewing-grid">
                  <label className="field">
                    <span>نام و نام خانوادگی</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </label>
                  <label className="field">
                    <span>شماره موبایل</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      dir="ltr"
                      autoComplete="tel"
                      placeholder="0912..."
                    />
                  </label>
                  <label className="field">
                    <span>روز پیشنهادی</span>
                    <PersianDatePicker
                      value={date}
                      onChange={setDate}
                      title="روز پیشنهادی بازدید"
                      minValue={minimumDate}
                      hint="تاریخ را با تقویم شمسی انتخاب کنید."
                    />
                  </label>
                  <label className="field">
                    <span>ساعت پیشنهادی</span>
                    <select value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" disabled={loadingSlots}>
                      {TIMES.map((item) => <option key={item} value={item} disabled={occupiedTimes.includes(item)}>{item}{occupiedTimes.includes(item) ? " · پر" : ""}</option>)}
                    </select>
                    <small>{loadingSlots ? "در حال بررسی ظرفیت…" : occupiedTimes.length ? "زمان‌های «پر» قبلاً برای این فایل ثبت شده‌اند." : "ظرفیت این روز در لحظه بررسی شد."}</small>
                  </label>
                  <label className="field property-viewing-note">
                    <span>توضیح کوتاه (اختیاری)</span>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="مثلاً بازدید دو نفره یا هماهنگی با مشاور..."
                    />
                  </label>
                </div>

                {error ? <p className="property-viewing-error" role="alert">{error}</p> : null}

                <div className="property-viewing-actions">
                  <button type="button" className="btn-ghost" onClick={close} disabled={busy}>انصراف</button>
                  <button type="button" className="btn-gold" onClick={submit} disabled={busy}>
                    <CalendarDays size={17} />
                    {busy ? "در حال ثبت..." : "ثبت درخواست بازدید"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
