import { useMemo, useState } from "react";
import { Calculator, Copy } from "lucide-react";
import { toast } from "sonner";
import { calculateBuy, calculateRent, resultSummary } from "@/lib/commission";
import { formatGroupedInput, formatToman, parseAmount, tomanToWords } from "@/lib/money";
import { cn } from "@/lib/utils";

type DealKind = "buy" | "rent";

export function CommissionCalculator() {
  const [kind, setKind] = useState<DealKind>("buy");
  const [price, setPrice] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");

  const result = useMemo(() => {
    if (kind === "buy") return calculateBuy(parseAmount(price));
    return calculateRent(parseAmount(rent), parseAmount(deposit));
  }, [kind, price, rent, deposit]);

  const priceWords = tomanToWords(parseAmount(price));
  const rentWords = tomanToWords(parseAmount(rent));
  const depositWords = tomanToWords(parseAmount(deposit));

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(resultSummary(result));
      toast.success("خلاصه محاسبه کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  }

  return (
    <div className="commission-layout">
      <div className="commission-box">
        <div className="commission-tabs" role="tablist" aria-label="نوع معامله">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "buy"}
            className={cn("commission-tab", kind === "buy" && "is-active")}
            onClick={() => setKind("buy")}
          >
            خرید و فروش
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "rent"}
            className={cn("commission-tab", kind === "rent" && "is-active")}
            onClick={() => setKind("rent")}
          >
            رهن و اجاره
          </button>
        </div>

        <div className="commission-fields">
          {kind === "buy" ? (
            <label className="field field-span">
              <span className="field-label">مبلغ معامله (تومان)</span>
              <input
                inputMode="numeric"
                placeholder="مثلاً ۵٬۰۰۰٬۰۰۰٬۰۰۰"
                value={price}
                onChange={(e) => setPrice(formatGroupedInput(e.target.value))}
              />
              {priceWords ? <em className="amount-words">{priceWords}</em> : null}
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field-label">اجاره ماهانه (تومان)</span>
                <input
                  inputMode="numeric"
                  placeholder="مثلاً ۱۵٬۰۰۰٬۰۰۰"
                  value={rent}
                  onChange={(e) => setRent(formatGroupedInput(e.target.value))}
                />
                {rentWords ? <em className="amount-words">{rentWords}</em> : null}
              </label>
              <label className="field">
                <span className="field-label">مبلغ رهن (تومان)</span>
                <input
                  inputMode="numeric"
                  placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"
                  value={deposit}
                  onChange={(e) => setDeposit(formatGroupedInput(e.target.value))}
                />
                {depositWords ? <em className="amount-words">{depositWords}</em> : null}
              </label>
            </>
          )}
        </div>

        {result ? (
          <div className="commission-result" aria-live="polite">
            <div className="commission-result-head">
              <Calculator size={18} strokeWidth={1.8} />
              <strong>نتیجه محاسبه</strong>
            </div>
            <ul className="commission-rows">
              {result.kind === "rent" ? (
                <>
                  <li>
                    <span>معادل اجارهٔ رهن</span>
                    <strong>{formatToman(result.rentFromDeposit)} تومان</strong>
                  </li>
                  <li>
                    <span>اجاره ماهانه معادل</span>
                    <strong>{formatToman(result.monthlyEq)} تومان</strong>
                  </li>
                </>
              ) : null}
              <li>
                <span>کمیسیون پایه بنگاه</span>
                <strong>{formatToman(result.base)} تومان</strong>
              </li>
              <li>
                <span>مالیات ارزش افزوده (۹٪)</span>
                <strong>{formatToman(result.vat)} تومان</strong>
              </li>
              <li className="is-total">
                <span>جمع کل کمیسیون بنگاه</span>
                <strong>{formatToman(result.total)} تومان</strong>
              </li>
              <li>
                <span>
                  {result.kind === "buy"
                    ? "سهم هر طرف (خریدار / فروشنده)"
                    : "سهم هر طرف (موجر / مستأجر)"}
                </span>
                <strong>{formatToman(result.each)} تومان</strong>
              </li>
            </ul>
            <button type="button" className="copy-result" onClick={copyResult}>
              <Copy size={15} />
              کپی خلاصه محاسبه
            </button>
            <p className="commission-disclaimer">
              این محاسبه بر اساس نرخ‌های پیش‌فرض ابزار انجام می‌شود و جنبهٔ برآورد دارد. تعرفه و
              مالیات نهایی را مطابق مقررات جاری و قرارداد دفتر تطبیق دهید.
            </p>
          </div>
        ) : (
          <p className="commission-hint">مبالغ را وارد کنید تا کمیسیون محاسبه شود.</p>
        )}
      </div>

      <aside className="commission-guide">
        <h3>نحوه محاسبه</h3>
        {kind === "buy" ? (
          <ol>
            <li>کمیسیون پایه = ۰٫۵٪ از مبلغ کل معامله</li>
            <li>مالیات = ۹٪ از کمیسیون پایه</li>
            <li>جمع کل بین خریدار و فروشنده نصف می‌شود (هر طرف ۰٫۲۵٪ + مالیات)</li>
          </ol>
        ) : (
          <ol>
            <li>هر ۱ میلیون تومان رهن ≈ ۳۰ هزار تومان اجاره ماهانه</li>
            <li>اجاره معادل = اجاره ماهانه + معادل اجارهٔ رهن</li>
            <li>کمیسیون پایه = ۲۵٪ از اجاره معادل</li>
            <li>مالیات ۹٪ اضافه و مبلغ بین موجر و مستأجر نصف می‌شود</li>
          </ol>
        )}
      </aside>
    </div>
  );
}
