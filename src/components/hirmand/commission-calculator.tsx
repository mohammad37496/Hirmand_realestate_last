import { useMemo, useState } from "react";
import { Calculator, Copy } from "lucide-react";
import { toast } from "sonner";
import { calculateBuy, calculateRent, commissionRateStatus, COMMISSION_LEGAL_BASIS_NOTICE, resultSummary, type CommissionRateConfig } from "@/lib/commission";
import { formatGroupedInput, formatToman, parseAmount, tomanToWords } from "@/lib/money";
import { cn } from "@/lib/utils";

type DealKind = "buy" | "rent";

export function CommissionCalculator({ rates }: { rates: CommissionRateConfig }) {
  const [kind, setKind] = useState<DealKind>("buy");
  const [price, setPrice] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");

  const result = useMemo(() => {
    if (kind === "buy") return calculateBuy(parseAmount(price), rates);
    return calculateRent(parseAmount(rent), parseAmount(deposit), rates);
  }, [kind, price, rent, deposit, rates]);

  const rateStatus = commissionRateStatus(rates);
  const percent = (value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value) + "٪";
  const rateStatusText = rateStatus === "verified"
    ? `منبع و بازه اعتبار نرخ ثبت‌شده برای ${rates.city} توسط مدیریت تأیید داخلی شده است؛ این تأیید رسمی یا قانونی نیست.`
    : rateStatus === "upcoming"
      ? `این نرخ از ${rates.effectiveFrom} معتبر می‌شود؛ محاسبه فعلی صرفاً برآورد است.`
      : rateStatus === "expired"
        ? `اعتبار نرخ ثبت‌شده در ${rates.effectiveTo} پایان یافته؛ محاسبه فعلی صرفاً برآورد است.`
        : `نرخ‌های پایه برای ${rates.city} هنوز با منبع و بازه اعتبار تأیید نشده‌اند؛ نتیجه صرفاً برآورد است.`;

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
              <strong>برآورد کمیسیون</strong>
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
                    <span>کمیسیون پایه برآوردی بنگاه</span>
                <strong>{formatToman(result.base)} تومان</strong>
              </li>
              <li>
                <span>برآورد مالیات ارزش افزوده ({percent(result.rates.vatPercent)})</span>
                <strong>{formatToman(result.vat)} تومان</strong>
              </li>
              <li className="is-total">
                <span>جمع کل برآوردی بنگاه</span>
                <strong>{formatToman(result.total)} تومان</strong>
              </li>
              <li>
                <span>
                  {result.kind === "buy"
                    ? "سهم برآوردی هر طرف (خریدار / فروشنده)"
                    : "سهم برآوردی هر طرف (موجر / مستأجر)"}
                </span>
                <strong>{formatToman(result.each)} تومان</strong>
              </li>
            </ul>
            <button type="button" className="copy-result" onClick={copyResult}>
              <Copy size={15} />
              کپی خلاصه محاسبه
            </button>
          </div>
        ) : (
          <p className="commission-hint">مبالغ را وارد کنید تا کمیسیون محاسبه شود.</p>
        )}
        <p className="commission-disclaimer">
          {rateStatusText} {rates.sourceLabel ? <>منبع ثبت‌شده: {rates.sourceUrl ? <a href={rates.sourceUrl} target="_blank" rel="noreferrer">{rates.sourceLabel}</a> : rates.sourceLabel}.</> : null}
          {rates.effectiveFrom ? ` شروع اعتبار: ${rates.effectiveFrom}.` : null}
          {rates.effectiveTo ? ` پایان اعتبار: ${rates.effectiveTo}.` : null}
          {" "}تأیید داخلی مدیریت، حتی با وجود منبع و بازه اعتبار، به معنی تأیید رسمی تعرفه نیست.
        </p>
        <p className="commission-disclaimer commission-legal-basis-note" role="note">{COMMISSION_LEGAL_BASIS_NOTICE}</p>
      </div>

      <aside className="commission-guide">
        <h3>نحوه برآورد نمونه</h3>
        {kind === "buy" ? (
          <ol>
            <li>کمیسیون پایه برآوردی کل = {percent(rates.saleTotalPercent)} از مبلغ معامله</li>
            <li>برآورد مالیات ارزش افزوده = {percent(rates.vatPercent)} از کمیسیون پایه</li>
            <li>در این برآورد، سهم خریدار و فروشنده برابر فرض می‌شود؛ مگر آنکه در قرارداد به نحو دیگری توافق شود</li>
          </ol>
        ) : (
          <ol>
            <li>کمیسیون پایه برآوردی هر طرف = {percent(rates.rentMonthlyPercent)} اجاره ماهانه + {percent(rates.rentDepositPercent)} مبلغ رهن</li>
            <li>معادل اجارهٔ رهن بر اساس نسبت نرخ رهن به نرخ اجاره محاسبه می‌شود</li>
            <li>برآورد مالیات ارزش افزوده = {percent(rates.vatPercent)} از کمیسیون پایه</li>
            <li>در این برآورد، سهم موجر و مستأجر برابر فرض می‌شود؛ مگر آنکه در قرارداد به نحو دیگری توافق شود</li>
          </ol>
        )}
      </aside>
    </div>
  );
}
