import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Send, Sparkles } from "lucide-react";
import type { Property } from "@/lib/properties";
import { SITE } from "@/lib/site";
import { toast } from "sonner";
import "@/property-inquiry-tools.css";

function missingQuestions(property: Property) {
  const questions: string[] = [];
  if (!property.description?.trim() || property.description.trim().length < 40) questions.push("لطفاً توضیح کامل‌تری درباره وضعیت فعلی ملک و نقاط قوت/محدودیت‌های آن ارسال کنید.");
  if (property.bedrooms == null) questions.push("تعداد خواب‌ها و امکان تغییر چیدمان یا کاربری اتاق‌ها چقدر است؟");
  if (property.bathrooms == null) questions.push("تعداد سرویس‌های بهداشتی و وضعیت آن‌ها چگونه است؟");
  if (property.builtYear == null) questions.push("سال ساخت و آخرین بازسازی‌های مهم ملک چه زمانی بوده است؟");
  if (property.elevator == null) questions.push("آسانسور دارد؟ ظرفیت و وضعیت سرویس آن چگونه است؟");
  if (property.parking == null) questions.push("وضعیت پارکینگ، محل دقیق و اختصاصی یا مزاحم بودن آن چگونه است؟");
  if (property.neighborhood?.trim()) questions.push(`دسترسی‌های مهم در محدوده ${property.neighborhood} مثل حمل‌ونقل، مدرسه و خدمات روزمره چگونه است؟`);
  if (property.transactionType === "buy" || property.transactionType === "sell") {
    questions.push("مالک درباره قیمت نهایی و امکان مذاکره چه شرایطی دارد؟");
  } else {
    questions.push("شرایط دقیق ودیعه/اجاره، زمان تحویل و حداقل مدت قرارداد چیست؟");
  }
  questions.push("هزینه شارژ، قبوض و بدهی یا تعهد مالی مرتبط با ملک تا زمان تحویل چگونه تسویه می‌شود؟");
  questions.push("برای بازدید حضوری چه زمان‌هایی در دسترس است و چه مدارکی برای تصمیم‌گیری می‌توان دید؟");
  return Array.from(new Set(questions)).slice(0, 10);
}

export function PropertyInquiryTools({ property }: { property: Property }) {
  const questions = useMemo(() => missingQuestions(property), [property]);
  const [selected, setSelected] = useState<boolean[]>(() => questions.map(() => true));
  const [copied, setCopied] = useState(false);

  const message = useMemo(() => {
    const chosen = questions.filter((_, index) => selected[index]);
    return [
      `سلام، درباره فایل «${property.title}» از سایت هیرمند چند سؤال داشتم:`,
      ...chosen.map((question, index) => `${(index + 1).toLocaleString("fa-IR")}. ${question}`),
      "ممنون می‌شوم قبل از هماهنگی بازدید اطلاعات لازم را بفرمایید.",
    ].join("\n");
  }, [property.title, questions, selected]);

  function toggle(index: number) {
    setSelected((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value));
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("پیام سؤال‌ها کپی شد.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کپی پیام انجام نشد.");
    }
  }

  function openWhatsApp() {
    window.open(`${SITE.whatsappDirect}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="property-inquiry-tool" aria-labelledby="property-inquiry-tool-title">
      <header className="property-inquiry-head">
        <div>
          <span className="kicker">پیگیری هوشمند فایل</span>
          <h2 id="property-inquiry-tool-title"><Sparkles size={20} /> بسته سؤال برای مالک یا مشاور</h2>
          <p>سؤال‌های زیر با توجه به اطلاعات ناقص یا موضوعات مهم این فایل ساخته می‌شوند. انتخاب‌های شما فقط برای ساخت پیام هستند.</p>
        </div>
      </header>
      <div className="property-inquiry-layout">
        <div className="property-inquiry-list">
          {questions.map((question, index) => (
            <label key={question} className={"property-inquiry-item" + (selected[index] ? " is-selected" : "")}>
              <input type="checkbox" checked={selected[index]} onChange={() => toggle(index)} />
              <span className="property-inquiry-check">{selected[index] ? <Check size={14} /> : null}</span>
              <span>{question}</span>
            </label>
          ))}
        </div>
        <div className="property-inquiry-preview">
          <div className="property-inquiry-preview-head"><strong>پیش‌نمایش پیام</strong><span>{selected.filter(Boolean).length.toLocaleString("fa-IR")} سؤال</span></div>
          <pre>{message}</pre>
          <div className="property-inquiry-actions">
            <button type="button" className="property-deal-btn" onClick={() => void copyMessage()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "کپی شد" : "کپی متن"}</button>
            <button type="button" className="property-deal-btn property-deal-btn-primary" onClick={openWhatsApp}><Send size={16} /> ارسال در واتساپ</button>
          </div>
        </div>
      </div>
    </section>
  );
}
