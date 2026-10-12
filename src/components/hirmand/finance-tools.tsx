import { useMemo, useState } from "react";
import { ArrowLeftRight, Calculator, Copy, Landmark, PiggyBank, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  calculateDeposit,
  calculateLoan,
  DEPOSIT_PRESETS,
  depositSummary,
  loanSummary,
  type LoanMethod,
} from "@/lib/finance";
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
import { CommissionCalculator } from "./commission-calculator";
import { RahnRentConverter } from "./rahn-rent-converter";

type ToolId = "rahn" | "commission" | "deposit" | "loan";

const TOOLS: { id: ToolId; title: string; text: string; icon: typeof Wallet }[] = [
  { id: "rahn", title: "رهن به اجاره", text: "نوار تبدیل", icon: ArrowLeftRight },
  { id: "commission", title: "کمیسیون ملک", text: "تعرفه اتحادیه", icon: Wallet },
  { id: "deposit", title: "سود سپرده", text: "محاسبه بانکی", icon: PiggyBank },
  { id: "loan", title: "اقساط وام", text: "سود و قسط ماهانه", icon: Landmark },
];

export function FinanceTools() {
  const [tool, setTool] = useState<ToolId>("rahn");
  const activeTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];
  const ActiveIcon = activeTool.icon;

  return (
    <div className="tools-wrap">
      <header className="tools-header">
        <div className="tools-eyebrow">
          <span className="tools-eyebrow-dot" aria-hidden="true" />
          ابزارهای مالی هیرمند
        </div>
        <div className="tools-heading-row">
          <div>
            <h3 className="tools-title">محاسبه‌گرهای کاربردی برای تصمیم‌گیری مالی ملک</h3>
            <p className="tools-description">
              مبلغ‌ها را وارد کنید و نتیجه را شفاف ببینید؛ از تبدیل رهن و اجاره تا کمیسیون، سود سپرده و
              اقساط وام.
            </p>
          </div>
          <div className="tools-header-badge" aria-label="نتایج تقریبی">
            <Calculator size={16} strokeWidth={1.8} />
            <span>نتایج تقریبی و راهنما</span>
          </div>
        </div>
      </header>

      <div className="tools-layout">
        <nav className="tools-switch" role="tablist" aria-label="انتخاب ابزار مالی" aria-orientation="vertical">
          <div className="tools-switch-heading">
            <span>انتخاب ابزار</span>
            <small>یکی از محاسبه‌گرها را انتخاب کنید</small>
          </div>

          {TOOLS.map((item, index) => {
            const Icon = item.icon;
            const isActive = tool === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="finance-tool-panel"
                data-tool-id={item.id}
                className={cn("tools-switch-btn", isActive && "is-active")}
                onClick={() => setTool(item.id)}
              >
                <span className="tools-switch-icon" aria-hidden="true">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <span className="tools-switch-copy">
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <span className="tools-switch-meta">
                  <span className="tools-switch-index">{String(index + 1).padStart(2, "0")}</span>
                  {isActive ? <span className="tools-switch-selected">فعال</span> : null}
                  <span className="tools-switch-arrow" aria-hidden="true">←</span>
                </span>
              </button>
            );
          })}

          <div className="tools-switch-note">
            <span className="tools-note-icon">
              <Landmark size={16} strokeWidth={1.8} />
            </span>
            <p>
              اعداد به‌صورت راهنما محاسبه می‌شوند و برای مبلغ نهایی معامله یا قرارداد، شرایط بانک و
              دفتر باید بررسی شود.
            </p>
          </div>
        </nav>

        <section
          id="finance-tool-panel"
          className="tools-panel"
          role="tabpanel"
          aria-label={activeTool.title}
          tabIndex={0}
        >
          <div className="tools-panel-head">
            <div className="tools-panel-icon">
              <ActiveIcon size={20} strokeWidth={1.9} />
            </div>
            <div>
              <span>محاسبه‌گر فعال</span>
              <strong>{activeTool.title}</strong>
            </div>
            <span className="tools-panel-status">آماده محاسبه</span>
          </div>

          <div className="tools-panel-body">
            {tool === "rahn" ? <RahnRentConverter /> : null}
            {tool === "commission" ? <CommissionCalculator /> : null}
            {tool === "deposit" ? <DepositCalculator /> : null}
            {tool === "loan" ? <LoanCalculator /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
export function DepositCalculator() {
  const [preset, setPreset] = useState<(typeof DEPOSIT_PRESETS)[number]["id"]>("y1");
  const [customRate, setCustomRate] = useState("20.5");
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("12");

  const selected = DEPOSIT_PRESETS.find((item) => item.id === preset) ?? DEPOSIT_PRESETS[2];
  const rate = parseDecimal(customRate) || selected.rate;
  const monthsValue = Math.min(120, Math.max(1, Math.round(parseDecimal(months) || 0)));

  const result = useMemo(
    () => calculateDeposit(parseAmount(amount), rate, monthsValue),
    [amount, rate, monthsValue],
  );
  const amountWords = tomanToWords(parseAmount(amount));

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(depositSummary(result));
      toast.success("خلاصه محاسبه کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  }

  return (
    <div className="commission-layout">
      <div className="commission-box">
        <div className="preset-grid" role="listbox" aria-label="نوع سپرده">
          {DEPOSIT_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("preset-chip", Number(customRate) === item.rate && "is-active")}
              onClick={() => {
                setPreset(item.id);
                setCustomRate(String(item.rate));
              }}
            >
              <strong>{item.title}</strong>
              <span>
                {formatFaNumber(item.rate, 1)}٪ — {item.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="commission-fields">
          <label className="field field-span">
            <span className="field-label">مبلغ سپرده (تومان)</span>
            <input
              inputMode="numeric"
              placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"
              value={amount}
              onChange={(event) => setAmount(formatGroupedInput(event.target.value))}
            />
            {amountWords ? <em className="amount-words">{amountWords}</em> : null}
          </label>
          <label className="field">
            <span className="field-label">نرخ سود سالانه (٪)</span>
            <input
              inputMode="decimal"
              dir="ltr"
              value={customRate}
              onChange={(event) => {
                const next = formatRateInput(event.target.value);
                setCustomRate(next);
                const match = DEPOSIT_PRESETS.find((item) => item.rate === Number(next));
                if (match) setPreset(match.id);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">مدت (ماه)</span>
            <input
              inputMode="numeric"
              dir="ltr"
              value={months}
              onChange={(event) => setMonths(formatRateInput(event.target.value))}
            />
          </label>
        </div>

        {result ? (
          <div className="commission-result" aria-live="polite">
            <div className="commission-result-head">
              <PiggyBank size={18} strokeWidth={1.8} />
              <strong>سود سپرده</strong>
            </div>
            <ul className="commission-rows">
              <li>
                <span>سود روزانه تقریبی</span>
                <strong>{formatToman(result.dailyProfit)} تومان</strong>
              </li>
              <li>
                <span>سود ماهانه</span>
                <strong>{formatToman(result.monthlyProfit)} تومان</strong>
              </li>
              <li>
                <span>سود کل دوره</span>
                <strong>{formatToman(result.totalProfit)} تومان</strong>
              </li>
              <li className="is-total">
                <span>مبلغ نهایی</span>
                <strong>{formatToman(result.finalAmount)} تومان</strong>
              </li>
            </ul>
            <div className="split-bar" aria-hidden="true">
              <span className="split-principal" style={{ flexGrow: Math.max(result.principal, 1) }} />
              <span className="split-interest" style={{ flexGrow: Math.max(result.totalProfit, 1) }} />
            </div>
            <p className="split-legend">
              اصل سپرده {formatToman(result.principal)} — سود {formatToman(result.totalProfit)}
            </p>
            <button type="button" className="copy-result" onClick={copyResult}>
              <Copy size={15} />
              کپی خلاصه محاسبه
            </button>
            <p className="commission-disclaimer">
              محاسبه بر اساس فرمول رایج بانک‌های ایران است: سود ماهانه = مبلغ × نرخ ÷ ۱۲۰۰. نرخ قطعی
              هر بانک ممکن است متفاوت باشد.
            </p>
          </div>
        ) : (
          <p className="commission-hint">مبلغ سپرده را وارد کنید تا سود محاسبه شود.</p>
        )}
      </div>

      <aside className="commission-guide">
        <h3>نحوه محاسبه</h3>
        <ol>
          <li>سود ماهانه = مبلغ سپرده × نرخ سالانه ÷ ۱۲۰۰</li>
          <li>سود کل = سود ماهانه × تعداد ماه</li>
          <li>مبلغ نهایی = اصل سپرده + سود کل دوره</li>
          <li>نرخ‌های این بخش نمونه‌اند و قابل ویرایش هستند؛ شرایط و نرخ نهایی را از بانک استعلام کنید</li>
        </ol>
      </aside>
    </div>
  );
}

export function LoanCalculator() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("23");
  const [months, setMonths] = useState("36");
  const [method, setMethod] = useState<LoanMethod>("annuity");

  const monthsValue = Math.min(360, Math.max(1, Math.round(parseDecimal(months) || 0)));
  const rateValue = parseDecimal(rate);
  const result = useMemo(
    () => calculateLoan(parseAmount(amount), rateValue, monthsValue, method),
    [amount, rateValue, monthsValue, method],
  );
  const amountWords = tomanToWords(parseAmount(amount));

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(loanSummary(result));
      toast.success("خلاصه محاسبه کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  }

  return (
    <div className="commission-layout">
      <div className="commission-box">
        <div className="commission-tabs" role="tablist" aria-label="روش محاسبه وام">
          <button
            type="button"
            role="tab"
            aria-selected={method === "annuity"}
            className={cn("commission-tab", method === "annuity" && "is-active")}
            onClick={() => setMethod("annuity")}
          >
            اقساط مساوی
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === "simple"}
            className={cn("commission-tab", method === "simple" && "is-active")}
            onClick={() => setMethod("simple")}
          >
            سود ساده
          </button>
        </div>

        <div className="commission-fields">
          <label className="field field-span">
            <span className="field-label">مبلغ وام (تومان)</span>
            <input
              inputMode="numeric"
              placeholder="مثلاً ۱٬۰۰۰٬۰۰۰٬۰۰۰"
              value={amount}
              onChange={(event) => setAmount(formatGroupedInput(event.target.value))}
            />
            {amountWords ? <em className="amount-words">{amountWords}</em> : null}
          </label>
          <label className="field">
            <span className="field-label">نرخ سود سالانه (٪)</span>
            <input
              inputMode="decimal"
              dir="ltr"
              value={rate}
              onChange={(event) => setRate(formatRateInput(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">تعداد اقساط (ماه)</span>
            <input
              inputMode="numeric"
              dir="ltr"
              value={months}
              onChange={(event) => setMonths(formatRateInput(event.target.value))}
            />
          </label>
        </div>

        {result ? (
          <div className="commission-result" aria-live="polite">
            <div className="commission-result-head">
              <Calculator size={18} strokeWidth={1.8} />
              <strong>اقساط و سود وام</strong>
            </div>
            <ul className="commission-rows">
              <li className="is-total">
                <span>قسط ماهانه</span>
                <strong>{formatToman(result.installment)} تومان</strong>
              </li>
              <li>
                <span>مجموع سود</span>
                <strong>{formatToman(result.totalInterest)} تومان</strong>
              </li>
              <li>
                <span>جمع کل پرداختی</span>
                <strong>{formatToman(result.totalPay)} تومان</strong>
              </li>
              <li>
                <span>سهم سود از کل پرداخت</span>
                <strong>{formatFaNumber(result.interestShare * 100, 1)}٪</strong>
              </li>
            </ul>
            <div className="split-bar" aria-hidden="true">
              <span className="split-principal" style={{ flexGrow: Math.max(result.principal, 1) }} />
              <span className="split-interest" style={{ flexGrow: Math.max(result.totalInterest, 1) }} />
            </div>
            <p className="split-legend">
              اصل وام {formatToman(result.principal)} — سود {formatToman(result.totalInterest)}
            </p>
            <button type="button" className="copy-result" onClick={copyResult}>
              <Copy size={15} />
              کپی خلاصه محاسبه
            </button>
            <p className="commission-disclaimer">
              اقساط مساوی مطابق فرمول مانده نزولی بانک‌هاست. سود ساده در برخی تسهیلات غیرمرکب استفاده
              می‌شود. رقم نهایی را از بانک عامل بگیرید.
            </p>
          </div>
        ) : (
          <p className="commission-hint">مبلغ وام را وارد کنید تا قسط محاسبه شود.</p>
        )}
      </div>

      <aside className="commission-guide">
        <h3>نحوه محاسبه</h3>
        {method === "annuity" ? (
          <ol>
            <li>نرخ ماهانه = نرخ سالانه ÷ ۱۲۰۰</li>
            <li>قسط از فرمول اقساط مساوی روی مانده نزولی به‌دست می‌آید</li>
            <li>جمع پرداختی = قسط ماهانه × تعداد ماه</li>
            <li>سود کل = جمع پرداختی − اصل وام</li>
          </ol>
        ) : (
          <ol>
            <li>سود کل = مبلغ وام × نرخ سالانه × تعداد ماه ÷ ۱۲۰۰</li>
            <li>جمع پرداختی = اصل وام + سود کل</li>
            <li>قسط ماهانه = جمع پرداختی ÷ تعداد ماه</li>
          </ol>
        )}
      </aside>
    </div>
  );
}
