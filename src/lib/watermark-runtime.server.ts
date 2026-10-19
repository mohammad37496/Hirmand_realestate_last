import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locates the runtime assets the permanent watermark needs (FFmpeg, the
 * Vazirmatn font, the brand logo).
 *
 * Why this is not a fixed `join(__dirname, "..", ...)`: Nitro bundles the
 * watermark modules into `.output/server/_chunks/`, so climbing a fixed number
 * of `..` steps lands inside `.output` and misses the repo-level `.runtime/`
 * tree that the prebuild provisions. Every upload then failed finalization with
 * "فونت مناسب برای واترمارک فارسی پیدا نشد" → HTTP 500. `process.cwd()` (the app
 * root on Liara) and an explicit `HIRMAND_PROJECT_ROOT` override are therefore
 * part of the search, alongside the walking-up-from-the-module candidates used
 * by the dev server and the unit tests.
 */

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Project roots that may contain `.runtime/`, `public/` and `node_modules/`. */
export function projectRoots(): string[] {
  const roots: string[] = [];

  const override = process.env.HIRMAND_PROJECT_ROOT?.trim();
  if (override) roots.push(resolve(override));

  try {
    const cwd = process.cwd();
    if (cwd) roots.push(cwd);
  } catch {
    // `process.cwd()` can throw when the directory was removed; ignore.
  }

  let dir = moduleDir;
  for (let depth = 0; depth < 6; depth += 1) {
    roots.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const seen = new Set<string>();
  return roots.filter((root) => {
    if (!root || seen.has(root)) return false;
    seen.add(root);
    return true;
  });
}

/** First existing `<root>/<segments…>` across every project root, else null. */
export function resolveFromProject(...segments: string[]): string | null {
  for (const root of projectRoots()) {
    const candidate = join(root, ...segments);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Bundled FFmpeg binary from `.runtime/ffmpeg`, or an explicit override. */
export function resolveBundledFfmpeg(): string | null {
  const configured = process.env.FFMPEG_BIN?.trim();
  if (configured && existsSync(configured)) return configured;

  const names =
    process.platform === "win32" ? ["ffmpeg.exe"] : ["ffmpeg", "ffmpeg.exe"];
  for (const name of names) {
    const found = resolveFromProject(".runtime", "ffmpeg", name);
    if (found) return found;
  }
  return null;
}

/** Provisioned Vazirmatn font from `.runtime/fonts`, or an explicit override. */
export function resolveWatermarkFont(): string | null {
  const configured = process.env.HIRMAND_WATERMARK_FONT?.trim();
  if (configured && existsSync(configured)) return configured;
  return resolveFromProject(".runtime", "fonts", "Vazirmatn-Regular.ttf");
}

/** Official Hirmand logo, from `public/` (or the staged `.output/public`). */
export function resolveBrandLogo(): string | null {
  return (
    resolveFromProject("public", "images", "hirmand-logo.png") ??
    resolveFromProject(".output", "public", "images", "hirmand-logo.png")
  );
}

/** A WOFF2 Vazirmatn fallback shipped with the app for local development. */
export function resolveLocalFontFallback(): string | null {
  return resolveFromProject(
    "node_modules",
    "@fontsource",
    "vazirmatn",
    "files",
    "vazirmatn-arabic-400-normal.woff2",
  );
}
