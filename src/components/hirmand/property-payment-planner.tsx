import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, WalletCards } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { PersianDatePicker } from "./persian-date-picker";
import "@/property-deal-execution.css";

function amount(value: string | null | undefined) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fa(n: number) { return n.toLocaleString("fa-IR"); }
const KEY_PREFIX = "hirmand-payment-plan-v1:";

export function PropertyPaymentPlanner({ property }: { property: Property }) {
  const price = amount(property.price);
  const key = KEY_PREFIX + property.id;
  const [depositPercent, setDepositPercent] = useState(30);
  const [installments, setInstallments] = useState(6);
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== "object") return;
      if (Number.isFinite(saved.depositPercent)) setDepositPercent(saved.depositPercent);
      if (Number.isFinite(saved.installments)) setInstallments(saved.installments);
      if (typeof saved.monthlyAmount === "string") setMonthlyAmount(saved.monthlyAmount);
      if (typeof saved.firstPaymentDate === "string") setFirstPaymentDate(saved.firstPaymentDate);
      if (typeof saved.handoverDate === "string") setHandoverDate(saved.handoverDate);
    } catch {
      // Keep default payment settings when browser storage is unavailable.
    }
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ depositPercent, installments, monthlyAmount, firstPaymentDate, handoverDate }));
    } catch {
      // Ignore storage failures; the planner remains usable for this session.
    }
  }, [depositPercent, installments, monthlyAmount, firstPaymentDate, handoverDate, key]);

  const deposit = Math.round(price * depositPercent / 100);
  const defaultMonthly = installments > 0 ? Math.max(0, Math.round((price - deposit) / installments)) : 0;
  const chosenMonthly = amount(monthlyAmount);
  const plannedInstallmentTotal = chosenMonthly || defaultMonthly;
  const totalPlanned = deposit + plannedInstallmentTotal * installments;
  const gap = price - totalPlanned;

  const checkpoints = useMemo(() => ([
    { label: "پرداخت اولیه", value: deposit },
    { label: "اقساط", value: plannedInstallmentTotal * installments },
    { label: "جمع برنامه", value: totalPlanned },
  ]), [deposit, plannedInstallmentTotal, installments, totalPlanned]);

  return (
    <section className="property-deal-tool" aria-labelledby="property-payment-planner-title">
      <header className="property-deal-tool-head">
        <div>
          <span className="kicker">برنامه معامله</span>
          <h2 id="property-payment-planner-title"><CalendarClock size={20} /> برنامه‌ریزی پرداخت</h2>
          <p>مبالغ و تاریخ‌های انتخابی شما فقط روی همین مرورگر ذخیره می‌شوند.</p>
        </div>
      </header>
      {price > 0 ? (
        <div className="property-deal-grid">
          <div className="property-deal-controls">
            <label className="property-deal-field"><span>پرداخت اولیه: {fa(depositPercent)}٪</span><input type="range" min="0" max="80" step="5" value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))} /></label>
            <label className="property-deal-field"><span>تعداد اقساط: {fa(installments)}</span><input type="range" min="1" max="36" step="1" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} /></label>
            <label className="property-deal-field"><span>مبلغ هر قسط دلخواه (اختیاری)</span><input inputMode="numeric" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} placeholder={formatToman(defaultMonthly) + " تومان"} /></label>
            <div className="property-deal-date-row">
              <label className="property-deal-field"><span>تاریخ اولین پرداخت</span><PersianDatePicker value={firstPaymentDate} onChange={setFirstPaymentDate} title="تاریخ اولین پرداخت" hint="تاریخ را با تقویم شمسی انتخاب کنید." /></label>
              <label className="property-deal-field"><span>تاریخ تحویل</span><PersianDatePicker value={handoverDate} onChange={setHandoverDate} title="تاریخ تحویل" hint="تاریخ را با تقویم شمسی انتخاب کنید." /></label>
            </div>
          </div>
          <div className="property-payment-preview">
            <div className="property-payment-metrics">
              {checkpoints.map((item) => <div key={item.label}><span>{item.label}</span><strong>{formatToman(item.value)} تومان</strong></div>)}
            </div>
            <div className={"property-payment-status " + (gap === 0 ? "is-balanced" : gap > 0 ? "is-short" : "is-over")}>
              <WalletCards size={17} />
              {gap === 0 ? "برنامه دقیقاً با قیمت فایل منطبق است." : gap > 0 ? `این برنامه ${formatToman(gap)} تومان از قیمت فایل کمتر است.` : `این برنامه ${formatToman(Math.abs(gap))} تومان بیشتر از قیمت فایل است.`}
            </div>
            <small className="property-deal-note"><CheckCircle2 size={14} /> تاریخ‌ها یادآور تقویمی نیستند؛ فقط برای نگهداری برنامه معامله در صفحه فایل ذخیره می‌شوند.</small>
          </div>
        </div>
      ) : (
        <p className="property-deal-empty">برای برنامه‌ریزی پرداخت، قیمت فروش عددی این فایل لازم است.</p>
      )}
    </section>
  );
}
