const HEADERS = [
  "شناسه", "عنوان", "slug", "وضعیت", "ویژه", "پایان ویژه", "معامله", "نوع ملک", "محله", "آدرس",
  "متراژ", "خواب", "سرویس", "طبقه", "طبقه خاص", "کل طبقات", "سال ساخت", "پارکینگ", "آسانسور",
  "انباری", "رنگ‌آمیزی", "کاغذ دیواری", "موقعیت ملک", "قابل تبدیل", "قیمت", "رهن", "اجاره",
  "مشاور", "تلفن", "صاحب فایل", "تلفن صاحب فایل", "اطلاعات صاحب فایل", "ایجاد", "آخرین بروزرسانی",
] as const;

const STATUS_LABELS: Record<string, string> = {
  published: "منتشرشده",
  draft: "پیش‌نویس",
  archived: "بایگانی",
};

const TRANSACTION_LABELS: Record<string, string> = {
  sell: "فروش",
  buy: "خرید",
  rent: "اجاره",
  mortgage: "رهن",
};

const ORIENTATION_LABELS: Record<string, string> = {
  north: "شمالی",
  south: "جنوبی",
  east: "شرقی",
  west: "غربی",
  northeast: "شمال‌شرقی",
  northwest: "شمال‌غربی",
  southeast: "جنوب‌شرقی",
  southwest: "جنوب‌غربی",
  two_fronts: "دو نبش",
  three_fronts: "سه نبش",
  four_fronts: "چهار نبش",
  other: "سایر",
};

export function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  // Spreadsheet software may evaluate formulas even when preceded by spaces
  // or control whitespace; force such cells to text before CSV quoting.
  if (/^[=+\-@]/.test(text.trimStart())) text = "'" + text;
  return /[",]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** Return data cells in exactly the same order as PROPERTY_EXPORT_HEADERS. */
export function propertyExportRow(row: Record<string, unknown>): unknown[] {
  return [
    row.id,
    row.title,
    row.slug,
    STATUS_LABELS[String(row.status)] ?? row.status,
    row.featured ? "بله" : "خیر",
    row.featured_until ? new Date(String(row.featured_until)).toISOString() : "",
    TRANSACTION_LABELS[String(row.transaction_type)] ?? row.transaction_type,
    row.property_type,
    row.neighborhood,
    row.address,
    row.area_m2,
    row.bedrooms,
    row.bathrooms,
    row.floor,
    row.floor_label === "suite" ? "سوئیت" : "",
    row.total_floors,
    row.built_year,
    row.parking ? "بله" : "خیر",
    row.elevator ? "بله" : "خیر",
    row.storage ? "بله" : "خیر",
    row.painted ? "بله" : "خیر",
    row.wallpaper ? "بله" : "خیر",
    ORIENTATION_LABELS[String(row.orientation)] ?? "",
    row.convertible ? "بله" : "خیر",
    row.price,
    row.deposit,
    row.rent,
    row.contact_name,
    row.contact_phone,
    row.owner_name,
    row.owner_phone,
    row.owner_info,
    row.created_at,
    row.updated_at,
  ];
}

export const PROPERTY_EXPORT_HEADERS = HEADERS;

export function propertyExportCsv(rows: Record<string, unknown>[]): string {
  const lines = [
    PROPERTY_EXPORT_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => propertyExportRow(row).map(csvCell).join(",")),
  ];
  return "\uFEFF" + lines.join("\n");
}
