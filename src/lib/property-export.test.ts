import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_EXPORT_HEADERS,
  csvCell,
  propertyExportCsv,
  propertyExportRow,
} from "./property-export.ts";

test("property export rows stay aligned with all CSV headers", () => {
  const row = {
    id: "property-1",
    title: "فایل نمونه",
    slug: "sample",
    status: "published",
    featured: true,
    featured_until: "2026-10-20T10:00:00.000Z",
    transaction_type: "sell",
    property_type: "apartment",
    neighborhood: "سیمین",
    address: "آدرس نمونه",
    area_m2: 148,
    bedrooms: 2,
    bathrooms: 1,
    floor: null,
    floor_label: "suite",
    total_floors: 5,
    built_year: 1400,
    parking: true,
    elevator: false,
    storage: true,
    painted: false,
    wallpaper: true,
    orientation: "northeast",
    convertible: true,
    price: "8500000000",
    deposit: null,
    rent: null,
    contact_name: "مشاور",
    contact_phone: "09123456789",
    owner_name: "مالک",
    owner_phone: "09987654321",
    owner_info: "اطلاعات مالک",
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-02T10:00:00.000Z",
  };

  const values = propertyExportRow(row);
  assert.equal(values.length, PROPERTY_EXPORT_HEADERS.length);

  const index = (header: string) => (PROPERTY_EXPORT_HEADERS as readonly string[]).indexOf(header);
  assert.equal(values[index("طبقه")], null);
  assert.equal(values[index("طبقه خاص")], "سوئیت");
  assert.equal(values[index("کل طبقات")], 5);
  assert.equal(values[index("سال ساخت")], 1400);
  assert.equal(values[index("موقعیت ملک")], "شمال‌شرقی");
  assert.equal(values[index("قابل تبدیل")], "بله");
  assert.equal(values[index("قیمت")], "8500000000");

  const csv = propertyExportCsv([row]);
  const csvRows = csv.replace(/^\uFEFF/, "").split("\n");
  assert.equal(csvRows.length, 2);
  assert.equal(csvRows[0].split(",").length, PROPERTY_EXPORT_HEADERS.length);
  assert.equal(csvRows[1].split(",").length, PROPERTY_EXPORT_HEADERS.length);
});

test("CSV cells quote separators and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell('text, with "quotes"'), '"text, with ""quotes"""');
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("  @SUM(A1:A2)"), "'  @SUM(A1:A2)");
  assert.equal(csvCell("\t-2+3"), "'\t-2+3");
  assert.equal(csvCell("plain text"), "plain text");
});
