import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES, SERVICES, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { formatToman, parseAmount, tomanToWords } from "@/lib/money";
import { PROPERTY_OTHER_AMENITY_OPTIONS } from "@/lib/property-options";
import { listNeighborhoodNames } from "@/lib/neighborhoods";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { formatPersianDate } from "@/lib/persian-date";
import { PersianDatePicker } from "./persian-date-picker";
import { useConsultants } from "./consultants-context";

export type InquiryDraft = {
  deal: string;
  propertyType: string;
  neighborhood: string;
};

const DEAL_OPTIONS = SERVICES.map((item) => item.title);
const TYPE_OPTIONS = PROPERTY_TYPES.map((item) => item.title);
const BEDROOM_OPTIONS = [
  { value: "", label: "فرقی ندارد" },
  { value: "0", label: "بدون خواب" },
  { value: "1", label: "۱ خواب" },
  { value: "2", label: "۲ خواب" },
  { value: "3", label: "۳ خواب" },
] as const;

function toLatinDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function normalizePhone(value: string) {
  return toLatinDigits(value)
    .replace(/[\s\-()]/g, "")
    .replace(/^(\+98|0098|98)/, "0");
}

function isMobile(value: string) {
  return /^09\d{9}$/.test(normalizePhone(value));
}

function formatBudgetInput(value: string) {
  const normalized = toLatinDigits(value).replace(/[^\d]/g, "");
  return normalized ? Number(normalized).toLocaleString("fa-IR") : "";
}

function handleBudgetChange(
  event: ChangeEvent<HTMLInputElement>,
  setValue: (value: string) => void,
) {
  const input = event.currentTarget;
  const rawValue = input.value;
  const caret = input.selectionStart ?? rawValue.length;
  const digitsBeforeCaret = toLatinDigits(rawValue.slice(0, caret)).replace(/[^\d]/g, "").length;
  const formatted = formatBudgetInput(rawValue);
  setValue(formatted);

  requestAnimationFrame(() => {
    let position = 0;
    let seenDigits = 0;
    while (position < formatted.length && seenDigits < digitsBeforeCaret) {
      if (/\d/.test(toLatinDigits(formatted[position]))) seenDigits += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
  });
}

function normalizeBudgetRange(minRaw: string, maxRaw: string) {
  const minValue = parseAmount(minRaw);
  const maxValue = parseAmount(maxRaw);
  if (!minValue && !maxValue) return { min: 0, max: 0 };
  const min = minValue || maxValue;
  const max = maxValue || minValue;
  return { min, max };
}

function budgetRangeHint(minRaw: string, maxRaw: string, example: string) {
  const range = normalizeBudgetRange(minRaw, maxRaw);
  if (!range.max) return example;
  if (range.min === range.max) return "حدود " + tomanToWords(range.min);
  return "حدود " + tomanToWords(range.min) + " تا " + tomanToWords(range.max);
}


export function InquiryForm({ draft }: { draft: InquiryDraft }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [peopleCount, setPeopleCount] = useState("");
  const [job, setJob] = useState("");
  const [budgetDepositMin, setBudgetDepositMin] = useState("");
  const [budgetDepositMax, setBudgetDepositMax] = useState("");
  const [budgetRentMin, setBudgetRentMin] = useState("");
  const [budgetRentMax, setBudgetRentMax] = useState("");
  const [budgetPurchaseMin, setBudgetPurchaseMin] = useState("");
  const [budgetPurchaseMax, setBudgetPurchaseMax] = useState("");
  const [budgetSaleMin, setBudgetSaleMin] = useState("");
  const [budgetSaleMax, setBudgetSaleMax] = useState("");
  const [leaseDeadline, setLeaseDeadline] = useState("");
  const [deal, setDeal] = useState(draft.deal);
  const [propertyType, setPropertyType] = useState(draft.propertyType);
  const [neighborhood, setNeighborhood] = useState(draft.neighborhood);
  const [floorPreference, setFloorPreference] = useState("");
  const [requestedBedrooms, setRequestedBedrooms] = useState("");
  const [requestedAmenities, setRequestedAmenities] = useState<string[]>([]);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>(NEIGHBORHOOD_NAMES);
  const consultants = useConsultants();
  const [consultant, setConsultant] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [trackingToken, setTrackingToken] = useState("");

  useEffect(() => {
    if (!consultants.length) return;
    setConsultant((current) =>
      consultants.some((person) => person.id === current) ? current : consultants[0].id,
    );
  }, [consultants]);

  useEffect(() => {
    let cancelled = false;
    void listNeighborhoodNames()
      .then((names) => {
        if (!cancelled && names.length) setNeighborhoodOptions(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draft.deal) setDeal(draft.deal);
    if (draft.propertyType) setPropertyType(draft.propertyType);
    if (draft.neighborhood) setNeighborhood(draft.neighborhood);
  }, [draft]);

  const isRentLikeDeal = deal === "رهن" || deal === "اجاره";
  const isBuyDeal = deal === "خرید";
  const isSellDeal = deal === "فروش";

  function handleDealChange(value: string) {
    setDeal(value);
    if (value === "خرید") {
      setBudgetDepositMin("");
      setBudgetDepositMax("");
      setBudgetRentMin("");
      setBudgetRentMax("");
      setBudgetSaleMin("");
      setBudgetSaleMax("");
      setLeaseDeadline("");
      return;
    }
    if (value === "فروش") {
      setBudgetDepositMin("");
      setBudgetDepositMax("");
      setBudgetRentMin("");
      setBudgetRentMax("");
      setBudgetPurchaseMin("");
      setBudgetPurchaseMax("");
      setLeaseDeadline("");
      return;
    }
    if (value === "رهن" || value === "اجاره") {
      setBudgetPurchaseMin("");
      setBudgetPurchaseMax("");
      setBudgetSaleMin("");
      setBudgetSaleMax("");
      return;
    }
    setBudgetDepositMin("");
    setBudgetDepositMax("");
    setBudgetRentMin("");
    setBudgetRentMax("");
    setBudgetPurchaseMin("");
    setBudgetPurchaseMax("");
    setBudgetSaleMin("");
    setBudgetSaleMax("");
    setLeaseDeadline("");
  }

  const selected = consultants.find((person) => person.id === consultant) ?? consultants[0];

  function buildMessage() {
    return [
      `سلام، درخواست مشاوره از وب‌سایت ${SITE.nameFa}`,
      name ? `نام: ${name}` : "",
      phone ? `تلفن: ${normalizePhone(phone)}` : "",
      peopleCount ? `تعداد نفرات: ${peopleCount}` : "",
      job.trim() ? `شغل: ${job.trim()}` : "",
      isRentLikeDeal && (budgetDepositMin || budgetDepositMax)
        ? (() => {
            const range = normalizeBudgetRange(budgetDepositMin, budgetDepositMax);
            return `رهن حدودی: ${formatToman(range.min)} تا ${formatToman(range.max)} تومان`;
          })()
        : "",
      isRentLikeDeal && (budgetRentMin || budgetRentMax)
        ? (() => {
            const range = normalizeBudgetRange(budgetRentMin, budgetRentMax);
            return `اجاره حدودی: ${formatToman(range.min)} تا ${formatToman(range.max)} تومان`;
          })()
        : "",
      isBuyDeal && (budgetPurchaseMin || budgetPurchaseMax)
        ? (() => {
            const range = normalizeBudgetRange(budgetPurchaseMin, budgetPurchaseMax);
            return `مبلغ خرید حدودی: ${formatToman(range.min)} تا ${formatToman(range.max)} تومان`;
          })()
        : "",
      isSellDeal && (budgetSaleMin || budgetSaleMax)
        ? (() => {
            const range = normalizeBudgetRange(budgetSaleMin, budgetSaleMax);
            return `مبلغ فروش حدودی: ${formatToman(range.min)} تا ${formatToman(range.max)} تومان`;
          })()
        : "",
      isRentLikeDeal && leaseDeadline ? `مهلت رهن و اجاره: ${formatPersianDate(leaseDeadline)}` : "",
      deal ? `نوع معامله: ${deal}` : "",
      propertyType ? `نوع ملک: ${propertyType}` : "",
      neighborhood ? `محله: ${neighborhood}` : "",
      requestedBedrooms
        ? `تعداد خواب موردنظر: ${BEDROOM_OPTIONS.find((item) => item.value === requestedBedrooms)?.label ?? requestedBedrooms}`
        : "",
      floorPreference ? `طبقه: ${floorPreference}` : "",
      requestedAmenities.length
        ? "امکانات موردنظر: " + requestedAmenities.map((value) => {
            const item = PROPERTY_OTHER_AMENITY_OPTIONS.find((option) => option.value === value);
            return item?.label ?? ({
              parking: "پارکینگ",
              elevator: "آسانسور",
              storage: "انباری",
            } as Record<string, string>)[value] ?? value;
          }).join("، ")
        : "",
      `مشاور: ${selected?.name ?? "مشاور هیرمند"}`,
      note ? `توضیح: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("نام را وارد کنید.");
      return;
    }
    if (!isMobile(phone)) {
      setError("شماره موبایل را به‌صورت ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.");
      return;
    }
    const normalizedPeopleCount = toLatinDigits(peopleCount).replace(/[\s٬,]/g, "");
    const parsedPeopleCount = /^\d+$/.test(normalizedPeopleCount) ? Number(normalizedPeopleCount) : Number.NaN;
    if (!Number.isInteger(parsedPeopleCount) || parsedPeopleCount < 1 || parsedPeopleCount > 20) {
      setError("تعداد نفرات را بین ۱ تا ۲۰ نفر مشخص کنید.");
      return;
    }
    if (!job.trim()) {
      setError("شغل خود را وارد کنید.");
      return;
    }
    if (!deal) {
      setError("نوع معامله را انتخاب کنید.");
      return;
    }
    const depositRange = isRentLikeDeal
      ? normalizeBudgetRange(budgetDepositMin, budgetDepositMax)
      : { min: 0, max: 0 };
    const rentRange = isRentLikeDeal
      ? normalizeBudgetRange(budgetRentMin, budgetRentMax)
      : { min: 0, max: 0 };
    const purchaseRange = isBuyDeal
      ? normalizeBudgetRange(budgetPurchaseMin, budgetPurchaseMax)
      : { min: 0, max: 0 };
    const saleRange = isSellDeal
      ? normalizeBudgetRange(budgetSaleMin, budgetSaleMax)
      : { min: 0, max: 0 };

    if (isRentLikeDeal && !depositRange.max && !rentRange.max) {
      setError("حداقل یکی از بازه‌های رهن یا اجاره را مشخص کنید.");
      return;
    }
    if (isRentLikeDeal && depositRange.min > depositRange.max) {
      setError("بازه رهن نامعتبر است؛ مبلغ «از» نمی‌تواند بیشتر از «تا» باشد.");
      return;
    }
    if (isRentLikeDeal && rentRange.min > rentRange.max) {
      setError("بازه اجاره نامعتبر است؛ مبلغ «از» نمی‌تواند بیشتر از «تا» باشد.");
      return;
    }
    if (isBuyDeal && !purchaseRange.max) {
      setError("بازه مبلغ خرید را مشخص کنید.");
      return;
    }
    if (isBuyDeal && purchaseRange.min > purchaseRange.max) {
      setError("بازه خرید نامعتبر است؛ مبلغ «از» نمی‌تواند بیشتر از «تا» باشد.");
      return;
    }
    if (isSellDeal && !saleRange.max) {
      setError("بازه مبلغ فروش را مشخص کنید.");
      return;
    }
    if (isSellDeal && saleRange.min > saleRange.max) {
      setError("بازه فروش نامعتبر است؛ مبلغ «از» نمی‌تواند بیشتر از «تا» باشد.");
      return;
    }

    setError("");
    const payload = {
      name: name.trim(),
      phone: normalizePhone(phone),
      peopleCount: parsedPeopleCount,
      job: job.trim(),
      budgetDeposit: depositRange.max || undefined,
      budgetRent: rentRange.max || undefined,
      budgetPurchase: purchaseRange.max || undefined,
      budgetSale: saleRange.max || undefined,
      budgetDepositMin: depositRange.min || undefined,
      budgetDepositMax: depositRange.max || undefined,
      budgetRentMin: rentRange.min || undefined,
      budgetRentMax: rentRange.max || undefined,
      budgetPurchaseMin: purchaseRange.min || undefined,
      budgetPurchaseMax: purchaseRange.max || undefined,
      budgetSaleMin: saleRange.min || undefined,
      budgetSaleMax: saleRange.max || undefined,
      leaseDeadline: isRentLikeDeal && leaseDeadline ? leaseDeadline : undefined,
      deal,
      propertyType,
      neighborhood,
      floorPreference,
      requestedBedrooms: requestedBedrooms ? Number(requestedBedrooms) : undefined,
      requestedAmenities,
      consultant: selected.name,
      note: note.trim(),
    };
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          phone: payload.phone,
          peopleCount: payload.peopleCount,
          job: payload.job,
          budgetDeposit: payload.budgetDeposit,
          budgetRent: payload.budgetRent,
          budgetPurchase: payload.budgetPurchase,
          budgetSale: payload.budgetSale,
          budgetDepositMin: payload.budgetDepositMin,
          budgetDepositMax: payload.budgetDepositMax,
          budgetRentMin: payload.budgetRentMin,
          budgetRentMax: payload.budgetRentMax,
          budgetPurchaseMin: payload.budgetPurchaseMin,
          budgetPurchaseMax: payload.budgetPurchaseMax,
          budgetSaleMin: payload.budgetSaleMin,
          budgetSaleMax: payload.budgetSaleMax,
          leaseDeadline: payload.leaseDeadline,
          deal: payload.deal,
          propertyType: payload.propertyType,
          neighborhood: payload.neighborhood,
          floorPreference: payload.floorPreference,
          requestedBedrooms: payload.requestedBedrooms,
          requestedAmenities: payload.requestedAmenities,
          consultant: payload.consultant,
          note: payload.note,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; statusMessage?: string; message?: string; trackingToken?: string }
        | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.statusMessage || result?.message || "ثبت درخواست انجام نشد.");
      }
      if (result?.trackingToken) setTrackingToken(result.trackingToken);
      trackAnalyticsEvent("inquiry_submit");
      toast.success("درخواست شما با موفقیت برای تیم هیرمند ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت درخواست انجام نشد.");
      return;
    }
  }

  const waHref = `${selected?.whatsapp ?? SITE.whatsappDirect}?text=${encodeURIComponent(buildMessage())}`;

  return (
    <form className="inquiry-form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="inq-name">نام و نام خانوادگی</label>
        <input
          id="inq-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="مثلاً علی رضایی"
        />
      </div>
      <div className="field">
        <label htmlFor="inq-phone">شماره موبایل</label>
        <input
          id="inq-phone"
          name="phone"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="0913 000 0000"
          aria-describedby="inq-phone-hint"
        />
      </div>
      <p id="inq-phone-hint" className="form-hint field-span">
        شماره با ارقام فارسی یا انگلیسی قابل وارد کردن است؛ درخواست شما در سامانه هیرمند ثبت می‌شود و اطلاعات فقط برای پیگیری همین درخواست استفاده خواهد شد.
      </p>
      <div className="field">
        <label htmlFor="inq-people-count">تعداد نفرات</label>
        <input
          id="inq-people-count"
          name="peopleCount"
          type="text"
          inputMode="numeric"
          dir="rtl"
          autoComplete="off"
          value={peopleCount}
          onChange={(event) => {
            const value = event.target.value;
            if (/^[0-9۰-۹٠-٩\s٬,]*$/.test(value)) setPeopleCount(value);
          }}
          onBlur={() => {
            const normalized = toLatinDigits(peopleCount).replace(/[\s٬,]/g, "");
            if (/^\d+$/.test(normalized)) {
              setPeopleCount(Number(normalized).toLocaleString("fa-IR"));
            }
          }}
          aria-describedby="inq-people-count-hint"
          placeholder="مثلاً ۴"
        />
        <small id="inq-people-count-hint" className="form-hint">
          ۱ تا ۲۰ نفر؛ ارقام فارسی، عربی یا انگلیسی پذیرفته می‌شود.
        </small>
      </div>
      <div className="field">
        <label htmlFor="inq-job">شغل</label>
        <input
          id="inq-job"
          name="job"
          autoComplete="organization-title"
          value={job}
          onChange={(event) => setJob(event.target.value)}
          placeholder="مثلاً کارمند، پزشک، دانشجو…"
        />
      </div>
      <div className="field">
        <label htmlFor="inq-deal">نوع معامله</label>
        <select id="inq-deal" value={deal} onChange={(event) => handleDealChange(event.target.value)}>
          <option value="">انتخاب کنید</option>
          {DEAL_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      {isRentLikeDeal ? (
        <>
          <div className="field">
            <label htmlFor="inq-budget-deposit-min">رهن حدودی — از</label>
            <input
              id="inq-budget-deposit-min"
              name="budgetDepositMin"
              inputMode="numeric"
              dir="rtl"
              value={budgetDepositMin}
              onChange={(event) => handleBudgetChange(event, setBudgetDepositMin)}
              placeholder="مثلاً ۲۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-deposit-hint"
            />
          </div>
          <div className="field">
            <label htmlFor="inq-budget-deposit-max">رهن حدودی — تا</label>
            <input
              id="inq-budget-deposit-max"
              name="budgetDepositMax"
              inputMode="numeric"
              dir="rtl"
              value={budgetDepositMax}
              onChange={(event) => handleBudgetChange(event, setBudgetDepositMax)}
              placeholder="مثلاً ۳۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-deposit-hint"
            />
          </div>
          <div className="field field-span">
            <small id="inq-budget-deposit-hint" className="form-hint">
              {budgetRangeHint(budgetDepositMin, budgetDepositMax, "مثلاً از ۲۰۰ میلیون تا ۳۰۰ میلیون تومان")}
            </small>
          </div>
          <div className="field">
            <label htmlFor="inq-budget-rent-min">اجاره حدودی — از</label>
            <input
              id="inq-budget-rent-min"
              name="budgetRentMin"
              inputMode="numeric"
              dir="rtl"
              value={budgetRentMin}
              onChange={(event) => handleBudgetChange(event, setBudgetRentMin)}
              placeholder="مثلاً ۱۲٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-rent-hint"
            />
          </div>
          <div className="field">
            <label htmlFor="inq-budget-rent-max">اجاره حدودی — تا</label>
            <input
              id="inq-budget-rent-max"
              name="budgetRentMax"
              inputMode="numeric"
              dir="rtl"
              value={budgetRentMax}
              onChange={(event) => handleBudgetChange(event, setBudgetRentMax)}
              placeholder="مثلاً ۱۴٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-rent-hint"
            />
          </div>
          <div className="field field-span">
            <small id="inq-budget-rent-hint" className="form-hint">
              {budgetRangeHint(budgetRentMin, budgetRentMax, "مثلاً از ۱۲ میلیون تا ۱۴ میلیون تومان در ماه")}
            </small>
          </div>
        </>
      ) : isBuyDeal ? (
        <>
          <div className="field">
            <label htmlFor="inq-budget-purchase-min">مبلغ خرید حدودی — از</label>
            <input
              id="inq-budget-purchase-min"
              name="budgetPurchaseMin"
              inputMode="numeric"
              dir="rtl"
              value={budgetPurchaseMin}
              onChange={(event) => handleBudgetChange(event, setBudgetPurchaseMin)}
              placeholder="مثلاً ۱۳٬۰۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-purchase-hint"
            />
          </div>
          <div className="field">
            <label htmlFor="inq-budget-purchase-max">مبلغ خرید حدودی — تا</label>
            <input
              id="inq-budget-purchase-max"
              name="budgetPurchaseMax"
              inputMode="numeric"
              dir="rtl"
              value={budgetPurchaseMax}
              onChange={(event) => handleBudgetChange(event, setBudgetPurchaseMax)}
              placeholder="مثلاً ۱۳٬۲۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-purchase-hint"
            />
          </div>
          <div className="field field-span">
            <small id="inq-budget-purchase-hint" className="form-hint">
              {budgetRangeHint(budgetPurchaseMin, budgetPurchaseMax, "مثلاً از ۱۳ میلیارد تا ۱۳٫۲ میلیارد تومان")}
            </small>
          </div>
        </>
      ) : isSellDeal ? (
        <>
          <div className="field">
            <label htmlFor="inq-budget-sale-min">مبلغ فروش حدودی — از</label>
            <input
              id="inq-budget-sale-min"
              name="budgetSaleMin"
              inputMode="numeric"
              dir="rtl"
              value={budgetSaleMin}
              onChange={(event) => handleBudgetChange(event, setBudgetSaleMin)}
              placeholder="مثلاً ۱۳٬۰۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-sale-hint"
            />
          </div>
          <div className="field">
            <label htmlFor="inq-budget-sale-max">مبلغ فروش حدودی — تا</label>
            <input
              id="inq-budget-sale-max"
              name="budgetSaleMax"
              inputMode="numeric"
              dir="rtl"
              value={budgetSaleMax}
              onChange={(event) => handleBudgetChange(event, setBudgetSaleMax)}
              placeholder="مثلاً ۱۳٬۲۰۰٬۰۰۰٬۰۰۰"
              aria-describedby="inq-budget-sale-hint"
            />
          </div>
          <div className="field field-span">
            <small id="inq-budget-sale-hint" className="form-hint">
              {budgetRangeHint(budgetSaleMin, budgetSaleMax, "مثلاً از ۱۳ میلیارد تا ۱۳٫۲ میلیارد تومان")}
            </small>
          </div>
        </>
      ) : null}
      {isRentLikeDeal ? (
        <div className="field field-span inquiry-deadline-field">
          <label htmlFor="inq-lease-deadline">مهلت رهن و اجاره</label>
          <PersianDatePicker
            id="inq-lease-deadline"
            value={leaseDeadline}
            onChange={setLeaseDeadline}
            placeholder="انتخاب مهلت به تاریخ شمسی"
            hint="اختیاری؛ تاریخ مهلت را با تقویم شمسی انتخاب کنید."
          />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="inq-type">نوع ملک</label>
        <select
          id="inq-type"
          value={propertyType}
          onChange={(event) => setPropertyType(event.target.value)}
        >
          <option value="">انتخاب کنید</option>
          {TYPE_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="inq-area">محله مورد نظر</label>
        <select
          id="inq-area"
          value={neighborhood}
          onChange={(event) => setNeighborhood(event.target.value)}
        >
          <option value="">فرقی ندارد / بعداً مشخص می‌شود</option>
          {neighborhoodOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="inq-bedrooms">تعداد خواب موردنظر</label>
        <select
          id="inq-bedrooms"
          name="requestedBedrooms"
          value={requestedBedrooms}
          onChange={(event) => setRequestedBedrooms(event.target.value)}
        >
          {BEDROOM_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="inq-floor">طبقه مورد نظر</label>
        <select
          id="inq-floor"
          name="floorPreference"
          value={floorPreference}
          onChange={(event) => setFloorPreference(event.target.value)}
        >
          <option value="">فرقی ندارد / بعداً مشخص می‌شود</option>
          <option value="زیرزمین">زیرزمین</option>
          <option value="همکف">همکف</option>
          <option value="سوئیت">سوئیت</option>
          <option value="-60">طبقه -۶۰</option>
          {Array.from({ length: 20 }, (_, index) => index + 1).map((floor) => (
            <option key={floor} value={String(floor)}>
              طبقه {floor.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-span">
        <details className="inquiry-amenities-picker" open={amenitiesOpen} onToggle={(event) => setAmenitiesOpen(event.currentTarget.open)}>
          <summary>
            <span>
              <strong>امکانات موردنظر</strong>
              <small>اختیاری؛ فقط موارد مهم فایل را انتخاب کنید.</small>
            </span>
            <b>{requestedAmenities.length ? requestedAmenities.length.toLocaleString("fa-IR") + " مورد انتخاب شده" : "افزودن امکانات"}</b>
          </summary>
          {amenitiesOpen ? (
            <div className="inquiry-amenities-body">
              <div className="inquiry-amenity-grid">
                {[
                  ["parking", "پارکینگ"],
                  ["storage", "انباری"],
                  ["elevator", "آسانسور"],
                ].map(([value, label]) => (
                  <label key={value} className="inquiry-amenity-option">
                    <input
                      type="checkbox"
                      checked={requestedAmenities.includes(value)}
                      onChange={() => {
                        setRequestedAmenities((current) =>
                          current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
                        );
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <small className="form-hint">
                انتخاب امکانات اختیاری است؛ برای پیدا کردن فایل مناسب، فقط موارد مهم را تیک بزنید.
              </small>
            </div>
          ) : null}
        </details>
      </div>
      <div className="field">
        <label htmlFor="inq-consultant">مشاور</label>
        <select
          id="inq-consultant"
          value={consultant}
          onChange={(event) => setConsultant(event.target.value as string)}
        >
          {consultants.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} — {person.role}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-span">
        <label htmlFor="inq-note">توضیحات</label>
        <textarea
          id="inq-note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="متراژ، بودجه حدودی، تعداد خواب یا هر نکته‌ای که کمک کند دقیق‌تر راهنمایی شویم."
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {trackingToken ? (
        <div className="inquiry-tracking-success" role="status">
          <div>
            <span className="kicker">کد رهگیری درخواست شما</span>
            <strong dir="ltr">{trackingToken}</strong>
            <p>این کد را نگه دارید تا هر زمان خواستید وضعیت پیگیری درخواست را ببینید.</p>
          </div>
          <div className="inquiry-tracking-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (!navigator.clipboard?.writeText) {
                  toast.error("کپی کد در این مرورگر در دسترس نیست.");
                  return;
                }
                void navigator.clipboard.writeText(trackingToken)
                  .then(() => toast.success("کد رهگیری کپی شد."))
                  .catch(() => toast.error("کپی کد انجام نشد."));
              }}
            >
              کپی کد
            </button>
            <a className="btn-gold" href={"/request-tracking?code=" + encodeURIComponent(trackingToken)}>
              پیگیری آنلاین
            </a>
          </div>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn-gold">
          ثبت درخواست
        </button>
        <a
          className={cn("btn-ghost")}
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAnalyticsEvent("whatsapp_click")}
        >
          <Send size={16} />
          ارسال در واتساپ
        </a>
        <a
          className="btn-ghost"
          href={`tel:${selected.phone}`}
          onClick={() => trackAnalyticsEvent("call_click")}
        >
          <Phone size={16} />
          تماس با {selected.name}
        </a>
      </div>
    </form>
  );
}
