import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { contentMatchesDeclaredType } from "@/lib/file-signature.server";
import type { PropertyWatermarkSettings } from "@/lib/property-watermark";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Base directories that may contain project/public assets in dev or deploy.
 *
 * We avoid `process.cwd()` because in some deployments (Liara, Vercel-style
 * container starts, preview servers) the working directory is not the repo root
 * and paths like `public/images/...` are not resolvable relative to it.
 */
function projectAssetDirs(): string[] {
  const dirs = [
    join(__dirname, "..", "public"),
    join(__dirname, "..", "..", "public"),
  ];
  try {
    const cwd = process.cwd();
    if (cwd && cwd !== "/" && cwd !== ".") {
      dirs.push(join(cwd, "public"));
    }
  } catch {
    // ignore
  }
  // Deduplicate while preserving order.
  const seen = new Set<string>();
  return dirs.filter((d) => seen.has(d) ? false : seen.add(d));
}

/** Find the first candidate that actually exists on disk. */
function findExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * True when a ffmpeg+runtime tree looks provisioned (binary + font present).
 *
 * We check both the `__dirname`-relative `.runtime` tree and the CWD-based one
 * because different deployment layouts place `.runtime` in different spots.
 */
function runtimeTreeHasAssets(): boolean {
  const candidates = [
    // __dirname-based (most reliable for bundled servers).
    join(__dirname, "..", ".runtime", "ffmpeg"),
    join(__dirname, "..", "..", ".runtime", "ffmpeg"),
    // CWD-based (some local/dev layouts).
    ...projectAssetDirs().map((d) => join(d, "..", ".runtime", "ffmpeg")),
  ];

  for (const base of candidates) {
    try {
      if (!existsSync(base)) continue;
      if (
        existsSync(join(base, "ffmpeg")) ||
        existsSync(join(base, "ffmpeg.exe"))
      ) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  // Font-only presence is not enough to watermark images (we need ffmpeg), but
  // we record it anyway for diagnostics. The real gate is the ffmpeg binary.
  return false;
}

const LOGO_CANDIDATES = [
  // Dev layout: public/ next to src/.
  ...projectAssetDirs().map(
    (d) => join(d, "images", "hirmand-logo.png")
  ),
  // Deployed Nitro output layout (nitro puts server assets under .output).
  join(__dirname, "..", "..", ".output", "public", "images", "hirmand-logo.png"),
  // Some build layouts stage public assets under .runtime/public.
  join(__dirname, ".runtime", "public", "images", "hirmand-logo.png"),
  join(__dirname, "..", ".runtime", "public", "images", "hirmand-logo.png"),
];

const FONT_CANDIDATES = [
  // Explicit operator override (Liara env var or local test override).
  ...(process.env.HIRMAND_WATERMARK_FONT?.trim()
    ? [process.env.HIRMAND_WATERMARK_FONT.trim()]
    : []),
  // Provisioned and checksum-verified by scripts/ensure-ffmpeg.mjs during prebuild.
  // Use __dirname-based paths so they work regardless of process.cwd() at runtime.
  join(__dirname, ".runtime", "fonts", "Vazirmatn-Regular.ttf"),
  join(__dirname, "..", ".runtime", "fonts", "Vazirmatn-Regular.ttf"),
  join(__dirname, "..", "..", ".runtime", "fonts", "Vazirmatn-Regular.ttf"),
  // System fonts commonly available on Debian/Ubuntu-based Node hosts (including many
  // Liara container images). These are fallbacks only; the project font is preferred.
  "/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf",
  "/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  // Local dev fallback when neither runtime provisioning nor system fonts exist.
  // drawtext officially wants TTF/OTF, but some FFmpeg builds accept WOFF2 as well;
  // treat this as a best-effort fallback only.
  join(
    __dirname,
    "..",
    "node_modules",
    "@fontsource",
    "vazirmatn",
    "files",
    "vazirmatn-arabic-400-normal.woff2"
  ),
];

function resolveFfmpegBinary(): string {
  const configured = process.env.FFMPEG_BIN?.trim();
  if (configured && existsSync(configured)) return configured;

  // __dirname-based runtime tree (most reliable for deployed servers).
  const bundledPaths = [
    join(__dirname, ".runtime", "ffmpeg", "ffmpeg.exe"),
    join(__dirname, ".runtime", "ffmpeg", "ffmpeg"),
    join(__dirname, "..", ".runtime", "ffmpeg", "ffmpeg.exe"),
    join(__dirname, "..", ".runtime", "ffmpeg", "ffmpeg"),
    join(__dirname, "..", "..", ".runtime", "ffmpeg", "ffmpeg.exe"),
    join(__dirname, "..", "..", ".runtime", "ffmpeg", "ffmpeg"),
  ];
  for (const bundled of bundledPaths) {
    if (existsSync(bundled)) return bundled;
  }

  // CWD-based runtime tree (some local/dev layouts).
  try {
    const cwd = process.cwd();
    if (cwd) {
      const cwdPaths = [
        join(cwd, ".runtime", "ffmpeg", "ffmpeg.exe"),
        join(cwd, ".runtime", "ffmpeg", "ffmpeg"),
      ];
      for (const bundled of cwdPaths) {
        if (existsSync(bundled)) return bundled;
      }
    }
  } catch {
    // ignore
  }

  // Last resort: assume ffmpeg is on PATH (works in some container/dev setups).
  return "ffmpeg";
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

  const logoPath = settings.showLogo ? findExisting(LOGO_CANDIDATES) : null;
  const fontPath = settings.showText ? findExisting(FONT_CANDIDATES) : null;

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

  if (!runtimeTreeHasAssets()) {
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
    const drawingParts = [
      `drawbox=x=iw*0.52:y=ih*0.84:w=iw*0.46:h=ih*0.13:color=0x081320@${alpha}:t=fill`,
    ];

    if (settings.showText) {
      const fontSize = `18+iw*0.012*${size.toFixed(3)}`;
      const textX = settings.showLogo ? "w-104-text_w" : "w-24-text_w";
      const textY = "h-0.125*h-text_h/2";
      drawingParts.push(
        `drawtext=fontfile='${filterPath(fontPath!)}':textfile='${filterPath(textPath)}':fontcolor=white@${opacity.toFixed(3)}:fontsize=${fontSize}:x=${textX}:y=${textY}:fix_bounds=1:borderw=1:bordercolor=0x081320@0.35:text_shaping=1`
      );
    }

    const scaleInput =
      "scale='min(2560,iw)':'min(2560,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];

    if (logoPath) {
      args.push("-loop", "1", "-i", logoPath);
      const logoHeight = Math.max(24, Math.round(58 * size));
      const filters = [
        `[0:v]${scaleInput},${drawingParts.join(",")}[wm_base]`,
        `[1:v]scale=${logoHeight}:-1,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[wm_logo]`,
        "[wm_base][wm_logo]overlay=x=w-82:y=h-0.085*h:eof_action=repeat:shortest=1:format=auto[vout]",
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
      const detail =
        typeof error === "object" &&
        error !== null &&
        "stderr" in error
          ? String((error as { stderr?: unknown }).stderr ?? "")
          : "";
      throw new Error(
        detail.trim()
          ? `پردازش دائمی واترمارک تصویر انجام نشد: ${detail.trim().slice(-900)}`
          : "پردازش واترمارک تصویر انجام نشد. وجود FFmpeg و پشتیبانی WebP را بررسی کنید.",
      );
    }

    const output = await readFile(outputPath);
    if (!output.length || !contentMatchesDeclaredType(output, "image/webp")) {
      throw new Error(
        "خروجی واترمارک تصویر معتبر نیست؛ تصویر بدون واترمارک منتشر نخواهد شد."
      );
    }

    const baseName =
      pathname.split("/").pop()?.replace(/\\.[^.]+$/, "") || "property-image";
    return {
      data: output,
      contentType: "image/webp",
      pathname: `properties/uploads/${baseName}-watermarked.webp`,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
