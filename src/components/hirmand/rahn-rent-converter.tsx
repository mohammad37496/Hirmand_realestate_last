import { useMemo, useState } from "react";
import { ArrowLeftRight, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_RAHN_RATE,
  RAHN_RATE_PRESETS,
  rahnFromRent,
  rahnRentSummary,
  rentFromRahn,
  splitRahnRent,
} from "@/lib/finance";
import { calculateRentRenewal } from "@/lib/rent-renewal";
import {
  formatFaNumber,
  formatGroupedInput,
  formatRateInput,
  formatToman,
  parseAmount,
  parseDecimal,
  tomanToWords,
} from "@/lib/money";
import { cn } from "@/lib/utils";

export function RahnRentConverter() {
  const [amount, setAmount] = useState("۵۰۰٬۰۰۰٬۰۰۰");
  const [rate, setRate] = useState(DEFAULT_RAHN_RATE);
  const [share, setShare] = useState(35);
  const [previousRahn, setPreviousRahn] = useState("");
  const [previousRent, setPreviousRent] = useState("");
  const [rahnIncrease, setRahnIncrease] = useState("30");
  const [rentIncrease, setRentIncrease] = useState("30");

  const totalRahn = parseAmount(amount);
  const result = useMemo(
    () => splitRahnRent(totalRahn, share / 100, rate),
    [totalRahn, share, rate],
  );
  const amountWords = tomanToWords(totalRahn);
  const fullRent = rentFromRahn(totalRahn, rate);
  const fullRahnFromRent = rahnFromRent(fullRent, rate);
  const oldRahnValue = parseAmount(previousRahn);
  const oldRentValue = parseAmount(previousRent);
  const rahnRateValue = Math.min(1000, parseDecimal(rahnIncrease));
  const rentRateValue = Math.min(1000, parseDecimal(rentIncrease));
  const rahnRenewal = calculateRentRenewal(oldRahnValue, rahnRateValue);
  const rentRenewal = calculateRentRenewal(oldRentValue, rentRateValue);

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(rahnRentSummary(result));
      toast.success("خلاصه محاسبه کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  }

  return (
    <div className="commission-layout">
      <div className="commission-box rahn-box">
        <div className="preset-grid rahn-rate-grid" role="listbox" aria-label="نرخ تبدیل">
          {RAHN_RATE_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              className={cn("preset-chip", rate === item && "is-active")}
              onClick={() => setRate(item)}
            >
              <strong>{formatToman(item)}</strong>
              <span>اجاره به‌ازای هر ۱ میلیون رهن</span>
            </button>
          ))}
        </div>

        <label className="field field-span">
          <span className="field-label">ارزش کل قرارداد (معادل رهن، تومان)</span>
          <input
            inputMode="numeric"
            placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"
            value={amount}
            onChange={(event) => setAmount(formatGroupedInput(event.target.value))}
          />
          {amountWords ? <em className="amount-words">{amountWords}</em> : null}
        </label>

        <div className="rahn-slider-wrap">
          <div className="rahn-slider-labels">
            <span>رهن کامل</span>
            <strong>{formatFaNumber(share, 0)}٪ اجاره</strong>
            <span>اجاره کامل</span>
          </div>
          <input
            type="range"
            className="rahn-slider"
            min={0}
            max={100}
            step={1}
            value={share}
            aria-label="نوار تبدیل رهن به اجاره"
            style={{ ["--p" as string]: `${share}%` }}
            onChange={(event) => setShare(Number(event.target.value))}
          />
          <p className="rahn-slider-hint">نوار را به چپ یا راست بکشید</p>
        </div>

        {result ? (
          <div className="commission-result" aria-live="polite">
            <div className="commission-result-head">
              <ArrowLeftRight size={18} strokeWidth={1.8} />
              <strong>ترکیب رهن و اجاره</strong>
            </div>
            <div className="rahn-split-cards">
              <article>
                <small>رهن</small>
                <strong>{formatToman(result.rahn)}</strong>
                <em>تومان</em>
                {tomanToWords(result.rahn) ? <span>{tomanToWords(result.rahn)}</span> : null}
              </article>
              <article>
                <small>اجاره ماهانه</small>
                <strong>{formatToman(result.rent)}</strong>
                <em>تومان</em>
                {tomanToWords(result.rent) ? <span>{tomanToWords(result.rent)}</span> : null}
              </article>
            </div>
            <div className="split-bar" aria-hidden="true">
              <span className="split-principal" style={{ flexGrow: Math.max(100 - share, 1) }} />
              <span className="split-interest" style={{ flexGrow: Math.max(share, 1) }} />
            </div>
            <p className="split-legend">
              رهن {formatFaNumber(100 - share, 0)}٪ — اجاره {formatFaNumber(share, 0)}٪
            </p>
            <ul className="commission-rows">
              <li>
                <span>اگر همه رهن باشد</span>
                <strong>{formatToman(fullRahnFromRent)} تومان</strong>
              </li>
              <li>
                <span>اگر همه اجاره باشد</span>
                <strong>{formatToman(fullRent)} تومان</strong>
              </li>
            </ul>
            <button type="button" className="copy-result" onClick={copyResult}>
              <Copy size={15} />
              کپی خلاصه محاسبه
            </button>
            <p className="commission-disclaimer">
              نرخ تبدیل در این ابزار عدد راهنماست و باید متناسب با عرف روز، ملک و توافق طرفین تنظیم
              شود. برای قرارداد نهایی، عدد مورد توافق را مبنا قرار دهید.
            </p>
          </div>
        ) : (
          <p className="commission-hint">ارزش کل را وارد کنید تا تبدیل محاسبه شود.</p>
        )}

        <section className="rent-renewal" aria-labelledby="rent-renewal-title">
          <div className="rent-renewal-heading">
            <span className="kicker">ویژه تمدید قرارداد</span>
            <h2 id="rent-renewal-title">محاسبه رهن و اجاره سال جدید</h2>
            <p>مبلغ قرارداد پارسال و درصد افزایش پیشنهادی را وارد کنید تا مبلغ جدید تمدید را ببینید.</p>
          </div>
          <div className="commission-fields">
            <label className="field">
              <span className="field-label">رهن پارسال (تومان)</span>
              <input inputMode="numeric" placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰" value={previousRahn}
                onChange={(event) => setPreviousRahn(formatGroupedInput(event.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">اجاره ماهانه پارسال (تومان)</span>
              <input inputMode="numeric" placeholder="مثلاً ۱۰٬۰۰۰٬۰۰۰" value={previousRent}
                onChange={(event) => setPreviousRent(formatGroupedInput(event.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">درصد افزایش رهن (٪)</span>
              <input inputMode="decimal" dir="ltr" value={rahnIncrease}
                onChange={(event) => setRahnIncrease(formatRateInput(event.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">درصد افزایش اجاره (٪)</span>
              <input inputMode="decimal" dir="ltr" value={rentIncrease}
                onChange={(event) => setRentIncrease(formatRateInput(event.target.value))} />
            </label>
          </div>
          <div className="rent-renewal-presets" aria-label="درصدهای پیشنهادی افزایش">
            {[20, 25, 30].map((value) => (
              <button key={value} type="button" className="preset-chip"
                onClick={() => { setRahnIncrease(String(value)); setRentIncrease(String(value)); }}>
                افزایش {formatFaNumber(value)}٪ هر دو مبلغ
              </button>
            ))}
          </div>
          {(oldRahnValue > 0 || oldRentValue > 0) ? (
            <div className="commission-result" aria-live="polite">
              <div className="commission-result-head">
                <ArrowLeftRight size={18} strokeWidth={1.8} />
                <strong>مبالغ پیشنهادی برای تمدید</strong>
              </div>
              <div className="rent-renewal-results">
                {rahnRenewal ? <article>
                  <small>رهن جدید</small>
                  <strong>{formatToman(rahnRenewal.renewedAmount)} تومان</strong>
                  <span>افزایش {formatToman(rahnRenewal.increaseAmount)} تومان ({formatFaNumber(rahnRenewal.increasePercent)}٪)</span>
                </article> : null}
                {rentRenewal ? <article>
                  <small>اجاره ماهانه جدید</small>
                  <strong>{formatToman(rentRenewal.renewedAmount)} تومان</strong>
                  <span>افزایش {formatToman(rentRenewal.increaseAmount)} تومان ({formatFaNumber(rentRenewal.increasePercent)}٪)</span>
                </article> : null}
              </div>
              <p className="commission-disclaimer">این محاسبه صرفاً بر اساس درصدی است که وارد کرده‌اید. سقف مجاز افزایش اجاره‌بها و شرایط قانونی هر سال و هر شهر را جداگانه بررسی کنید.</p>
            </div>
          ) : <p className="commission-hint">برای مشاهده نتیجه، مبلغ رهن یا اجاره پارسال را وارد کنید.</p>}
        </section>
      </div>

      <aside className="commission-guide">
        <h3>نحوه تبدیل</h3>
        <ol>
          <li>ارزش کل قرارداد را به‌صورت معادل رهن وارد کنید</li>
          <li>نوار را به راست بکشید تا سهم اجاره بیشتر شود</li>
          <li>نوار را به چپ بکشید تا سهم رهن بیشتر شود</li>
          <li>اجاره = (رهن ÷ ۱٬۰۰۰٬۰۰۰) × نرخ تبدیل</li>
        </ol>
      </aside>
    </div>
  );
}
