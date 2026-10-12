import { useMemo, useState } from "react";
import { Calculator, Gauge, Handshake, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { calculateLoan } from "@/lib/finance";
import { calculateBuy } from "@/lib/commission";
import { formatToman } from "@/lib/money";
import type { Property } from "@/lib/properties";
import "@/property-decision-tools.css";

function amount(value: string | null | undefined) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function freshnessLabel(updatedAt: string) {
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000));
  if (ageDays === 0) return "امروز";
  if (ageDays === 1) return "دیروز";
  if (ageDays < 7) return ageDays.toLocaleString("fa-IR") + " روز پیش";
  if (ageDays < 30) return Math.floor(ageDays / 7).toLocaleString("fa-IR") + " هفته پیش";
  return Math.floor(ageDays / 30).toLocaleString("fa-IR") + " ماه پیش";
}

function completeness(property: Property) {
  const checks = [
    Boolean(property.title.trim()),
    property.images.length > 0,
    property.areaM2 != null && property.areaM2 > 0,
    Boolean(property.price || property.deposit || property.rent),
    Boolean(property.neighborhood.trim()),
    property.bedrooms != null,
    property.bathrooms != null,
    property.description.trim().length >= 120,
    property.otherAmenities.length + Number(property.parking) + Number(property.elevator) + Number(property.storage) > 0,
    property.latitude != null && property.longitude != null,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { score, completed: checks.filter(Boolean).length, total: checks.length };
}

export function PropertyDecisionTools({ property }: { property: Property }) {
  const [downPaymentPercent, setDownPaymentPercent] = useState(30);
  const [annualRate, setAnnualRate] = useState(20.5);
  const [months, setMonths] = useState(60);
  const [vacancyPercent, setVacancyPercent] = useState(5);
  const [maintenancePercent, setMaintenancePercent] = useState(3);
  const [otherPurchaseCosts, setOtherPurchaseCosts] = useState(1);
  const [renovationBudget, setRenovationBudget] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(5);

  const propertyPrice = amount(property.price);
  const downPayment = Math.round(propertyPrice * downPaymentPercent / 100);
  const loanAmount = Math.max(0, propertyPrice - downPayment);
  const loan = useMemo(() => calculateLoan(loanAmount, annualRate, months, "annuity"), [loanAmount, annualRate, months]);

  const rent = amount(property.rent);
  const grossYield = propertyPrice > 0 && rent > 0 ? (rent * 12 / propertyPrice) * 100 : null;
  const grossPayback = grossYield && grossYield > 0 ? 100 / grossYield : null;
  const annualRent = rent * 12;
  const vacancyLoss = annualRent * vacancyPercent / 100;
  const maintenanceCost = annualRent * maintenancePercent / 100;
  const annualDebtService = loan ? loan.installment * 12 : 0;
  const netAnnualCashflow = annualRent - vacancyLoss - maintenanceCost - annualDebtService;
  const netMonthlyCashflow = netAnnualCashflow / 12;
  const info = completeness(property);
  const purchaseCommission = propertyPrice > 0 ? calculateBuy(propertyPrice) : null;
  const otherCostsAmount = propertyPrice * otherPurchaseCosts / 100;
  const totalPurchaseBudget = downPayment + (purchaseCommission?.each ?? 0) + otherCostsAmount + renovationBudget;
  const negotiatedPrice = propertyPrice * (1 - discountPercent / 100);
  const negotiationSaving = Math.max(0, propertyPrice - negotiatedPrice);
  const negotiatedPerMeter = property.areaM2 && property.areaM2 > 0 ? negotiatedPrice / property.areaM2 : null;

  const money = (value: number) => formatToman(value) + " تومان";

  return (
    <section className="property-decision-tools" aria-labelledby="property-decision-tools-title">
      <header className="property-decision-tools-head">
        <div>
          <span className="kicker">ابزار تصمیم‌گیری</span>
          <h2 id="property-decision-tools-title">شش ابزار برای بررسی این فایل</h2>
          <p>اعداد این بخش بر پایه اطلاعات همین فایل و سناریوی انتخابی شما محاسبه می‌شوند.</p>
        </div>
        <span className="property-decision-freshness"><Gauge size={15} /> به‌روزرسانی فایل: {freshnessLabel(property.updatedAt)}</span>
      </header>

      <div className="property-decision-grid">
        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><Calculator size={18} /></span>
            <div><strong>توان خرید</strong><small>سناریوی خرید همین فایل</small></div>
          </div>
          {propertyPrice > 0 ? (
            <>
              <div className="property-decision-fields">
                <label>
                  <span>پیش‌پرداخت: {downPaymentPercent.toLocaleString("fa-IR")}٪</span>
                  <input type="range" min="10" max="80" step="5" value={downPaymentPercent} onChange={(event) => setDownPaymentPercent(Number(event.target.value))} />
                </label>
                <label>
                  <span>نرخ سالانه: {annualRate.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪</span>
                  <input type="range" min="0" max="30" step="0.5" value={annualRate} onChange={(event) => setAnnualRate(Number(event.target.value))} />
                </label>
                <label>
                  <span>مدت: {months.toLocaleString("fa-IR")} ماه</span>
                  <input type="range" min="12" max="120" step="12" value={months} onChange={(event) => setMonths(Number(event.target.value))} />
                </label>
              </div>
              <div className="property-decision-metrics">
                <div><span>پیش‌پرداخت</span><strong>{money(downPayment)}</strong></div>
                <div><span>مبلغ وام</span><strong>{money(loanAmount)}</strong></div>
                <div className="is-highlight"><span>قسط ماهانه تقریبی</span><strong>{loan ? money(loan.installment) : "—"}</strong></div>
              </div>
              <small className="property-decision-note">این محاسبه فقط یک سناریوی عددی است و هزینه‌های معامله، شرایط بانکی و اعتبارسنجی را شامل نمی‌شود.</small>
            </>
          ) : (
            <p className="property-decision-empty">برای این فایل قیمت فروش عددی ثبت نشده است.</p>
          )}
        </article>

        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><TrendingUp size={18} /></span>
            <div><strong>بازده اجاره</strong><small>شاخص اولیه سرمایه‌گذاری</small></div>
          </div>
          {propertyPrice > 0 && rent > 0 ? (
            <div className="property-decision-investment">
              <div className="property-decision-big-number">{grossYield!.toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪ <small>بازده ناخالص سالانه</small></div>
              <div className="property-decision-metrics">
                <div><span>اجاره ماهانه</span><strong>{money(rent)}</strong></div>
                <div><span>درآمد سالانه</span><strong>{money(rent * 12)}</strong></div>
                <div><span>بازگشت اسمی سرمایه</span><strong>{grossPayback!.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} سال</strong></div>
              </div>
              <small className="property-decision-note">این شاخص ناخالص است و هزینه‌های نگهداری، خالی‌ماندن ملک، مالیات و هزینه‌های معامله در آن لحاظ نشده‌اند.</small>
            </div>
          ) : (
            <p className="property-decision-empty">برای محاسبه بازده، هم قیمت فروش و هم اجاره ماهانه باید در فایل ثبت شده باشد.</p>
          )}
        </article>

        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><Wallet size={18} /></span>
            <div><strong>جریان نقدی خالص</strong><small>سناریوی سرمایه‌گذاری با همین قیمت و اجاره</small></div>
          </div>
          {propertyPrice > 0 && rent > 0 ? (
            <>
              <div className="property-decision-fields">
                <label>
                  <span>خالی‌ماندن سالانه: {vacancyPercent.toLocaleString("fa-IR")}٪</span>
                  <input type="range" min="0" max="25" step="1" value={vacancyPercent} onChange={(event) => setVacancyPercent(Number(event.target.value))} />
                </label>
                <label>
                  <span>نگهداری سالانه: {maintenancePercent.toLocaleString("fa-IR")}٪</span>
                  <input type="range" min="0" max="15" step="1" value={maintenancePercent} onChange={(event) => setMaintenancePercent(Number(event.target.value))} />
                </label>
              </div>
              <div className="property-decision-metrics">
                <div><span>درآمد مؤثر سالانه</span><strong>{money(annualRent - vacancyLoss)}</strong></div>
                <div><span>هزینه نگهداری</span><strong>{money(maintenanceCost)}</strong></div>
                <div className="is-highlight"><span>جریان نقدی ماهانه پس از قسط</span><strong>{money(netMonthlyCashflow)}</strong></div>
              </div>
              <small className="property-decision-note">قسط از سناریوی وام همین بخش گرفته می‌شود. مالیات، بیمه، هزینه‌های معامله و تعمیرات اساسی در این برآورد نیست.</small>
            </>
          ) : (
            <p className="property-decision-empty">برای محاسبه جریان نقدی، هم قیمت فروش و هم اجاره ماهانه باید ثبت شده باشد.</p>
          )}
        </article>

        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><Calculator size={18} /></span>
            <div><strong>بودجه نهایی خرید</strong><small>برآورد وجه موردنیاز برای شروع معامله</small></div>
          </div>
          {propertyPrice > 0 ? (
            <>
              <div className="property-decision-fields">
                <label>
                  <span>هزینه‌های جانبی قابل‌تنظیم: {otherPurchaseCosts.toLocaleString("fa-IR")}٪</span>
                  <input type="range" min="0" max="5" step="0.25" value={otherPurchaseCosts} onChange={(event) => setOtherPurchaseCosts(Number(event.target.value))} />
                </label>
                <label>
                  <span>ذخیره بازسازی: {money(renovationBudget)}</span>
                  <input type="range" min="0" max={Math.max(0, propertyPrice * 0.15)} step={Math.max(1, Math.round(propertyPrice / 100))} value={renovationBudget} onChange={(event) => setRenovationBudget(Number(event.target.value))} />
                </label>
              </div>
              <div className="property-decision-metrics">
                <div><span>سهم کمیسیون خریدار</span><strong>{money(purchaseCommission?.each ?? 0)}</strong></div>
                <div><span>سایر هزینه‌ها</span><strong>{money(otherCostsAmount)}</strong></div>
                <div className="is-highlight"><span>بودجه شروع معامله</span><strong>{money(totalPurchaseBudget)}</strong></div>
              </div>
              <small className="property-decision-note">کمیسیون با نرخ پیش‌فرض ابزار سایت محاسبه شده و «سایر هزینه‌ها» فقط سناریوی قابل‌تنظیم شماست؛ مالیات‌ها و هزینه‌های حقوقی خارج از این دو مورد هستند مگر خودتان در سناریو واردشان کنید.</small>
            </>
          ) : (
            <p className="property-decision-empty">برای برآورد بودجه نهایی، قیمت فروش عددی لازم است.</p>
          )}
        </article>

        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><Handshake size={18} /></span>
            <div><strong>سناریوی مذاکره</strong><small>مقایسه قیمت آگهی با پیشنهاد هدف</small></div>
          </div>
          {propertyPrice > 0 ? (
            <>
              <div className="property-decision-fields">
                <label>
                  <span>درصد تخفیف هدف: {discountPercent.toLocaleString("fa-IR")}٪</span>
                  <input type="range" min="0" max="20" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(Number(event.target.value))} />
                </label>
              </div>
              <div className="property-decision-metrics">
                <div><span>قیمت اعلامی</span><strong>{money(propertyPrice)}</strong></div>
                <div><span>پیشنهاد هدف</span><strong>{money(negotiatedPrice)}</strong></div>
                <div className="is-highlight"><span>صرفه‌جویی نسبت به قیمت اعلامی</span><strong>{money(negotiationSaving)}</strong></div>
              </div>
              {negotiatedPerMeter ? <small className="property-decision-note">قیمت هدف هر متر: {money(negotiatedPerMeter)}. این فقط سناریوی مذاکره شماست و به معنی وجود چنین تخفیفی از طرف مالک نیست.</small> : null}
            </>
          ) : (
            <p className="property-decision-empty">برای ساخت سناریوی مذاکره، قیمت فروش عددی لازم است.</p>
          )}
        </article>

        <article className="property-decision-card">
          <div className="property-decision-card-head">
            <span className="property-decision-icon"><ShieldCheck size={18} /></span>
            <div><strong>کامل‌بودن اطلاعات</strong><small>بر اساس داده‌های ثبت‌شده</small></div>
          </div>
          <div className="property-completeness">
            <div className="property-completeness-score">{info.score.toLocaleString("fa-IR")}٪</div>
            <div className="property-completeness-bar"><span style={{ width: info.score + "%" }} /></div>
            <p>{info.completed.toLocaleString("fa-IR")} مورد از {info.total.toLocaleString("fa-IR")} شاخص اطلاعاتی تکمیل شده است.</p>
          </div>
          <div className="property-decision-metrics">
            <div><span>تصویر</span><strong>{property.images.length ? "ثبت شده" : "ندارد"}</strong></div>
            <div><span>مختصات نقشه</span><strong>{property.latitude != null && property.longitude != null ? "ثبت شده" : "ندارد"}</strong></div>
            <div><span>توضیحات</span><strong>{property.description.trim().length >= 120 ? "کامل" : "کوتاه"}</strong></div>
          </div>
          <small className="property-decision-note">این امتیاز کیفیت یا ارزش ملک را قضاوت نمی‌کند؛ فقط میزان کامل‌بودن داده‌های قابل‌نمایش فایل را نشان می‌دهد.</small>
        </article>
      </div>
    </section>
  );
}
