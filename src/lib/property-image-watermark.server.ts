import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
// Relative (same-directory) imports keep the module loadable by the plain Node
// test runner, which does not resolve the `@/` alias used at build time.
import { contentMatchesDeclaredType } from "./file-signature.server.ts";
import {
  formatFfmpegExecutionError,
  resolveBrandLogo,
  resolveBundledFfmpeg,
  resolveLocalFontFallback,
  resolveWatermarkFont,
} from "./watermark-runtime.server.ts";
import type { PropertyWatermarkSettings } from "@/lib/property-watermark";

const execFileAsync = promisify(execFile);/** Find the first candidate that actually exists on disk. */
function findExisting(candidates: Array<string | null>): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * System fonts commonly present on Debian/Ubuntu Node hosts, used only when the
 * provisioned Vazirmatn font is absent. drawtext needs a TTF/OTF here.
 */
const SYSTEM_FONT_CANDIDATES = [
  "/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf",
  "/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

/**
 * Resolve the watermark assets once per call. The shared helper searches the
 * app root (`process.cwd()`), an explicit override and the module's ancestors,
 * so the same lookup works for `src/`, a bundled Nitro chunk and Liara.
 */
function resolveFontPath(): string | null {
  return findExisting([
    resolveWatermarkFont(),
    ...SYSTEM_FONT_CANDIDATES,
    // Best-effort WOFF2 fallback for local dev; not all FFmpeg builds accept it.
    resolveLocalFontFallback(),
  ]);
}

function resolveFfmpegBinary(): string {
  // Last resort: assume ffmpeg is on PATH (works in some container/dev setups).
  return resolveBundledFfmpeg() ?? "ffmpeg";
}

function filterPath(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

function inputExtension(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/avif":
      return ".avif";
    case "image/gif":
      return ".gif";
    default:
      return ".img";
  }
}

/**
 * Permanent image watermark using FFmpeg drawtext + overlay.
 *
 * Returns the processed WebP bytes and a new pathname, or throws a typed error
 * when watermarking is requested but cannot be performed safely.
 *
 * IMPORTANT: This function is called during the upload finalization path. If it
 * throws, the whole upload fails with HTTP 500. To avoid that, callers should
 * only invoke this when watermarking is both enabled and feasible; otherwise they
 * should skip transformation and store the original image.
 */
export async function applyPropertyImageWatermarkServer(
  input: {
    data: Buffer;
    contentType: string;
    pathname: string;
    settings: PropertyWatermarkSettings;
  }
): Promise<{
  data: Buffer;
  contentType: "image/webp";
  pathname: string;
}> {
  const { data, pathname, settings, contentType } = input;

  if (
    !settings.enabled ||
    !contentType.startsWith("image/") ||
    (!settings.showLogo && !(settings.showText && settings.text.trim()))
  ) {
    throw new Error(
      "این تابع فقط برای تصویرهایی با واترمارک فعال استفاده می‌شود."
    );
  }

  if (contentType === "image/gif") {
    throw new Error(
      "واترمارک دائمی برای GIF متحرک پشتیبانی نمی‌شود؛ تصویر را به WebP یا JPEG تبدیل کنید یا واترمارک را در تنظیمات غیرفعال کنید."
    );
  }

  const logoPath = settings.showLogo ? resolveBrandLogo() : null;
  const fontPath = settings.showText ? resolveFontPath() : null;

  if (settings.showLogo && !logoPath) {
    throw new Error(
      "فایل لوگوی رسمی هیرمند برای واترمارک تصویر پیدا نشد."
    );
  }
  if (settings.showText && !fontPath) {
    throw new Error(
      "فونت مناسب برای واترمارک فارسی پیدا نشد؛ نصب فونت Noto یا DejaVu را بررسی کنید."
    );
  }

  if (!resolveBundledFfmpeg()) {
    throw new Error(
      "ابزار تنظیم تصویر (FFmpeg) در محیط فعلی در دسترس نیست."
    );
  }

  const workDir = await mkdtemp(
    join(tmpdir(), "hirmand-image-watermark-")
  );
  const inputPath = join(workDir, "input" + inputExtension(contentType));
  const outputPath = join(workDir, "watermarked.webp");
  const textPath = join(workDir, "watermark.txt");

  try {
    await writeFile(inputPath, data);
    if (settings.showText)
      await writeFile(textPath, settings.text.trim(), "utf8");

    const opacity = Math.max(0.2, Math.min(1, settings.opacity));
    const alpha = (opacity * 0.78).toFixed(3);
    const size = Math.max(0.6, Math.min(1.6, settings.size));
    const drawingParts = settings.showText
      ? [`drawbox=x=iw*0.52:y=ih*0.84:w=iw*0.46:h=ih*0.13:color=0x081320@${alpha}:t=fill`]
      : [];

    if (settings.showText) {
      // drawtext evaluates its expressions against the *frame* dims exposed as
      // `main_w` / `main_h`. The `iw` / `ih` aliases that drawbox and scale use
      // are not defined inside drawtext, so sizing the text from `iw` made FFmpeg
      // abort with "Undefined constant ... in 'iw*0.012*...'", which surfaced as
      // HTTP 500 on every property-image upload.
      const fontSize = `18+main_w*0.012*${size.toFixed(3)}`;
      const textX = settings.showLogo ? "main_w-104-text_w" : "main_w-24-text_w";
      const textY = "main_h*0.875-text_h/2";
      drawingParts.push(
        `drawtext=fontfile='${filterPath(fontPath!)}':textfile='${filterPath(textPath)}':fontcolor=white@${opacity.toFixed(3)}:fontsize=${fontSize}:x=${textX}:y=${textY}:fix_bounds=1:borderw=1:bordercolor=0x081320@0.35:text_shaping=1`
      );
    }

    const scaleInput =
      "scale='min(2560,iw)':'min(2560,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];

    if (logoPath) {
      args.push("-loop", "1", "-i", logoPath);
      // Make the mark readable after full-size property photos are scaled in the UI.
      const logoHeight = Math.max(30, Math.round(90 * size));
      const position = settings.position ?? "bottom-right";
      const margin = Math.max(8, Math.round(16 * size));
      const overlayPosition: Record<string, string> = {
        "top-left": `x=${margin}:y=${margin}`,
        "top-right": `x=W-w-${margin}:y=${margin}`,
        "bottom-left": `x=${margin}:y=H-h-${margin}`,
        "bottom-right": `x=W-w-${margin}:y=H-h-${margin}`,
      };
      const baseFilters = [scaleInput, ...drawingParts].join(",");
      const filters = [
        `[0:v]${baseFilters}[wm_base]`,
        `[1:v]scale=${logoHeight}:-1,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[wm_logo]`,
        `[wm_base][wm_logo]overlay=${overlayPosition[position] ?? overlayPosition["bottom-right"]}:eof_action=repeat:shortest=1:format=auto[vout]`,
      ];
      args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    } else {
      args.push("-vf", `${scaleInput},${drawingParts.join(",")}`, "-map", "0:v:0");
    }

    args.push(
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "84",
      "-compression_level",
      "5",
      "-pix_fmt",
      "yuva420p",
      "-map_metadata",
      "-1",
      "-threads",
      "1",
      outputPath
    );

    try {
      await execFileAsync(resolveFfmpegBinary(), args, {
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
    } catch (error) {
      throw new Error(
        `پردازش دائمی واترمارک تصویر انجام نشد: ${formatFfmpegExecutionError(error)}`,
      );
    }

    const output = await readFile(outputPath);
    if (!output.length || !contentMatchesDeclaredType(output, "image/webp")) {
      throw new Error(
        "خروجی واترمارک تصویر معتبر نیست؛ تصویر بدون واترمارک منتشر نخواهد شد."
      );
    }

    const extensionIndex = pathname.lastIndexOf(".");
    const slashIndex = pathname.lastIndexOf("/");
    const basePath =
      extensionIndex > slashIndex ? pathname.slice(0, extensionIndex) : pathname;
    return {
      data: output,
      contentType: "image/webp",
      pathname: `${basePath || "properties/uploads/property-image"}-watermarked.webp`,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
