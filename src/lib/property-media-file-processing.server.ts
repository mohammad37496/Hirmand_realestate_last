import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { open, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { contentMatchesDeclaredType } from "./file-signature.server.ts";
import {
  formatFfmpegExecutionError,
  resolveBrandLogo,
  resolveBundledFfmpeg,
  resolveLocalFontFallback,
  resolveWatermarkFont,
} from "./watermark-runtime.server.ts";
import type { PropertyWatermarkSettings } from "./property-watermark";

const execFileAsync = promisify(execFile);

const SYSTEM_FONT_CANDIDATES = [
  "/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf",
  "/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

function findExisting(candidates: Array<string | null>): string | null {
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function resolveFontPath(): string | null {
  return findExisting([
    resolveWatermarkFont(),
    ...SYSTEM_FONT_CANDIDATES,
    resolveLocalFontFallback(),
  ]);
}

function filterPath(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

function basePath(pathname: string): string {
  const slashIndex = pathname.lastIndexOf("/");
  const extensionIndex = pathname.lastIndexOf(".");
  return extensionIndex > slashIndex ? pathname.slice(0, extensionIndex) : pathname;
}

/**
 * Large-file watermarking keeps source and output on temporary disk. Only FFmpeg's
 * bounded working buffers occupy RAM; the full upload is never read into a Buffer.
 * The caller owns workDir and removes it after storage finishes.
 */
export async function watermarkPropertyMediaFile(input: {
  inputPath: string;
  contentType: string;
  pathname: string;
  workDir: string;
  settings: PropertyWatermarkSettings;
}): Promise<{ path: string; contentType: string; pathname: string }> {
  const { inputPath, contentType, pathname, workDir, settings } = input;
  if (
    !settings.enabled ||
    !contentType.startsWith("image/") && !contentType.startsWith("video/") ||
    (!settings.showLogo && !(settings.showText && settings.text.trim()))
  ) {
    throw new Error("تنظیمات واترمارک فایل معتبر نیست.");
  }
  if (contentType === "image/gif") {
    throw new Error("برای حفظ انیمیشن GIF، واترمارک دائمی پشتیبانی نمی‌شود؛ واترمارک را خاموش کنید یا تصویر ثابت انتخاب کنید.");
  }

  const ffmpeg = resolveBundledFfmpeg();
  if (!ffmpeg) throw new Error("ابزار FFmpeg برای پردازش رسانه در دسترس نیست.");
  const logoPath = settings.showLogo ? resolveBrandLogo() : null;
  const fontPath = settings.showText ? resolveFontPath() : null;
  if (settings.showLogo && !logoPath) throw new Error("فایل لوگوی هیرمند برای واترمارک پیدا نشد.");
  if (settings.showText && !fontPath) throw new Error("فونت مناسب برای واترمارک فارسی پیدا نشد.");

  const textPath = join(workDir, "watermark.txt");
  if (settings.showText) await writeFile(textPath, settings.text.trim(), "utf8");
  const base = basePath(pathname) || "properties/uploads/property-media";
  const isVideo = contentType.startsWith("video/");
  const outputPath = join(workDir, isVideo ? "watermarked.mp4" : "watermarked.webp");
  const opacity = Math.max(0.2, Math.min(1, settings.opacity));
  const alpha = (opacity * 0.78).toFixed(3);
  const size = Math.max(0.6, Math.min(1.6, settings.size));
  const filters: string[] = [];
  const args = ["-hide_banner", "-loglevel", "error", "-y"];

  if (isVideo) {
    args.push("-filter_threads", "1", "-filter_complex_threads", "1", "-threads", "1", "-i", inputPath);
    const videoScale = "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    const panelParts = settings.showText
      ? [`drawbox=x=iw*0.52:y=ih*0.84:w=iw*0.46:h=ih*0.13:color=0x081320@${alpha}:t=fill`]
      : [];
    if (settings.showText) {
      const fontSize = `18+main_w*0.012*${size.toFixed(3)}`;
      const textX = settings.showLogo ? "main_w-104-text_w" : "main_w-24-text_w";
      panelParts.push(`drawtext=fontfile='${filterPath(fontPath!)}':textfile='${filterPath(textPath)}':fontcolor=white:fontsize=${fontSize}:x=${textX}:y=main_h*0.875-text_h/2:fix_bounds=1:borderw=1:bordercolor=0x081320@0.35:text_shaping=1`);
    }
    if (logoPath) {
      args.push("-loop", "1", "-i", logoPath);
      const overlayScale = Math.max(30, Math.round(90 * size));
      const margin = Math.max(8, Math.round(16 * size));
      const position = settings.position ?? "bottom-right";
      const overlayPosition: Record<string, string> = {
        "top-left": `x=${margin}:y=${margin}`,
        "top-right": `x=W-w-${margin}:y=${margin}`,
        "bottom-left": `x=${margin}:y=H-h-${margin}`,
        "bottom-right": `x=W-w-${margin}:y=H-h-${margin}`,
      };
      filters.push(
        `[1:v]scale=${overlayScale}:-1,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[wm_logo]`,
        `[0:v]${[videoScale, ...panelParts].join(",")}[wm_base]`,
        `[wm_base][wm_logo]overlay=${overlayPosition[position] ?? overlayPosition["bottom-right"]}:eof_action=repeat:shortest=1:format=auto[vout]`,
      );
      args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    } else {
      args.push("-vf", [videoScale, ...panelParts].join(","), "-map", "0:v:0");
    }
    args.push("-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      "-map_metadata", "-1", "-threads", "1", outputPath);
  } else {
    if (!contentType.startsWith("image/")) throw new Error("فرمت تصویر برای واترمارک پشتیبانی نمی‌شود.");
    args.push("-i", inputPath);
    const drawingParts = settings.showText
      ? [`drawbox=x=iw*0.52:y=ih*0.84:w=iw*0.46:h=ih*0.13:color=0x081320@${alpha}:t=fill`]
      : [];
    if (settings.showText) {
      const fontSize = `18+main_w*0.012*${size.toFixed(3)}`;
      const textX = settings.showLogo ? "main_w-104-text_w" : "main_w-24-text_w";
      drawingParts.push(`drawtext=fontfile='${filterPath(fontPath!)}':textfile='${filterPath(textPath)}':fontcolor=white@${opacity.toFixed(3)}:fontsize=${fontSize}:x=${textX}:y=main_h*0.875-text_h/2:fix_bounds=1:borderw=1:bordercolor=0x081320@0.35:text_shaping=1`);
    }
    const scaleInput = "scale='min(2560,iw)':'min(2560,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    if (logoPath) {
      args.push("-loop", "1", "-i", logoPath);
      const logoHeight = Math.max(30, Math.round(90 * size));
      const margin = Math.max(8, Math.round(16 * size));
      const position = settings.position ?? "bottom-right";
      const overlayPosition: Record<string, string> = {
        "top-left": `x=${margin}:y=${margin}`,
        "top-right": `x=W-w-${margin}:y=${margin}`,
        "bottom-left": `x=${margin}:y=H-h-${margin}`,
        "bottom-right": `x=W-w-${margin}:y=H-h-${margin}`,
      };
      filters.push(
        `[0:v]${[scaleInput, ...drawingParts].join(",")}[wm_base]`,
        `[1:v]scale=${logoHeight}:-1,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[wm_logo]`,
        `[wm_base][wm_logo]overlay=${overlayPosition[position] ?? overlayPosition["bottom-right"]}:eof_action=repeat:shortest=1:format=auto[vout]`,
      );
      args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    } else {
      args.push("-vf", [scaleInput, ...drawingParts].join(","), "-map", "0:v:0");
    }
    args.push("-frames:v", "1", "-c:v", "libwebp", "-quality", "84",
      "-compression_level", "5", "-pix_fmt", "yuva420p", "-map_metadata", "-1",
      "-threads", "1", outputPath);
  }

  try {
    await execFileAsync(ffmpeg, args, {
      timeout: isVideo ? 8 * 60 * 1000 : 90_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(`پردازش دائمی واترمارک رسانه انجام نشد: ${formatFfmpegExecutionError(error)}`);
  }

  const outputStat = await stat(outputPath);
  if (!outputStat.size) throw new Error("خروجی واترمارک خالی است.");
  const outputHandle = await open(outputPath, "r");
  try {
    const probe = Buffer.alloc(32);
    const read = await outputHandle.read(probe, 0, probe.length, 0);
    const bytes = probe.subarray(0, read.bytesRead);
    const valid = isVideo
      ? bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp"
      : contentMatchesDeclaredType(bytes, "image/webp");
    if (!valid) throw new Error("خروجی واترمارک معتبر نیست؛ رسانه بدون واترمارک منتشر نخواهد شد.");
  } finally {
    await outputHandle.close();
  }

  return {
    path: outputPath,
    contentType: isVideo ? "video/mp4" : "image/webp",
    pathname: `${base}${isVideo ? "-watermarked.mp4" : "-watermarked.webp"}`,
  };
}
