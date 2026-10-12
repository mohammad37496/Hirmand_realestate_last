import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Gauge, HelpCircle, MessageCircle, WalletCards } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-decision-readiness.css";

function read<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) || "null") as T | null; } catch { return null; } }
export function PropertyDecisionReadiness({ property }: { property: Property }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setTick(v => v + 1), 1500); return () => window.clearInterval(timer); }, []);
  const data = useMemo(() => {
    const deal = read<any>("hirmand-property-deal-room-v1:" + property.id);
    const q = read<any[]>("hirmand-property-question-log-v1:" + property.id);
    const neg = read<any[]>("hirmand-property-negotiation-log-v1:" + property.id);
    const visit = read<any>("hirmand-property-visit-outcome-v1:" + property.id);
    const pay = read<any>("hirmand-payment-plan-v1:" + property.id);
    const openDeal = Array.isArray(deal?.items) ? deal.items.filter((x: any) => x && x.status !== "تکمیل").length : 0;
    const unanswered = Array.isArray(q) ? q.filter(x => x && !String(x.answer || "").trim()).length : 0;
    const offers = Array.isArray(neg) ? neg.length : 0;
    const readiness = 100 - Math.min(55, openDeal * 8) - Math.min(20, unanswered * 5) - (!property.price ? 10 : 0) - (!property.areaM2 ? 5 : 0) + (visit?.status === "مناسب" ? 8 : 0);
    const capped = Math.max(0, Math.min(100, Math.round(readiness)));
    const next = openDeal ? "تکمیل موارد ضروری اتاق معامله" : unanswered ? "پاسخ‌گرفتن به سؤال‌های باز" : !property.price || !property.areaM2 ? "تکمیل اطلاعات پایه فایل" : offers ? "ثبت نتیجه مذاکره" : "ثبت نتیجه بازدید";
    return { openDeal, unanswered, offers, capped, next, payDate: pay?.handoverDate || pay?.firstPaymentDate || "" };
  }, [property, tick]);
  return <section className="property-decision-readiness"><header><div><span className="kicker">نمای سریع تصمیم</span><h2><Gauge size={20} /> داشبورد آماده‌به‌تصمیم</h2><p>این شاخص فقط از داده‌های سایت و ثبت‌های شخصی شما ساخته می‌شود و توصیه قطعی خرید یا اجاره نیست.</p></div><div className="property-decision-readiness-score"><strong>{data.capped.toLocaleString("fa-IR")}</strong><span>از ۱۰۰</span></div></header><div className="property-readiness-grid"><div><ClipboardCheck size={15} /><span>موارد باز معامله</span><b>{data.openDeal.toLocaleString("fa-IR")}</b></div><div><HelpCircle size={15} /><span>سؤال بی‌پاسخ</span><b>{data.unanswered.toLocaleString("fa-IR")}</b></div><div><MessageCircle size={15} /><span>سابقه مذاکره</span><b>{data.offers.toLocaleString("fa-IR")}</b></div><div><WalletCards size={15} /><span>موعد مالی</span><b>{data.payDate ? new Date(data.payDate + "T12:00:00").toLocaleDateString("fa-IR") : "ثبت نشده"}</b></div></div><div className="property-decision-readiness-next">{data.capped >= 80 ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<div><strong>اقدام بعدی برای تکمیل بررسی</strong><span>{data.next}</span></div></div></section>;
}