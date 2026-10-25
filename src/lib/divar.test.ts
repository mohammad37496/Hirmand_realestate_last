import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { extractDivarMedia, extractDivarMediaUrls } from "./divar-media-utils.ts";
import { deleteDivarRows } from "./divar-delete.server.ts";
import { getDivarAgencyReason } from "./divar-agency-filter.ts";
import { findDivarCoordinates } from "./divar-coordinate-utils.ts";
import { isDivarRemoteHost, mediaSourceCandidates } from "./media.ts";
import type { DivarFile } from "./divar.ts";
import { downloadDivarMedia } from "./divar-media-download.ts";
import { liaraMediaProxyUrl } from "./liara-object-storage.server.ts";
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

test("Divar media download validates bytes, stores once, and returns the private Liara proxy URL", async () => {
  const previousEnv = {
    endpoint: process.env.LIARA_ENDPOINT,
    bucket: process.env.LIARA_BUCKET_NAME,
    access: process.env.LIARA_ACCESS_KEY,
    secret: process.env.LIARA_SECRET_KEY,
  };
  const originalFetch = globalThis.fetch;
  const source = "https://img.divarcdn.com/static/photo/sample.webp";
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  const stored: Array<{ pathname: string; bytes: Buffer; contentType: string }> = [];
  let imageDownloads = 0;

  try {
    process.env.LIARA_ENDPOINT = "https://storage.example.test";
    process.env.LIARA_BUCKET_NAME = "hirmand-test-bucket";
    process.env.LIARA_ACCESS_KEY = "test-access-key";
    process.env.LIARA_SECRET_KEY = "test-secret-key";
    globalThis.fetch = (async () => {
      imageDownloads += 1;
      return new Response(webp, { status: 200, headers: { "content-type": "image/webp" } });
    }) as typeof fetch;

    const result = await downloadDivarMedia("test-token", [source, source], {
      storeMedia: async (input) => {
        stored.push({ pathname: input.pathname, bytes: Buffer.from(input.data), contentType: input.contentType });
        return { url: `https://storage.example.test/hirmand-test-bucket/${input.pathname}` };
      },
      mediaUrlForBrowser: liaraMediaProxyUrl,
      deleteStoredMedia: async () => undefined,
    });

    assert.equal(imageDownloads, 1, "duplicate source URLs should only be fetched once");
    assert.equal(result.sourceImages.length, 1);
    assert.equal(result.stored, 1);
    assert.equal(result.images.length, 1);
    assert.equal(result.failures.length, 0);
    assert.match(result.images[0] ?? "", /^\/api\/liara-media\?url=/);
    const storedUrl = new URL(decodeURIComponent((result.images[0] ?? "").split("url=")[1] ?? ""));
    assert.match(storedUrl.pathname, /\/properties\/divar\/test-token\/01-[0-9a-f-]+\.webp$/i);
    assert.equal(stored[0]?.bytes.equals(webp), true);
    assert.equal(stored[0]?.contentType, "image/webp");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.endpoint === undefined) delete process.env.LIARA_ENDPOINT;
    else process.env.LIARA_ENDPOINT = previousEnv.endpoint;
    if (previousEnv.bucket === undefined) delete process.env.LIARA_BUCKET_NAME;
    else process.env.LIARA_BUCKET_NAME = previousEnv.bucket;
    if (previousEnv.access === undefined) delete process.env.LIARA_ACCESS_KEY;
    else process.env.LIARA_ACCESS_KEY = previousEnv.access;
    if (previousEnv.secret === undefined) delete process.env.LIARA_SECRET_KEY;
    else process.env.LIARA_SECRET_KEY = previousEnv.secret;
  }
});

test("Divar media download retries transient CDN errors and rejects HTML error pages", async () => {
  const previousEnv = {
    endpoint: process.env.LIARA_ENDPOINT,
    bucket: process.env.LIARA_BUCKET_NAME,
    access: process.env.LIARA_ACCESS_KEY,
    secret: process.env.LIARA_SECRET_KEY,
  };
  const originalFetch = globalThis.fetch;
  const source = "https://img.divarcdn.com/static/photo/retry.webp";
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  let imageDownloads = 0;
  let storageWrites = 0;

  try {
    process.env.LIARA_ENDPOINT = "https://storage.example.test";
    process.env.LIARA_BUCKET_NAME = "hirmand-test-bucket";
    process.env.LIARA_ACCESS_KEY = "test-access-key";
    process.env.LIARA_SECRET_KEY = "test-secret-key";
    globalThis.fetch = (async () => {
      imageDownloads += 1;
      if (imageDownloads === 1) return new Response("temporary", { status: 503 });
      if (imageDownloads === 2) return new Response(webp, { status: 200, headers: { "content-type": "image/webp" } });
      return new Response("<html>error</html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const dependencies = {
      storeMedia: async (input: { pathname: string; data: Buffer | Uint8Array; contentType: string }) => {
        storageWrites += 1;
        return { url: `https://storage.example.test/hirmand-test-bucket/${input.pathname}` };
      },
      mediaUrlForBrowser: (url: string) => "/api/liara-media?url=" + encodeURIComponent(url),
      deleteStoredMedia: async () => undefined,
    };
    const retried = await downloadDivarMedia("retry-token", [source], dependencies);
    assert.equal(imageDownloads, 2);
    assert.equal(retried.stored, 1);
    assert.equal(retried.failures.length, 0);

    imageDownloads = 2;
    const invalid = await downloadDivarMedia("invalid-token", ["https://img.divarcdn.com/static/photo/invalid.webp"], dependencies);
    assert.equal(invalid.stored, 0);
    assert.equal(invalid.images.length, 0);
    assert.equal(invalid.failures.length, 1);
    assert.match(invalid.failures[0]?.reason ?? "", /معتبر نبود/);
    assert.equal(storageWrites, 1, "invalid HTML payloads must never be uploaded as images");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.endpoint === undefined) delete process.env.LIARA_ENDPOINT;
    else process.env.LIARA_ENDPOINT = previousEnv.endpoint;
    if (previousEnv.bucket === undefined) delete process.env.LIARA_BUCKET_NAME;
    else process.env.LIARA_BUCKET_NAME = previousEnv.bucket;
    if (previousEnv.access === undefined) delete process.env.LIARA_ACCESS_KEY;
    else process.env.LIARA_ACCESS_KEY = previousEnv.access;
    if (previousEnv.secret === undefined) delete process.env.LIARA_SECRET_KEY;
    else process.env.LIARA_SECRET_KEY = previousEnv.secret;
  }
});

test("a partial Divar media download cleans up successful objects before reporting failure", async () => {
  const originalFetch = globalThis.fetch;
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  const cleanup: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.includes("good")) {
        return new Response(webp, { status: 200, headers: { "content-type": "image/webp" } });
      }
      return new Response("<html>expired URL</html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await downloadDivarMedia("partial-token", [
      "https://img.divarcdn.com/static/photo/good.webp",
      "https://img.divarcdn.com/static/photo/bad.webp",
    ], {
      storeMedia: async (input) => ({ url: `https://storage.example.test/hirmand-test-bucket/${input.pathname}` }),
      mediaUrlForBrowser: (url) => "/api/liara-media?url=" + encodeURIComponent(url),
      deleteStoredMedia: async (url) => { cleanup.push(url); },
    });
    assert.equal(result.failures.length, 1);
    assert.equal(result.stored, 1);
    assert.equal(result.images.length, 1);
    assert.equal(cleanup.length, 1, "the successfully stored subset is removed so failed imports cannot orphan media");
    assert.match(cleanup[0] ?? "", /^\/api\/liara-media\?url=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a stored Divar object is removed if a safe browser URL cannot be generated", async () => {
  const originalFetch = globalThis.fetch;
  const removed: string[] = [];
  try {
    globalThis.fetch = (async () => new Response(Buffer.from("RIFF0000WEBP", "ascii"), {
      status: 200,
      headers: { "content-type": "image/webp" },
    })) as typeof fetch;
    const result = await downloadDivarMedia("proxy-failure-token", ["https://img.divarcdn.com/static/photo/photo.webp"], {
      storeMedia: async (input) => ({ url: `https://storage.example.test/hirmand-test-bucket/${input.pathname}` }),
      // Returning a private Liara URL unchanged is not a valid browser delivery URL.
      mediaUrlForBrowser: (url) => url,
      deleteStoredMedia: async (url) => { removed.push(url); },
    });
    assert.equal(result.images.length, 0);
    assert.equal(result.stored, 0);
    assert.equal(result.failures.length, 1);
    assert.equal(removed.length, 1);
    assert.match(removed[0] ?? "", /^https:\/\/storage\.example\.test\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Divar single and bulk removal atomically trash linked properties, audit them, and preserve galleries on restore", async () => {
  const db = new PGlite("memory://");
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        deleted_at timestamptz,
        deleted_from_status text,
        status text not null,
        featured boolean not null default false,
        featured_until timestamptz,
        updated_at timestamptz not null default current_timestamp,
        images jsonb not null default '[]'::jsonb
      );
      create table divar_files (id text primary key, imported_property_id text, filter_status text not null);
      create table property_change_history (property_id text, action text, before_state jsonb, after_state jsonb);
      insert into properties(id,status,featured,images) values
        ('p1','published',true,'["/api/liara-media?url=one.webp"]'::jsonb),
        ('p3','published',true,'["/api/liara-media?url=three.webp"]'::jsonb);
      insert into properties(id,status,deleted_at,deleted_from_status,images) values
        ('p2','archived',current_timestamp,'published','["/api/liara-media?url=two.webp"]'::jsonb);
      insert into divar_files(id,imported_property_id,filter_status) values
        ('d1','p1','imported'), ('d2','p2','imported'), ('d3',null,'accepted'), ('d4','p3','imported');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
        const result = await db.query<T>(text, params as any[]);
        return result.rows;
      },
    };

    const bulk = await deleteDivarRows(sql, ["d1", "d2", "d3", "missing", "d1"]);
    assert.deepEqual(bulk, { deleted: 3, unpublished: 1, skipped: 1 });
    const single = await deleteDivarRows(sql, ["d4"]);
    assert.deepEqual(single, { deleted: 1, unpublished: 1, skipped: 0 });

    const remainingRows = await db.query<{ count: number }>("select count(*)::int as count from divar_files");
    assert.equal(remainingRows.rows[0]?.count, 0);
    const trashed = await db.query<{ id: string; status: string; deleted_at: string | null; featured: boolean; images: string[] }>(
      "select id,status,deleted_at,featured,images from properties order by id",
    );
    const p1 = trashed.rows.find((row) => row.id === "p1");
    const p2 = trashed.rows.find((row) => row.id === "p2");
    const p3 = trashed.rows.find((row) => row.id === "p3");
    assert.equal(p1?.status, "archived");
    assert.ok(p1?.deleted_at);
    assert.equal(p1?.featured, false);
    assert.deepEqual(p1?.images, ["/api/liara-media?url=one.webp"]);
    assert.ok(p2?.deleted_at, "a previously trashed property stays in trash");
    assert.equal(p2?.status, "archived");
    assert.deepEqual(p2?.images, ["/api/liara-media?url=two.webp"]);
    assert.equal(p3?.status, "archived");
    assert.ok(p3?.deleted_at);
    assert.deepEqual(p3?.images, ["/api/liara-media?url=three.webp"]);
    const history = await db.query<{ count: number }>("select count(*)::int as count from property_change_history where action='deleted'");
    assert.equal(history.rows[0]?.count, 2, "only newly trashed properties get a deletion audit record");

    const restore = async (id: string, canPublish: boolean) => db.query<{ status: string }>(
      `update properties
          set status = case
            when deleted_from_status = 'published' and $2::boolean = false then 'draft'
            when deleted_from_status in ('draft','published','archived') then deleted_from_status
            else 'draft'
          end,
          deleted_at = null,
          deleted_from_status = null,
          updated_at = current_timestamp
        where id = $1 and deleted_at is not null
        returning status`,
      [id, canPublish],
    );
    const restoredP1 = await restore("p1", false);
    const restoredP3 = await restore("p3", true);
    assert.equal(restoredP1.rows[0]?.status, "draft", "restore without publish permission does not republish a live listing");
    assert.equal(restoredP3.rows[0]?.status, "published");
    const restored = await db.query<{ id: string; deleted_at: string | null; images: string[] }>(
      "select id,deleted_at,images from properties where id = any($1::text[]) order by id",
      [["p1", "p3"]],
    );
    assert.equal(restored.rows.every((row) => row.deleted_at === null), true);
    assert.deepEqual(restored.rows.find((row) => row.id === "p1")?.images, ["/api/liara-media?url=one.webp"]);
    assert.deepEqual(restored.rows.find((row) => row.id === "p3")?.images, ["/api/liara-media?url=three.webp"]);
  } finally {
    await db.close();
  }
});

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
