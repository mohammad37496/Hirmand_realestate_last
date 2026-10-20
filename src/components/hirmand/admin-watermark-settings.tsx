import { Info } from "lucide-react";
import "@/admin-watermark.css";

export function AdminWatermarkSettings() {
  return (
    <main className="admin-watermark-page">
      <section className="admin-watermark-hero">
        <div>
          <span className="kicker">مدیریت رسانه</span>
          <h1>واترمارک خودکار غیرفعال است</h1>
          <p>
            واترمارک خودکار از فرایند آپلود و نمایش رسانه‌ها حذف شده است.
            تصاویر و ویدئوهای جدید بدون درج لوگو یا متن روی فایل ذخیره می‌شوند.
            فایل‌هایی که قبلاً واترمارک به‌صورت دائمی روی خودشان ثبت شده، برای حذف آن
            باید با نسخه اصلی و بدون واترمارک جایگزین شوند.
          </p>
        </div>
        <div className="admin-watermark-hero-icon" aria-hidden="true"><Info size={34} /></div>
      </section>
    </main>
  );
}
