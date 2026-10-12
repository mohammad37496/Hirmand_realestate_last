import { useEffect, useMemo, useState } from "react";
import { ClipboardPenLine, Plus, Trash2 } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-question-log.css";

const KEY_PREFIX = "hirmand-property-question-log-v1:";

type QuestionItem = {
  id: string;
  question: string;
  answer: string;
};

function defaultQuestions(property: Property): string[] {
  const questions = [
    "وضعیت سند و مدارک اصلی ملک چیست؟",
    "آخرین وضعیت بدهی، رهن، بازداشت یا محدودیت ملک چیست؟",
    "زمان و شرایط تحویل دقیق چگونه است؟",
  ];
  if (property.transactionType === "rent") {
    questions.push("مبلغ نهایی رهن و اجاره و امکان تغییر آن در قرارداد چیست؟");
  } else {
    questions.push("شرایط پرداخت و زمان‌بندی مبالغ اصلی معامله چگونه است؟");
  }
  if (property.parking) questions.push("پارکینگ از نظر سند و محل دقیق چگونه ثبت شده است؟");
  if (property.areaM2 != null) questions.push("متراژ اعلام‌شده با سند و وضعیت فعلی ملک تطبیق دارد؟");
  return Array.from(new Set(questions)).slice(0, 7);
}

function readItems(property: Property): QuestionItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_PREFIX + property.id);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return defaultQuestions(property).map((question, index) => ({ id: "q" + index, question, answer: "" }));
    return parsed
      .filter((item): item is QuestionItem => Boolean(item) && typeof item === "object" && typeof item.question === "string")
      .map((item) => ({ id: item.id || crypto.randomUUID(), question: item.question.slice(0, 260), answer: typeof item.answer === "string" ? item.answer.slice(0, 800) : "" }))
      .slice(0, 20);
  } catch {
    return defaultQuestions(property).map((question, index) => ({ id: "q" + index, question, answer: "" }));
  }
}

export function PropertyQuestionLog({ property }: { property: Property }) {
  const [items, setItems] = useState<QuestionItem[]>(() => readItems(property));

  useEffect(() => {
    try {
      localStorage.setItem(KEY_PREFIX + property.id, JSON.stringify(items));
    } catch {
      // Keep working in memory when browser storage is unavailable.
    }
  }, [items, property.id]);

  const answered = useMemo(() => items.filter((item) => item.answer.trim()).length, [items]);

  function updateAnswer(id: string, answer: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, answer: answer.slice(0, 800) } : item));
  }

  function addQuestion() {
    setItems((current) => current.length >= 20
      ? current
      : [...current, { id: crypto.randomUUID(), question: "سؤال جدید", answer: "" }]);
  }

  function removeQuestion(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function updateQuestion(id: string, question: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, question: question.slice(0, 260) } : item));
  }

  return (
    <section className="property-question-log" aria-labelledby="property-question-log-title">
      <header className="property-question-log-head">
        <div>
          <span className="kicker">دفتر پیگیری</span>
          <h2 id="property-question-log-title"><ClipboardPenLine size={19} /> سؤال‌ها و پاسخ‌های این فایل</h2>
          <p>سؤال‌های مهم را ثبت کنید و پاسخ مشاور/مالک را کنار همان سؤال نگه دارید تا اطلاعات پراکنده نشود.</p>
        </div>
        <span>{answered.toLocaleString("fa-IR")} از {items.length.toLocaleString("fa-IR")} پاسخ ثبت شده</span>
      </header>

      <div className="property-question-list">
        {items.map((item) => (
          <article className="property-question-card" key={item.id}>
            <div className="property-question-top">
              <input value={item.question} onChange={(e) => updateQuestion(item.id, e.target.value)} aria-label="سؤال" />
              <button type="button" onClick={() => removeQuestion(item.id)} aria-label="حذف سؤال"><Trash2 size={15} /></button>
            </div>
            <textarea rows={3} value={item.answer} onChange={(e) => updateAnswer(item.id, e.target.value)} placeholder="پاسخ مشاور/مالک، زمان پیگیری یا مدرک مرتبط را ثبت کنید..." />
          </article>
        ))}
      </div>

      <button type="button" className="btn-ghost" onClick={addQuestion} disabled={items.length >= 20}>
        <Plus size={15} /> افزودن سؤال
      </button>
    </section>
  );
}
