export function normalizeMatchLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\s]+/g, " ")
    .toLocaleLowerCase("fa-IR");
}

export function buildMatchWarnings(input: {
  priceMatch: number | null;
  amenityCoverage: number | null;
  sameNeighborhood: boolean | null;
  requestedBedrooms: number | null;
  propertyBedrooms: number | null;
  floorPreference: string;
  propertyFloor: number | null;
  propertyFloorValid: boolean;
}): string[] {
  const warnings: string[] = [];
  if (input.priceMatch != null && input.priceMatch < 70) warnings.push("قیمت با بودجه فاصله دارد");
  if (input.amenityCoverage === 0) warnings.push("امکانات درخواستی در این فایل ثبت یا تأیید نشده است");
  if (input.sameNeighborhood === false) warnings.push("محله فایل با محله درخواستی متفاوت است");
  if (input.requestedBedrooms != null) {
    if (input.propertyBedrooms == null) warnings.push("تعداد خواب فایل مشخص نشده است");
    else if (input.propertyBedrooms < input.requestedBedrooms || (input.requestedBedrooms === 0 && input.propertyBedrooms !== 0)) {
      warnings.push("تعداد خواب با درخواست مشتری مطابقت ندارد");
    }
  }
  if (input.floorPreference) {
    if (input.propertyFloor == null || !input.propertyFloorValid) warnings.push("طبقه فایل ثبت نشده یا معتبر نیست");
    else if (String(input.propertyFloor) !== input.floorPreference) warnings.push("طبقه فایل با درخواست مشتری متفاوت است");
  }
  return warnings;
}
