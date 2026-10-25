import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDivarMedia, extractDivarMediaUrls } from "./divar-media-utils.ts";
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

test("extractDivarMediaUrls counts each photo once across thumbnail and full-size renditions", () => {
  const photoIds = Array.from({ length: 8 }, (_, index) => `photo-${index + 1}.webp`);
  const payload = {
    thumbnails: photoIds.map((id) => `https://s100.divarcdn.com/static/photo/webp_thumbnail/${id}`),
    gallery: photoIds.map((id) => `https://img.divarcdn.com/static/photo/webp/${id}`),
  };

  const urls = extractDivarMediaUrls(payload);
  assert.equal(urls.length, 8);
  assert.ok(urls.every((url) => url.includes("/webp/")));
});

test("extractDivarMediaUrls does not collapse unrelated media with the same generic filename", () => {
  const urls = extractDivarMediaUrls({
    gallery: [
      "https://img.divarcdn.com/static/photo/webp/photo-1.webp",
      "https://img.divarcdn.com/static/photo/webp/photo-2.webp",
      "https://img.divarcdn.com/custom/image.jpg",
      "https://img.divarcdn.com/other/image.jpg",
    ],
  });

  assert.equal(urls.length, 4);
  assert.ok(urls.includes("https://img.divarcdn.com/custom/image.jpg"));
  assert.ok(urls.includes("https://img.divarcdn.com/other/image.jpg"));
});

test("property media limit accommodates a full Divar gallery and video", async () => {
  const { MAX_PROPERTY_MEDIA } = await import("./media.ts");
  assert.equal(DIVAR_MAX_PUBLISHED_IMAGES, 80);
  assert.equal(MAX_PROPERTY_MEDIA, DIVAR_MAX_PUBLISHED_IMAGES);
});

test("extractDivarMediaUrls scans past a thumbnail-heavy prefix to find the full gallery", () => {
  const photoIds = Array.from({ length: 60 }, (_, index) => `photo-${index + 1}.webp`);
  const payload = {
    thumbnails: photoIds.map((id) => `https://s100.divarcdn.com/static/photo/webp_thumbnail/${id}`),
    gallery: photoIds.map((id) => `https://img.divarcdn.com/static/photo/webp/${id}`),
  };

  const urls = extractDivarMediaUrls(payload);
  assert.equal(urls.length, 60);
  assert.ok(urls.every((url) => url.includes("/webp/")));
});

test("extractDivarMediaUrls retains a Divar-hosted video alongside photos", () => {
  const urls = extractDivarMediaUrls({
    gallery: [
      "https://img.divarcdn.com/static/photo/webp/photo-1.webp",
      "https://img.divarcdn.com/static/video/property-clip.mp4",
    ],
  });

  assert.equal(urls.length, 2);
  assert.ok(urls.some((url) => url.endsWith("property-clip.mp4")));
});

test("the real eight-photo carousel shape excludes Divar UI icons and map images", () => {
  const photoIds = [
    "6df1cb6f-9fb9-4c02-ace8-a367f9265d92",
    "825f9311-44ac-4bb0-834e-dc242aaf44aa",
    "4ca516d1-81a4-4319-b68e-fd1574bb496b",
    "352f65de-30ea-4d17-8e13-cfbfd2d742a8",
    "8897a680-b282-4b3e-ba8d-75d263d090d0",
    "1a4a36ba-327e-4460-ab62-a19f08f0a160",
    "06409228-2dc0-4126-98ee-a8adacc0fcf9",
    "70ca5931-74b8-445e-8018-e01e20715894",
  ];
  const payload = {
    sections: [{
      section_name: "IMAGE",
      widgets: [{
        widget_type: "IMAGE_CAROUSEL",
        data: {
          items: photoIds.map((id) => ({
            image: {
              url: `https://s100.divarcdn.com/static/photo/neda/webp_post/photo/${id}.webp`,
              thumbnail_url: `https://s100.divarcdn.com/static/photo/neda/webp_thumbnail/thumb/${id}.webp`,
            },
          })),
          tooltip_data: {
            icon: {
              image_url_dark: "https://s100.divarcdn.com/static/imgs/widget-icons/dark/fullscreen.png",
              image_url_light: "https://s100.divarcdn.com/static/imgs/widget-icons/light/fullscreen.png",
            },
            text: "۸",
          },
        },
      }],
    }],
    map_image: "https://mapimage.divarcdn.com/v8/mapimage?encrypted_data=sample",
    seo: { image_url: `https://s100.divarcdn.com/static/photo/neda/post/photo/${photoIds[0]}.jpg` },
  };

  const result = extractDivarMedia(payload);
  assert.equal(result.truncatedCandidates, false);
  assert.equal(result.urls.length, 8);
  assert.ok(result.urls.every((url) => url.includes("/static/photo/") && !url.includes("webp_thumbnail")));
});

test("extractDivarMedia reports when the bounded candidate scan truncates input", () => {
  const urls = Array.from({ length: 5_100 }, (_, index) =>
    `https://img.divarcdn.com/static/photo/webp/photo-${index}.webp`,
  );
  const result = extractDivarMedia({ gallery: urls });
  assert.equal(result.truncatedCandidates, true);
  assert.equal(result.urls.length, 5_000);
});

test("extractDivarMedia ignores external, insecure, UI and empty gallery values", () => {
  const result = extractDivarMedia({
    gallery: [
      "http://s100.divarcdn.com/static/photo/photo.jpg",
      "https://divarcdn.com.attacker.example/static/photo/fake.jpg",
      "https://example.com/property.jpg",
      "https://s100.divarcdn.com/static/imgs/widget-icons/dark/photo.png",
      "https://mapimage.divarcdn.com/v8/mapimage?encrypted_data=sample",
    ],
  });
  assert.deepEqual(result.urls, []);
  assert.equal(result.truncatedCandidates, false);
});

test("extractDivarMedia flags an uninspected nested branch instead of claiming completeness", () => {
  let deeplyNested: unknown = "https://s100.divarcdn.com/static/photo/photo.webp";
  for (let depth = 0; depth < 15; depth += 1) deeplyNested = { child: deeplyNested };
  const result = extractDivarMedia({ gallery: deeplyNested });
  assert.equal(result.truncatedCandidates, true);
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
    sourceVideoCount: 0,
    publishedImageCount: 5,
    publishedVideoCount: 0,
    publishedHostedImageCount: 5,
    publishedHostedVideoCount: 0,
    publishedRemoteImageCount: 0,
    publishedRemoteVideoCount: 0,
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
  assert.equal(health.label, "۲ / ۵ رسانه منتشرشده");
});

test("a published listing with no gallery is 'missing' and repairable", () => {
  const health = divarGalleryHealth(
    makeFile({ publishedImageCount: 0, publishedHostedImageCount: 0 }),
  );
  assert.equal(health.level, "missing");
  assert.equal(health.needsRepair, true);
});

test("gallery health expects all 60 Divar photos rather than an artificial 20-photo cap", () => {
  const long = { sourceImageCount: 60, publishedImageCount: 20 };
  assert.equal(DIVAR_MAX_PUBLISHED_IMAGES, 80);
  assert.equal(divarGalleryHealth(makeFile(long)).expected, 60);
  assert.equal(divarGalleryHealth(makeFile(long)).needsRepair, true);
  assert.equal(
    divarGalleryHealth(makeFile({ ...long, publishedImageCount: 60 })).needsRepair,
    false,
  );
  assert.equal(
    divarGalleryHealth(makeFile({ ...long, publishedImageCount: 59 })).needsRepair,
    true,
  );
});

test("gallery health never marks a listing complete when source media exceeds publish cap", () => {
  const health = divarGalleryHealth(makeFile({ sourceImageCount: 81, publishedImageCount: 80 }));
  assert.equal(health.expected, 81);
  assert.equal(health.published, 80);
  assert.equal(health.level, "partial");
  assert.equal(health.needsRepair, true);
});

test("gallery health counts source and published videos separately but includes them in parity", () => {
  const health = divarGalleryHealth(makeFile({
    sourceImageCount: 8,
    sourceVideoCount: 1,
    publishedImageCount: 8,
    publishedVideoCount: 0,
  }));
  assert.equal(health.expected, 9);
  assert.equal(health.published, 8);
  assert.equal(health.level, "partial");
});

test("an ad that is not on the site yet is never marked repairable", () => {
  const health = divarGalleryHealth(
    makeFile({ filterStatus: "accepted", publishedImageCount: 0, publishedHostedImageCount: 0 }),
  );
  assert.equal(health.level, "complete");
  assert.equal(health.needsRepair, false);
  assert.equal(health.label, "۵ رسانه در آگهی");

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
