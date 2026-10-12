import { useEffect, useMemo, useState } from "react";
import { ClipboardList, HandCoins, KeyRound, Scale, ShieldCheck } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-deal-execution.css";

const ITEMS = [
  { stage: "قبل از بیعانه", icon: Scale, text: "هویت مالک/فروشنده و مشخصات سند با اطلاعات ملک تطبیق داده شد." },
  { stage: "قبل از بیعانه", icon: ShieldCheck, text: "وضعیت رهن، بازداشت، بدهی و محدودیت‌های مهم ملک بررسی شد." },
  { stage: "قبل از قرارداد", icon: ClipboardList, text: "شرایط پرداخت، زمان تحویل، خسارت و تعهدات طرفین مکتوب و روشن شد." },
  { stage: "قبل از قرارداد", icon: HandCoins, text: "مبلغ کمیسیون و نحوه پرداخت آن برای طرفین مشخص شد." },
  { stage: "قبل از تحویل", icon: KeyRound, text: "تسویه قبوض، شارژ و هزینه‌های جاری مورد توافق بررسی شد." },
  { stage: "قبل از تحویل", icon: ShieldCheck, text: "کلیدها، پارکینگ، انباری، کنتورها و اقلام تحویلی صورتجلسه شد." },
  { stage: "روز تحویل", icon: ClipboardList, text: "وضعیت نهایی ملک و هر مورد باقی‌مانده در صورتجلسه تحویل ثبت شد." },
  { stage: "روز تحویل", icon: Scale, text: "مدارک نهایی و مسیر انتقال/تحویل طبق توافق و نظر متخصص مربوطه کنترل شد." },
] as const;

const KEY_PREFIX = "hirmand-deal-checklist-v1:";

export function PropertyDealChecklist({ property }: { property: Property }) {
  const key = KEY_PREFIX + property.id;
  const [checked, setChecked] = useState<boolean[]>(() => ITEMS.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved)) setChecked(ITEMS.map((_, index) => Boolean(saved[index])));
    } catch {
      // Keep the default unchecked state when browser storage is unavailable.
    }
  }, [key]);

  const done = useMemo(() => checked.filter(Boolean).length, [checked]);
  const grouped = useMemo(() => ITEMS.reduce<Record<string, typeof ITEMS[number][]>>((acc, item) => {
    (acc[item.stage] ??= []).push(item);
    return acc;
  }, {}), []);
  const stages = ["قبل از بیعانه", "قبل از قرارداد", "قبل از تحویل", "روز تحویل"];

  function toggle(index: number) {
    setChecked((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the checklist usable in memory when storage is blocked.
      }
      return next;
    });
  }

  return (
    <section className="property-deal-tool" aria-labelledby="property-deal-checklist-title">
      <header className="property-deal-tool-head">
        <div>
          <span className="kicker">کنترل معامله</span>
          <h2 id="property-deal-checklist-title"><ShieldCheck size={20} /> چک‌لیست حقوقی و تحویل</h2>
          <p>این چک‌لیست جایگزین بررسی حقوقی یا کارشناسی نیست؛ برای جلوگیری از فراموشی مراحل تهیه شده است.</p>
        </div>
        <strong className="property-deal-progress">{done.toLocaleString("fa-IR")} / {ITEMS.length.toLocaleString("fa-IR")}</strong>
      </header>
      <div className="property-deal-stage-grid">
        {stages.map((stage) => (
          <div className="property-deal-stage" key={stage}>
            <h3>{stage}</h3>
            {grouped[stage].map((item) => {
              const index = ITEMS.indexOf(item);
              const Icon = item.icon;
              return (
                <label key={item.text} className={"property-deal-check " + (checked[index] ? "is-done" : "")}>
                  <input type="checkbox" checked={checked[index]} onChange={() => toggle(index)} />
                  <span className="property-deal-check-icon"><Icon size={14} /></span>
                  <span>{item.text}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
