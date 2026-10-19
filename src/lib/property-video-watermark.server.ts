import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  resolveBrandLogo,
  resolveBundledFfmpeg,
  resolveLocalFontFallback,
  resolveWatermarkFont,
} from "./watermark-runtime.server.ts";
import type { PropertyWatermarkSettings } from "@/lib/property-watermark";

const execFileAsync = promisify(execFile);

/** Find the first candidate that actually exists on disk. */
function findExisting(candidates: Array<string | null>): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** System fonts used only when the provisioned Vazirmatn font is absent. */
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
    resolveLocalFontFallback(),
  ]);
}

function resolveFfmpegBinary(): string {
  // Last resort: assume ffmpeg is on PATH.
  return resolveBundledFfmpeg() ?? "ffmpeg";
}

function filterPath(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

function opacityAlpha(opacity: number) {
  return Math.max(0.2, Math.min(1, opacity)) * 0.78;
}

/**
 * Permanent video watermark using FFmpeg drawtext + overlay.
 *
 * Returns the processed MP4 bytes and a new pathname, or throws a typed error
 * when watermarking is requested but cannot be performed safely.
 *
 * IMPORTANT: This function is called during the upload finalization path. If it
 * throws, the whole upload fails with HTTP 500. To avoid that, callers should
 * only invoke this when watermarking is both enabled and feasible; otherwise they
 * should skip transformation and store the original video.
 */
export async function applyPropertyVideoWatermark(
  input: {
    data: Buffer;
    contentType: string;
    pathname: string;
    settings: PropertyWatermarkSettings;
  }
): Promise<{
  data: Buffer;
  contentType: "video/mp4";
  pathname: string;
}> {
  const { data, pathname, settings } = input;

  if (
    !settings.enabled ||
    !input.contentType.startsWith("video/") ||
    (!settings.showLogo && !(settings.showText && settings.text.trim()))
  ) {
    throw new Error(
      "این تابع فقط برای ویدئوهای دارای واترمارک فعال استفاده می‌شود."
    );
  }

  const logoPath = settings.showLogo ? resolveBrandLogo() : null;
  const fontPath = settings.showText ? resolveFontPath() : null;

  if (settings.showLogo && !logoPath) {
    throw new Error(
      "فایل لوگوی هیرمند برای واترمارک ویدئو پیدا نشد."
    );
  }
  if (settings.showText && !fontPath) {
    throw new Error(
      "فونت مناسب برای رندر نام سایت در واترمارک ویدئو پیدا نشد."
    );
  }

  if (!resolveBundledFfmpeg()) {
    throw new Error(
      "ابزار تنظیم ویدئو (FFmpeg) در محیط فعلی در دسترس نیست."
    );
  }

  const workDir = await mkdtemp(
    join(tmpdir(), "hirmand-video-watermark-")
  );
  const inputExtension =
    input.contentType === "video/webm"
      ? ".webm"
      : input.contentType === "video/quicktime"
        ? ".mov"
        : ".mp4";
  const inputPath = join(workDir, "input" + inputExtension);
  const outputPath = join(workDir, "watermarked.mp4");
  const textPath = join(workDir, "watermark.txt");

  try {
    await writeFile(inputPath, data);
    if (settings.showText) {
      await writeFile(textPath, settings.text.trim(), "utf8");
    }

    const alpha = opacityAlpha(settings.opacity).toFixed(3);
    const filters: string[] = [];
    const panelParts = [
      `drawbox=x=iw*0.52:y=ih*0.84:w=iw*0.46:h=ih*0.13:color=0x081320@${alpha}:t=fill`,
    ];

    if (settings.showText) {
      // drawtext only understands the frame-size aliases `main_w` / `main_h`.
      // `iw` / `ih` are drawbox/scale aliases and make FFmpeg abort with
      // "Undefined constant" while initialising the filter graph.
      const fontSize = `18+main_w*0.012*${settings.size.toFixed(3)}`;
      const textX = settings.showLogo ? "main_w-104-text_w" : "main_w-24-text_w";
      const textY = "main_h*0.875-text_h/2";
      panelParts.push(
        `drawtext=fontfile='${filterPath(fontPath!)}':textfile='${filterPath(textPath)}':fontcolor=white:fontsize=${fontSize}:x=${textX}:y=${textY}:fix_bounds=1:borderw=1:bordercolor=0x081320@0.35:text_shaping=1`
      );
    }

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
    ];

    if (logoPath) {
      args.push("-loop", "1", "-i", logoPath);
      const overlayScale = Math.max(42, Math.round(58 * settings.size));
      filters.push(
        `[1:v]scale=${overlayScale}:-1[wm_logo]`,
        `[0:v]${panelParts.join(",")}[wm_base]`,
        // `-loop 1` makes the logo input endless, so overlay MUST stop at the
        // shortest stream. With `shortest=0` the graph never reaches EOF and the
        // encode runs until the 8-minute command timeout, failing every video
        // upload. `shortest=1` ends the output with the source video.
        "[wm_base][wm_logo]overlay=x=w-82:y=h-0.085*h:eof_action=repeat:shortest=1:format=auto[vout]"
      );
      args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    } else {
      args.push("-vf", panelParts.join(","), "-map", "0:v:0");
    }

    args.push(
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-threads",
      "1",
      outputPath
    );

    try {
      await execFileAsync(resolveFfmpegBinary(), args, {
        timeout: 8 * 60 * 1000,
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
          ? `پردازش دائمی واترمارک ویدئو انجام نشد: ${detail.trim().slice(-1200)}`
          : "پردازش دائمی واترمارک ویدئو انجام نشد. وجود FFmpeg و دسترسی اجرای آن را بررسی کنید.",
      );
    }

    const output = await readFile(outputPath);
    if (!output.length) {
      throw new Error(
        "FFmpeg فایل ویدئوی نهایی را خالی تولید کرد."
      );
    }

    const baseName =
      pathname.split("/").pop()?.replace(/\\.[^.]+$/, "") ||
      "property-video";
    return {
      data: output,
      contentType: "video/mp4",
      pathname: `properties/uploads/${baseName}-watermarked.mp4`,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
