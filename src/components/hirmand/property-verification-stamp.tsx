import { ShieldCheck } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatPersianDate } from "@/lib/persian-date";
import "@/property-verification-stamp.css";

export function PropertyVerificationStamp({ property }: { property: Property }) {
  if (!property.lastVerifiedAt) return null;

  return (
    <section className="property-verification-stamp" aria-labelledby="property-verification-stamp-title">
      <div className="property-verification-stamp-icon" aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div className="property-verification-stamp-copy">
        <span className="kicker">بازبینی هیرمند</span>
        <h2 id="property-verification-stamp-title">
          آخرین بازبینی اطلاعات فایل
        </h2>
        <p>
          این فایل در {formatPersianDate(property.lastVerifiedAt)} توسط {property.lastVerifiedBy || "تیم هیرمند"} بازبینی شده است.
        </p>
        <small>
          این مهر فقط زمان بازبینی اطلاعات آگهی را نشان می‌دهد و جایگزین بررسی تخصصی، حقوقی یا تضمین صحت معامله نیست.
        </small>
      </div>
    </section>
  );
}
