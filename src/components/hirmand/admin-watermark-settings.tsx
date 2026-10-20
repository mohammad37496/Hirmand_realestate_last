import { Info } from "lucide-react";
import "@/admin-watermark.css";

export function AdminWatermarkSettings() {
  return (
    <main className="admin-watermark-page">
      <section className="admin-watermark-hero">
        <div>
          <span className="kicker">مدیریت رسانه</span>
          <h1>واترمارک رسانه‌ها به‌صورت پیش‌فرض خاموش است</h1>
          <p>
            برای هر فایل ملک، هنگام آپلود عکس و ویدیو می‌توانی واترمارک اختصاصی هیرمند را روشن یا خاموش کنی
            و محل لوگوی کوچک را از بین چهار گوشه انتخاب کنی. این تنظیم در بخش «تصاویر و ویدیوهای ملک» قرار دارد.
            وقتی واترمارک روشن باشد، لوگو داخل فایل نهایی درج می‌شود؛ خاموش‌کردن گزینه برای آپلودهای بعدی،
            واترمارک فایل‌های قبلی را حذف نمی‌کند. برای جایگزینی فایل واترمارک‌شده، نسخه اصلی را دوباره آپلود کن.
          </p>
        </div>
        <div className="admin-watermark-hero-icon" aria-hidden="true"><Info size={34} /></div>
      </section>
    </main>
  );
}
