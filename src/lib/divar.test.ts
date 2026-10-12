import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDivarMediaUrls } from "./divar-media-utils.ts";
import { getDivarAgencyReason } from "./divar-agency-filter.ts";
import { findDivarCoordinates } from "./divar-coordinate-utils.ts";
import { isDivarRemoteHost, mediaSourceCandidates } from "./media.ts";
import type { DivarFile } from "./divar.ts";
import {
  DIVAR_MAX_PUBLISHED_IMAGES,
  divarCompleteness,
  divarFilesToCsv,
  divarGalleryHealth,
  syncRunBadge,
  divarNeighborhoodOptions,
  divarPriceValue,
  filterDivarFiles,
  normalizeDivarQuery,
  sortDivarFiles,
  EMPTY_DIVAR_FILTERS,
} from "./divar-status.ts";

test("extractDivarMediaUrls finds nested CDN image URLs even when the leaf key is generic", () => {
  const urls = extractDivarMediaUrls({
    widgets: [
      {
        data: {
          media: [
            { value: "https://img.divarcdn.com/sample/one.jpg" },
            { value: "https://img.divarcdn.com/sample/two.webp" },
          ],
        },
      },
    ],
  });

  assert.deepEqual(urls, [
    "https://img.divarcdn.com/sample/one.jpg",
    "https://img.divarcdn.com/sample/two.webp",
  ]);
});

test("extractDivarMediaUrls does not mistake a normal Divar listing URL for an image", () => {
  const urls = extractDivarMediaUrls({
    source_url: "https://divar.ir/v/abcdef",
    media: {
      image: "https://divar.ir/images/sample.jpg",
    },
  });

  assert.deepEqual(urls, ["https://divar.ir/images/sample.jpg"]);
});

test("Divar coordinates support scaled E7 keys and underscore-separated variants", () => {
  assert.deepEqual(
    findDivarCoordinates({
      map: { latitude_e7: 326123456, longitude_e7: 516123456 },
    }),
    { latitude: 32.6123456, longitude: 51.6123456 },
  );
  assert.deepEqual(
    findDivarCoordinates({ latitude: 32.7, longitude: 51.6 }),
    { latitude: 32.7, longitude: 51.6 },
  );
});

test("partial Divar syncs are not labelled fully successful", () => {
  assert.deepEqual(
    syncRunBadge({
      id: "run-1",
      status: "completed",
      requestedLimit: 24,
      inspected: 18,
      accepted: 10,
      newlyVisible: 9,
      rejected: 5,
      requests: 25,
      detailFailures: 2,
      durationMs: 1200,
      error: "2 detail failures",
      startedAt: "2026-10-11T10:00:00.000Z",
      finishedAt: "2026-10-11T10:00:01.200Z",
    }),
    { className: "partial", label: "ناقص" },
  );
});


/* -------------------------------------------------------------------------- */
/* Agency / professional seller exclusion                                    */
/* -------------------------------------------------------------------------- */

test("agency filter catches Divar's machine-readable account types, including keys", () => {
  assert.match(
    getDivarAgencyReason({ widgets: [{ data: { "real-estate-business": true } }] }) ?? "",
    /مشاور|آژانس|املاک/u,
  );
  assert.ok(getDivarAgencyReason({ advertiser: { type: "real_estate_business" } }));
  assert.ok(getDivarAgencyReason({ seller_type: "real-estate-agent" }));
});

test("agency filter excludes agencies, departments, estate brands and consultants", () => {
  const samples: unknown[] = [
    { seller: { name: "آژانس املاک نقش جهان" } },
    { advertiser_name: "دپارتمان املاک سپاهان" },
    { profile: { title: "گروه مشاورین املاک اصفهان" } },
    { seller_name: "املاک و مستغلات آریا" },
    { seller_name: "محمد رضایی - مشاور املاک" },
    { title: "دفتر مشاور املاک در اصفهان" },
    { description: "ما یک دپارتمان تخصصی املاک هستیم" },
    { description: "فعال در زمینه خرید و فروش ملک؛ مشاور املاک" },
  ];
  for (const sample of samples) {
    assert.ok(getDivarAgencyReason(sample), `expected agency to be excluded: ${JSON.stringify(sample)}`);
  }
});

test("agency filter allows owner ads that explicitly tell agents not to call", () => {
  const samples: unknown[] = [
    { seller_name: "علی رضایی", description: "لطفاً مشاور املاک تماس نگیرد" },
    { seller_name: "مالک", description: "با آژانس و مشاور املاک تماس نگیرید؛ فایل شخصی است" },
    { description: "مشاور املاک و بنگاه تماس نزنند" },
  ];
  for (const sample of samples) {
    assert.equal(getDivarAgencyReason(sample), null, JSON.stringify(sample));
  }
});

test("agency filter catches affiliation in seller metadata even when description says no agents", () => {
  assert.ok(
    getDivarAgencyReason({
      seller: { name: "دپارتمان هیرمند", type: "real-estate-business" },
      description: "مشاور املاک تماس نگیرد",
    }),
  );
  // The personal-owner exception must not erase a business name in the same
  // text when the seller appends a no-call request.
  assert.ok(getDivarAgencyReason({ description: "آژانس املاک هیرمند مشاور املاک تماس نگیرد" }));
});

test("Divar media hosts require a first-party HTTPS host", () => {
  assert.equal(isDivarRemoteHost("https://img.divarcdn.com/a.jpg"), true);
  assert.equal(isDivarRemoteHost("https://example.com/a.jpg"), false);
});

test("public media candidates keep Divar images same-origin through the proxy", () => {
  const source = "https://img.divarcdn.com/sample/one.jpg";
  assert.deepEqual(mediaSourceCandidates(source), [
    "/api/media-proxy?url=" + encodeURIComponent(source),
  ]);
});

test("Divar media candidates can fall back to an explicit local placeholder", () => {
  const source = "https://img.divarcdn.com/sample/one.jpg";
  assert.deepEqual(mediaSourceCandidates(source, "/images/property-placeholder.webp"), [
    "/api/media-proxy?url=" + encodeURIComponent(source),
    "/images/property-placeholder.webp",
  ]);
});

/* -------------------------------------------------------------------------- */
/* Gallery health                                                             */
/* -------------------------------------------------------------------------- */

function makeFile(overrides: Partial<DivarFile> = {}): DivarFile {
  return {
    id: "f1",
    token: "abc123",
    title: "آپارتمان ۱۰۰ متری",
    transactionType: "sell",
    propertyType: "apartment",
    neighborhood: "سپاهان‌شهر",
    areaM2: 100,
    bedrooms: 2,
    bathrooms: 1,
    floor: 3,
    floorLabel: null,
    orientation: "north",
    totalFloors: 5,
    builtYear: 1395,
    parking: true,
    elevator: true,
    storage: true,
    price: "5000000000",
    deposit: null,
    rent: null,
    description: "توضیحات کامل آگهی برای تست فیلد توضیحات و طول متن آن.",
    features: ["پارکینگ"],
    images: ["/api/media-proxy?url=x"],
    sourceImageCount: 5,
    publishedImageCount: 5,
    publishedHostedImageCount: 5,
    publishedRemoteImageCount: 0,
    sellerName: "علی",
    sellerType: "شخصی",
    sourceUrl: "https://divar.ir/v/abc123",
    filterStatus: "imported",
    importedPropertyId: "p1",
    propertySlug: "sample",
    latitude: 32.6,
    longitude: 51.6,
    importedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-02-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
    rejectReason: null,
    manualOverride: false,
    ...overrides,
  };
}

test("a published gallery that kept every source photo is complete", () => {
  const health = divarGalleryHealth(makeFile());
  assert.equal(health.level, "complete");
  assert.equal(health.needsRepair, false);
  assert.equal(health.expected, 5);
});

test("a short published gallery is flagged for repair", () => {
  const health = divarGalleryHealth(makeFile({ publishedImageCount: 2 }));
  assert.equal(health.level, "partial");
  assert.equal(health.needsRepair, true);
  assert.equal(health.label, "۲ / ۵ تصویر منتشرشده");
});

test("a published listing with no gallery is 'missing' and repairable", () => {
  const health = divarGalleryHealth(
    makeFile({ publishedImageCount: 0, publishedHostedImageCount: 0 }),
  );
  assert.equal(health.level, "missing");
  assert.equal(health.needsRepair, true);
});

test("gallery expectations stop at the publish cap so images never look permanently missing", () => {
  const long = { sourceImageCount: 60, publishedImageCount: 20 };
  assert.equal(divarGalleryHealth(makeFile(long)).expected, DIVAR_MAX_PUBLISHED_IMAGES);
  assert.equal(divarGalleryHealth(makeFile(long)).needsRepair, false);
  assert.equal(
    divarGalleryHealth(makeFile({ ...long, publishedImageCount: 19 })).needsRepair,
    true,
  );
});

test("an ad that is not on the site yet is never marked repairable", () => {
  const health = divarGalleryHealth(
    makeFile({ filterStatus: "accepted", publishedImageCount: 0, publishedHostedImageCount: 0 }),
  );
  assert.equal(health.level, "complete");
  assert.equal(health.needsRepair, false);
  assert.equal(health.label, "۵ تصویر در آگهی");

  const imageless = divarGalleryHealth(
    makeFile({ filterStatus: "accepted", sourceImageCount: 0, publishedImageCount: 0 }),
  );
  assert.equal(imageless.level, "empty");
  assert.equal(imageless.needsRepair, false);
});

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

test("a fully populated listing scores 100", () => {
  const score = divarCompleteness(makeFile());
  assert.equal(score.score, 100);
  assert.deepEqual(score.missing, []);
});

test("missing fields are reported by name", () => {
  const score = divarCompleteness(
    makeFile({
      price: null,
      areaM2: null,
      latitude: null,
      longitude: null,
      features: [],
      description: "کوتاه",
    }),
  );
  assert.deepEqual(score.missing, ["قیمت", "متراژ", "توضیحات کامل", "امکانات", "موقعیت روی نقشه"]);
  assert.ok(score.score < 100);
});

test("a rental is judged on its deposit or rent, not on a sale price", () => {
  assert.equal(divarCompleteness(makeFile({ transactionType: "rent", price: null, rent: "20000000" })).missing.includes("رهن/اجاره"), false);
  assert.equal(divarCompleteness(makeFile({ transactionType: "rent", price: "500" })).missing.includes("رهن/اجاره"), true);
});

/* -------------------------------------------------------------------------- */
/* Search / filter / sort                                                     */
/* -------------------------------------------------------------------------- */

test("search normalizes Persian and Arabic characters and digits", () => {
  // A zero-width non-joiner becomes a space on both sides, so "سپاهان‌شهر" and
  // "سپاهان شهر" find the same listings.
  assert.equal(normalizeDivarQuery("  تهران‌ی ۱۲۳  "), "تهران ی 123");
  assert.equal(normalizeDivarQuery("كتاب"), "کتاب");
  assert.equal(normalizeDivarQuery("سپاهان‌شهر"), normalizeDivarQuery("سپاهان شهر"));
});

test("search matches the Divar token and link, not just the copy", () => {
  const files = [makeFile(), makeFile({ id: "f2", token: "zzz999", sourceUrl: "https://divar.ir/v/zzz999", title: "ویلا" })];
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, search: "ZZZ999" }).map((file) => file.id),
    ["f2"],
  );
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, search: "سپاهان" }).map((file) => file.id),
    ["f1", "f2"],
  );
});

test("filters compose: transaction, neighborhood and completeness", () => {
  const files = [
    makeFile(),
    makeFile({ id: "f2", transactionType: "rent", neighborhood: "خانه اصفهان", rent: "10000000", deposit: "100000000", price: null }),
    makeFile({ id: "f3", areaM2: null, price: null }),
  ];
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, transaction: "rent" }).map((file) => file.id),
    ["f2"],
  );
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, neighborhood: "خانه اصفهان" }).map((file) => file.id),
    ["f2"],
  );
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, minScore: 90 }).map((file) => file.id),
    ["f1", "f2"],
  );
});

test("the repair filter only keeps published galleries that are short", () => {
  const files = [
    makeFile(),
    makeFile({ id: "f2", publishedImageCount: 1 }),
    makeFile({ id: "f3", filterStatus: "accepted" }),
  ];
  assert.deepEqual(
    filterDivarFiles(files, { ...EMPTY_DIVAR_FILTERS, onlyNeedsRepair: true }).map((file) => file.id),
    ["f2"],
  );
});

test("sorting uses the comparable amount for each deal type", () => {
  assert.equal(divarPriceValue(makeFile({ price: "900" })), 900);
  assert.equal(divarPriceValue(makeFile({ transactionType: "rent", deposit: "300", rent: "10" })), 300);
  assert.equal(divarPriceValue(makeFile({ transactionType: "rent", deposit: null, rent: "10" })), 10);

  const files = [
    makeFile({ id: "cheap", price: "100" }),
    makeFile({ id: "pricey", price: "900" }),
    makeFile({ id: "old", price: "500", lastSeenAt: "2020-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortDivarFiles(files, "priceAsc").map((file) => file.id), ["cheap", "old", "pricey"]);
  assert.deepEqual(sortDivarFiles(files, "priceDesc").map((file) => file.id), ["pricey", "old", "cheap"]);
  assert.equal(sortDivarFiles(files, "oldest")[0].id, "old");
});

test("sorting by completeness puts the fullest listing first", () => {
  const files = [
    makeFile({ id: "sparse", price: null, areaM2: null, features: [], description: "x", latitude: null }),
    makeFile({ id: "full" }),
  ];
  assert.equal(sortDivarFiles(files, "scoreDesc")[0].id, "full");
});

test("neighborhood options are de-duplicated and ordered by frequency", () => {
  const options = divarNeighborhoodOptions([
    makeFile({ id: "a", neighborhood: "سپاهان‌شهر" }),
    makeFile({ id: "b", neighborhood: "سپاهان‌شهر" }),
    makeFile({ id: "c", neighborhood: "خانه اصفهان" }),
  ]);
  assert.deepEqual(options[0], { value: "سپاهان‌شهر", count: 2 });
  assert.equal(options.length, 2);
});

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

test("CSV export quotes separators and links back to the published listing", () => {
  const csv = divarFilesToCsv(
    [makeFile({ title: 'آپارتمان, ۱۰۰ متری "نوساز"' })],
    "https://www.hirmandrealestate.ir",
  );
  const [header, row] = csv.split("\r\n");
  assert.ok(header.startsWith("عنوان,وضعیت,معامله"));
  assert.ok(row.includes('"آپارتمان, ۱۰۰ متری ""نوساز"""'));
  assert.ok(row.includes("https://www.hirmandrealestate.ir/properties/sample"));
  assert.equal(csv.split("\r\n").length, 2);
});
