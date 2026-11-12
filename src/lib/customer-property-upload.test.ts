import assert from "node:assert/strict";
import test from "node:test";
import { appendCustomerPropertyMedia, MAX_MEDIA, uploadCustomerPropertyFiles } from "./customer-property-upload.ts";

test("keeps each successful customer upload when a later file fails", async () => {
  let media = ["existing-media"];

  await assert.rejects(
    uploadCustomerPropertyFiles(
      ["file-1", "file-2"],
      async (file) => {
        if (file === "file-2") throw new Error("second upload failed");
        return "first-upload-url";
      },
      (url) => {
        media = appendCustomerPropertyMedia(media, url);
      },
    ),
    /second upload failed/,
  );

  assert.deepEqual(media, ["existing-media", "first-upload-url"]);
});

test("deduplicates successful URLs and enforces the media limit", () => {
  const fullMedia = Array.from({ length: MAX_MEDIA - 1 }, (_, index) => `media-${index}`);

  assert.deepEqual(appendCustomerPropertyMedia(fullMedia, fullMedia[0]!), fullMedia);
  assert.deepEqual(appendCustomerPropertyMedia(fullMedia, "last-media"), [...fullMedia, "last-media"]);
  assert.deepEqual(appendCustomerPropertyMedia([...fullMedia, "last-media"], "overflow"), [...fullMedia, "last-media"]);
});
