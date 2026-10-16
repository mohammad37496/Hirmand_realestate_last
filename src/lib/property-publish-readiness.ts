export type PublishReadinessInput = {
  transactionType: "sell" | "buy" | "rent" | "mortgage";
  title: string;
  neighborhood: string;
  description: string;
  contactName: string;
  contactPhone: string;
  price: string;
  deposit: string;
  rent: string;
  imageCount: number;
  areaM2: string;
  features: string;
  latitude: number | null;
  longitude: number | null;
};

export type PublishReadiness = {
  blockers: string[];
  warnings: string[];
  checks: Array<{ key: string; label: string; state: "ok" | "warning" | "blocker" }>;
  ready: boolean;
};

function hasPositiveMoney(value: string) {
  const normalized = value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٬،,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return false;
  return BigInt(normalized) > 0n;
}

export function getPublishReadiness(input: PublishReadinessInput): PublishReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: PublishReadiness["checks"] = [];

  const titleOk = input.title.trim().length >= 12;
  checks.push({ key: "title", label: "عنوان حرفه‌ای", state: titleOk ? "ok" : "blocker" });
  if (!titleOk) blockers.push("عنوان فایل برای انتشار باید حداقل ۱۲ کاراکتر و قابل فهم باشد.");

  const neighborhoodOk = input.neighborhood.trim().length >= 2;
  checks.push({ key: "neighborhood", label: "محله", state: neighborhoodOk ? "ok" : "blocker" });
  if (!neighborhoodOk) blockers.push("محله فایل باید مشخص باشد.");

  const descriptionOk = input.description.trim().length >= 80;
  checks.push({ key: "description", label: "توضیحات کامل", state: descriptionOk ? "ok" : "blocker" });
  if (!descriptionOk) blockers.push("توضیحات فایل برای انتشار باید حداقل ۸۰ کاراکتر باشد.");

  const consultantOk = input.contactName.trim().length >= 2 && input.contactPhone.trim().length >= 8;
  checks.push({ key: "consultant", label: "مشاور و تماس", state: consultantOk ? "ok" : "blocker" });
  if (!consultantOk) blockers.push("نام و شماره تماس مشاور باید کامل باشد.");

  const pricingOk =
    input.transactionType === "sell"
      ? hasPositiveMoney(input.price)
      : input.transactionType === "rent"
        ? hasPositiveMoney(input.deposit) || hasPositiveMoney(input.rent)
        : input.transactionType === "mortgage"
          ? hasPositiveMoney(input.deposit)
          : true;
  checks.push({ key: "pricing", label: "قیمت و شرایط مالی", state: pricingOk ? "ok" : "blocker" });
  if (!pricingOk) blockers.push("قیمت یا شرایط مالی متناسب با نوع معامله را وارد کنید.");

  const imagesOk = input.imageCount > 0;
  checks.push({ key: "images", label: "حداقل یک تصویر", state: imagesOk ? "ok" : "warning" });
  if (!imagesOk) warnings.push("فایل بدون تصویر منتشر می‌شود و از fallback سایت استفاده خواهد شد.");

  const areaOk = input.areaM2.trim().length > 0;
  checks.push({ key: "area", label: "متراژ", state: areaOk ? "ok" : "warning" });
  if (!areaOk) warnings.push("ثبت متراژ، فیلتر و مقایسه فایل را دقیق‌تر می‌کند.");

  const featuresOk = input.features.trim().length > 0;
  checks.push({ key: "features", label: "ویژگی‌ها", state: featuresOk ? "ok" : "warning" });
  if (!featuresOk) warnings.push("ویژگی‌های اصلی ملک هنوز ثبت نشده‌اند.");

  const mapOk = input.latitude != null && input.longitude != null;
  checks.push({ key: "map", label: "موقعیت نقشه", state: mapOk ? "ok" : "warning" });
  if (!mapOk) warnings.push("موقعیت نقشه ثبت نشده است؛ نمایش موقعیت مکانی محدود خواهد بود.");

  return { blockers, warnings, checks, ready: blockers.length === 0 };
}
