#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "public", "images", "fallback");
const manifestPath = join(root, "scripts", "fallback-source-images.json");
const sources = JSON.parse(await readFile(manifestPath, "utf8"));
const forceRefresh = process.env.FORCE_FALLBACK_IMAGE_REFRESH === "1";

function hasRasterMagic(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return true;
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return true;
  return false;
}

function isUsableFile(output) {
  try {
    if (statSync(output).size <= 1024) return false;
    return hasRasterMagic(readFileSync(output).subarray(0, 32));
  } catch {
    return false;
  }
}

async function download(url, output) {
  const temp = output + ".part";
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Hirmand-Real-Estate-fallback-assets/3.1",
        accept: "image/jpeg,image/webp,image/avif,image/*;q=0.8",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok || !response.body) {
      throw new Error("HTTP " + response.status + " while downloading " + url);
    }

    await pipeline(response.body, createWriteStream(temp));
    const bytes = await readFile(temp);
    if (bytes.length <= 1024 || !hasRasterMagic(bytes.subarray(0, 32))) {
      throw new Error("downloaded response is not a valid raster image");
    }

    renameSync(temp, output);
  } finally {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(temp);
    } catch {
      // No temporary file to clean.
    }
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true });

  const tasks = Object.entries(sources).flatMap(([type, urls]) =>
    urls.map((url, index) => ({ type, url, index })),
  );
  const concurrency = 4;
  const maxAttempts = 3;
  let cursor = 0;
  let success = 0;
  let skipped = 0;
  let failed = 0;

  async function worker() {
    while (true) {
      const task = tasks[cursor++];
      if (!task) return;

      const number = String(task.index + 1).padStart(2, "0");
      const output = join(outputDir, task.type + "-" + number + ".jpg");

      if (!forceRefresh && isUsableFile(output)) {
        skipped += 1;
        continue;
      }

      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          console.log(
            "[fallback-assets] downloading " + task.type + "-" + number +
            " (attempt " + attempt + "/" + maxAttempts + ")",
          );
          await download(task.url, output);
          success += 1;
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
          }
        }
      }

      if (lastError) {
        failed += 1;
        console.warn(
          "[fallback-assets] unavailable " + task.type + "-" + number + ": " +
          (lastError instanceof Error ? lastError.message : String(lastError)),
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

  const missingApartmentPhotos = (sources.apartment ?? []).flatMap((_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const output = join(outputDir, "apartment-" + number + ".jpg");
    return isUsableFile(output) ? [] : [output];
  });

  console.log(
    "[fallback-assets] ready: " + success + " downloaded, " +
    skipped + " cached, " + failed + " unavailable. concurrency=" + concurrency,
  );

  if (missingApartmentPhotos.length) {
    console.warn(
      "[fallback-assets] WARNING: " + missingApartmentPhotos.length +
      " apartment photos could not be downloaded in this build environment: " +
      missingApartmentPhotos.map((path) => path.split(/[\\/]/).pop()).join(", ") +
      ". The app will keep its local SVG emergency fallbacks; check outbound access to images.unsplash.com.",
    );
  }
}

main().catch((error) => {
  console.error("[fallback-assets] generator failed:", error);
  process.exitCode = 1;
});
