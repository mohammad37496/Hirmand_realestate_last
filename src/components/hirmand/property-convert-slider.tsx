import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { DEFAULT_MATCH_RAHN_RATE, totalRahnEquivalent } from "@/lib/budget-matching";
import { formatToman } from "@/lib/money";
import type { Property } from "@/lib/properties";

type Props = {
  property: Pick<Property, "transactionType" | "deposit" | "rent" | "convertible">;
};

function amount(value: string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function PropertyConvertSlider({ property }: Props) {
  const deposit = amount(property.deposit);
  const rent = amount(property.rent);

  if (!property.convertible ||
      (property.transactionType !== "rent" && property.transactionType !== "mortgage") ||
      (deposit <= 0 && rent <= 0)) {
    return null;
  }

  return <PropertyConvertSliderInner deposit={deposit} rent={rent} />;
}

function PropertyConvertSliderInner({ deposit, rent }: { deposit: number; rent: number }) {
  const rate = DEFAULT_MATCH_RAHN_RATE;
  const totalEquivalent = useMemo(
    () => totalRahnEquivalent(deposit, rent, rate),
    [deposit, rent, rate],
  );
  const initialShare = useMemo(() => {
    if (totalEquivalent <= 0) return 0;
    return Math.min(100, Math.max(0, ((rent * 1_000_000) / rate / totalEquivalent) * 100));
  }, [rent, rate, totalEquivalent]);
  const [share, setShare] = useState(initialShare);

  useEffect(() => {
    setShare(initialShare);
  }, [initialShare]);

  const convertedDeposit = Math.round(totalEquivalent * (1 - share / 100));
  const convertedRent = Math.round((totalEquivalent * share / 100 / 1_000_000) * rate);
  const unchanged = Math.abs(share - initialShare) < 0.5;

  return (
    <section className="property-convert-slider" aria-labelledby="property-convert-title">
      <div className="property-convert-header">
        <div>
          <span className="kicker">تبدیل رهن و اجاره</span>
          <h2 id="property-convert-title">قابل تبدیل بین رهن و اجاره</h2>
          <p>ترکیب مالی فایل را جابه‌جا کنید؛ ارزش معادل ملک ثابت می‌ماند.</p>
        </div>
        <span className="property-convert-badge">
          <ArrowLeftRight size={16} />
          نرخ مرجع: {formatToman(rate)} تومان
        </span>
      </div>

      <div className="property-convert-table-wrap">
        <table className="property-convert-table">
          <thead>
            <tr>
              <th>رهن (تومان)</th>
              <th>اجارهٔ ماهانه (تومان)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatToman(deposit)}</td>
              <td>{formatToman(rent)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="property-convert-rail">
        <div className="property-convert-rail-labels">
          <span>رهن کامل</span>
          <strong>{unchanged ? "برای تبدیل بکشید" : Math.round(share).toLocaleString("fa-IR") + "٪ اجاره"}</strong>
          <span>اجاره کامل</span>
        </div>
        <input
          className="property-convert-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={share}
          aria-label="نوار تبدیل رهن به اجاره"
          style={{ ["--convert-p" as string]: share + "%" }}
          onChange={(event) => setShare(Number(event.target.value))}
        />
      </div>

      <div className="property-convert-results" aria-live="polite">
        <div className="property-convert-info-row">
          <div>
            <span className="property-convert-result-value">{formatToman(deposit)}</span>
            <small>رهن فعلی</small>
          </div>
          <div className="property-convert-result--active">
            <span className="property-convert-result-value">{formatToman(convertedDeposit)}</span>
            <small>رهن پس از تبدیل</small>
          </div>
        </div>
        <div className="property-convert-info-row">
          <div>
            <span className="property-convert-result-value">{formatToman(rent)}</span>
            <small>اجاره فعلی</small>
          </div>
          <div className="property-convert-result--active">
            <span className="property-convert-result-value">{formatToman(convertedRent)}</span>
            <small>اجاره پس از تبدیل</small>
          </div>
        </div>
      </div>

      <p className="property-convert-note">
        محاسبه تقریبی است: هر ۱ میلیون تومان رهن معادل {formatToman(rate)} تومان اجارهٔ ماهانه در نظر گرفته شده و
        مبلغ نهایی باید با مالک و مشاور هماهنگ شود.
      </p>
    </section>
  );
}