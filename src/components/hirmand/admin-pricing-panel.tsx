import { useMemo, useState } from "react";
import { ArrowLeftRight, Calculator, Info } from "lucide-react";
import { DEFAULT_RAHN_RATE, RAHN_RATE_PRESETS } from "@/lib/finance";
import { formatToman, parseAmount } from "@/lib/money";
import type { PropertyTransaction } from "@/lib/properties";

type Props = {
  transactionType: PropertyTransaction;
  price: string;
  deposit: string;
  rent: string;
  onPriceChange: (value: string) => void;
  onDepositChange: (value: string) => void;
  onRentChange: (value: string) => void;
};

const TX_HELP: Record<PropertyTransaction, string> = {
  sell: "قیمت نهایی فروش را وارد کنید؛ عدد دقیق‌تر باعث می‌شود فایل در جستجوی عمومی بهتر قابل مقایسه باشد.",
  buy: "برای فایل‌های درخواست خرید، بودجه خرید مشتری را در همین فیلد نگه دارید.",
  rent: "برای فایل اجاره، رهن و اجاره ماهانه را جداگانه و دقیق وارد کنید.",
  mortgage: "برای رهن کامل، مبلغ رهن را وارد کنید؛ امکان مقایسه با ترکیب رهن/اجاره هم فعال است.",
};

export function AdminPricingPanel({
  transactionType,
  price,
  deposit,
  rent,
  onPriceChange,
  onDepositChange,
  onRentChange,
}: Props) {
  const [rate, setRate] = useState(DEFAULT_RAHN_RATE);
  const depositNumber = parseAmount(deposit);
  const rentNumber = parseAmount(rent);

  const totalEquivalent = useMemo(
    () => depositNumber + (rentNumber * 1_000_000) / rate,
    [depositNumber, rentNumber, rate],
  );
  const allRahn = Math.max(0, totalEquivalent);
  const allRent = (depositNumber / 1_000_000) * rate + rentNumber;

  const priceLabel =
    transactionType === "sell"
      ? "قیمت فروش"
      : transactionType === "buy"
        ? "بودجه خرید مشتری"
        : "قیمت";

  return (
    <div className="admin-pricing-panel">
      <p className="admin-price-help">
        <Info size={15} />
        <span>{TX_HELP[transactionType]}</span>
      </p>

      {transactionType === "sell" || transactionType === "buy" ? (
        <label className="field">
          <span>{priceLabel} (تومان)</span>
          <input
            inputMode="numeric"
            value={price}
            onChange={(event) => onPriceChange(event.target.value)}
            placeholder="مثلاً ۵٬۰۰۰٬۰۰۰٬۰۰۰"
          />
          {parseAmount(price) > 0 ? <small className="admin-money-hint">{formatToman(parseAmount(price))} تومان</small> : null}
        </label>
      ) : (
        <div className="admin-form-grid">
          <label className="field">
            <span>رهن (تومان)</span>
            <input
              inputMode="numeric"
              value={deposit}
              onChange={(event) => onDepositChange(event.target.value)}
              placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"
            />
            {depositNumber > 0 ? <small className="admin-money-hint">{formatToman(depositNumber)} تومان</small> : null}
          </label>
          {transactionType === "rent" ? (
            <label className="field">
              <span>اجاره ماهانه (تومان)</span>
              <input
                inputMode="numeric"
                value={rent}
                onChange={(event) => onRentChange(event.target.value)}
                placeholder="مثلاً ۱۰٬۰۰۰٬۰۰۰"
              />
              {rentNumber > 0 ? <small className="admin-money-hint">{formatToman(rentNumber)} تومان</small> : null}
            </label>
          ) : null}
        </div>
      )}

      {transactionType === "rent" || transactionType === "mortgage" ? (
        <div className="admin-price-calculator">
          <div className="admin-price-calculator-head">
            <div>
              <span className="kicker">مقایسه رهن و اجاره</span>
              <strong>معادل رهنی فایل: {formatToman(allRahn)} تومان</strong>
            </div>
            <Calculator size={20} />
          </div>

          <div className="admin-rate-row">
            <span>نرخ تبدیل</span>
            {RAHN_RATE_PRESETS.map((item) => (
              <button
                key={item}
                type="button"
                className={rate === item ? "is-active" : ""}
                onClick={() => setRate(item)}
              >
                {formatToman(item)}
              </button>
            ))}
            <small>تومان به ازای هر ۱ میلیون رهن</small>
          </div>

          <div className="admin-price-conversion-grid">
            <div>
              <span>اگر کامل رهن شود</span>
              <strong>{formatToman(allRahn)} تومان</strong>
            </div>
            <div>
              <span>اگر کامل اجاره شود</span>
              <strong>{formatToman(allRent)} تومان / ماه</strong>
            </div>
          </div>

          <p className="admin-price-calc-note">
            <ArrowLeftRight size={14} />
            این محاسبه فقط برای قیمت‌گذاری و مقایسه است و در قرارداد نهایی باید با شرایط مالک تطبیق داده شود.
          </p>
        </div>
      ) : null}
    </div>
  );
}
