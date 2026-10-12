import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarClock, Check, Download, RotateCcw } from "lucide-react";
import type { Property } from "@/lib/properties";
import { propertyPath } from "@/lib/property-path";
import { formatPersianDate } from "@/lib/persian-date";
import { PersianDatePicker } from "./persian-date-picker";
import "@/property-review-tools.css";

type ReminderData = { date: string; time: string; action: string; note: string; done: boolean };
const KEY = "hirmand-property-reminder-v1:";
const DEFAULT: ReminderData = { date: "", time: "17:00", action: "تماس با مشاور", note: "", done: false };
function futureDefault() { const now = new Date(); now.setDate(now.getDate() + 1); return now.toISOString().slice(0, 10); }
function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
export function PropertyFollowUpReminder({ property }: { property: Property }) {
  const [data, setData] = useState<ReminderData>({ ...DEFAULT, date: futureDefault() });
  const [saved, setSaved] = useState(false);
  useEffect(() => { try { const raw = localStorage.getItem(KEY + property.id); const parsed = raw ? JSON.parse(raw) : null; if (!parsed || typeof parsed !== "object") return; setData({ date: typeof parsed.date === "string" ? parsed.date : futureDefault(), time: typeof parsed.time === "string" ? parsed.time : "17:00", action: typeof parsed.action === "string" ? parsed.action : DEFAULT.action, note: typeof parsed.note === "string" ? parsed.note.slice(0, 600) : "", done: Boolean(parsed.done) }); } catch { /* defaults */ } }, [property.id]);
  const title = useMemo(() => "پیگیری فایل هیرمند: " + property.title, [property.title]);
  function patch(patch: Partial<ReminderData>) { setData((current) => ({ ...current, ...patch, done: patch.done ?? false })); setSaved(false); }
  function save() { if (!data.date || !data.time) return; try { localStorage.setItem(KEY + property.id, JSON.stringify(data)); } catch { /* memory fallback */ } setSaved(true); }
  function markDone() { const next = { ...data, done: true }; setData(next); try { localStorage.setItem(KEY + property.id, JSON.stringify(next)); } catch { /* memory fallback */ } setSaved(true); }
  function reset() { const next = { ...DEFAULT, date: futureDefault() }; setData(next); try { localStorage.removeItem(KEY + property.id); } catch { /* ignore */ } setSaved(false); }
  function downloadCalendar() {
    if (!data.date || !data.time) return;
    const localDate = data.date.replace(/-/g, ""); const localTime = data.time.replace(":", "") + "00";
    const uid = property.id + "-" + data.date + "-" + data.time + "@hirmand";
    const url = typeof window !== "undefined" ? new URL(propertyPath(property), window.location.origin).toString() : propertyPath(property);
    const content = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Hirmand//Property Reminder//FA","BEGIN:VEVENT","UID:" + escapeIcs(uid),"DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),"DTSTART:" + localDate + "T" + localTime,"SUMMARY:" + escapeIcs(data.action + " — " + property.title),"DESCRIPTION:" + escapeIcs((data.note.trim() || "پیگیری فایل") + "\n" + url),"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" }); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "hirmand-property-reminder.ics"; anchor.click(); URL.revokeObjectURL(href);
  }
  return (
    <section className="property-reminder-tool" aria-labelledby="property-reminder-title">
      <header className="property-reminder-head"><div><span className="kicker">پیگیری زمان‌دار</span><h2 id="property-reminder-title"><BellRing size={20} /> یادآور پیگیری این فایل</h2><p>یادآور روی همین مرورگر ذخیره می‌شود. برای اعلان واقعی، فایل تقویم را به تقویم گوشی/رایانه اضافه کنید.</p></div>{data.done ? <span className="property-reminder-done"><Check size={14} /> انجام شد</span> : null}</header>
      <div className="property-reminder-grid"><label><span>تاریخ</span><PersianDatePicker value={data.date} onChange={(date) => patch({ date })} title="تاریخ پیگیری" hint="" /></label><label><span>ساعت</span><input type="time" value={data.time} onChange={(e) => patch({ time: e.target.value })} /></label><label><span>نوع پیگیری</span><select value={data.action} onChange={(e) => patch({ action: e.target.value })}><option>تماس با مشاور</option><option>درخواست مدارک</option><option>مذاکره قیمت</option><option>بازدید دوم</option><option>بررسی دوباره فایل</option></select></label></div>
      <label className="property-reminder-note"><span>یادداشت</span><textarea maxLength={600} rows={3} value={data.note} onChange={(e) => patch({ note: e.target.value })} placeholder="مثلاً بعد از دریافت سند، درباره قیمت نهایی تماس بگیرم." /></label>
      <div className="property-reminder-actions"><button type="button" className="property-reminder-save" onClick={save}><CalendarClock size={15} /> {saved ? "ذخیره شد" : "ذخیره یادآور"}</button>{!data.done ? <button type="button" className="property-reminder-done-btn" onClick={markDone}><Check size={15} /> انجام شد</button> : null}<button type="button" className="property-reminder-calendar" onClick={downloadCalendar}><Download size={15} /> افزودن به تقویم</button><button type="button" className="property-reminder-reset" onClick={reset}><RotateCcw size={14} /> بازنشانی</button></div>
      <p className="property-reminder-hidden-title" aria-hidden="true">{title}</p>
    </section>
  );
}