import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
  formatFfmpegExecutionError,
  resolveBundledFfmpeg,
} from "@/lib/watermark-runtime.server";

const execFileAsync = promisify(execFile);

export type PropertyVideoQuality = "480" | "720" | "1080";

export type PropertyVideoRendition = {
  quality: PropertyVideoQuality;
  data: Buffer;
  contentType: "video/mp4";
  pathname: string;
};

type VideoDimensions = { width: number; height: number };

function inputExtension(contentType: string): string {
  if (contentType === "video/webm") return ".webm";
  if (contentType === "video/quicktime") return ".mov";
  return ".mp4";
}

function basePath(pathname: string): string {
  const slash = pathname.lastIndexOf("/");
  const dot = pathname.lastIndexOf(".");
  return dot > slash ? pathname.slice(0, dot) : pathname;
}

function parseDimensions(text: string): VideoDimensions | null {
  const match = text.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return { width, height };
}

async function probeDimensions(ffmpeg: string, inputPath: string): Promise<VideoDimensions> {
  try {
    await execFileAsync(ffmpeg, [
      "-hide_banner",
      "-i", inputPath,
      "-frames:v", "1",
      "-an",
      "-f", "null",
      "-",
    ], {
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const detail = error && typeof error === "object"
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : "";
    const dimensions = parseDimensions(detail);
    if (dimensions) return dimensions;
    throw new Error("ویدئو قابل خواندن نیست یا اطلاعات وضوح آن قابل تشخیص نیست.");
  }
  throw new Error("FFmpeg اطلاعات وضوح ویدئو را برنگرداند.");
}

function supportedQualities(dimensions: VideoDimensions): Array<{
  quality: PropertyVideoQuality;
  maxWidth: number;
  maxHeight: number;
  crf: number;
}> {
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const portrait = dimensions.height > dimensions.width;
  const targets = [
    { quality: "480" as const, edge: 480, crf: 23 },
    { quality: "720" as const, edge: 720, crf: 22 },
    { quality: "1080" as const, edge: 1080, crf: 21 },
  ];

  return targets
    .filter((target) => shortEdge >= target.edge)
    .map((target) => ({
      quality: target.quality,
      maxWidth: portrait ? target.edge : Math.round(target.edge * 16 / 9),
      maxHeight: portrait ? Math.round(target.edge * 16 / 9) : target.edge,
      crf: target.crf,
    }));
}

/**
 * Produce separate MP4 files suitable for progressive playback and manual quality
 * selection. Inputs are never upscaled; a video below 480p remains as uploaded
 * and therefore does not advertise quality choices it cannot actually provide.
 */
export async function createPropertyVideoRenditions(input: {
  data: Buffer;
  contentType: string;
  pathname: string;
}): Promise<PropertyVideoRendition[] | null> {
  if (!input.contentType.startsWith("video/")) return null;

  const ffmpeg = resolveBundledFfmpeg();
  if (!ffmpeg || !existsSync(ffmpeg)) {
    throw new Error("ابزار تبدیل کیفیت ویدئو (FFmpeg) در محیط سرور در دسترس نیست.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "hirmand-video-quality-"));
  const inputPath = join(workDir, "source" + inputExtension(input.contentType));
  try {
    await writeFile(inputPath, input.data);

    let dimensions: VideoDimensions;
    try {
      await execFileAsync(ffmpeg, [
        "-hide_banner",
        "-i", inputPath,
        "-frames:v", "1",
        "-an",
        "-f", "null",
        "-",
      ], {
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      // FFmpeg commonly reports its probe information on stderr. For a
      // successful one-frame decode, stdout/stderr are returned directly.
      const probed = await execFileAsync(ffmpeg, [
        "-hide_banner", "-i", inputPath, "-frames:v", "1", "-an", "-f", "null", "-",
      ], { timeout: 45_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      dimensions = parseDimensions(String(probed.stderr ?? "")) ?? { width: 1920, height: 1080 };
    } catch (error) {
      const details = error && typeof error === "object"
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
      const dimensionsFromError = parseDimensions(details);
      if (!dimensionsFromError) {
        throw new Error("وضوح ویدئو قابل تشخیص نیست: " + formatFfmpegExecutionError(error));
      }
      dimensions = dimensionsFromError;
    }

    const qualities = supportedQualities(dimensions);
    if (!qualities.length) return null;

    const outputs: PropertyVideoRendition[] = [];
    for (const quality of qualities) {
      const outputPath = join(workDir, quality.quality + "p.mp4");
      const args = [
        "-hide_banner", "-loglevel", "error", "-y",
        "-filter_threads", "1", "-threads", "1",
        "-i", inputPath,
        "-map", "0:v:0", "-map", "0:a?",
        "-vf",
        `scale=w='min(${quality.maxWidth},iw)':h='min(${quality.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", String(quality.crf),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-map_metadata", "-1",
        "-threads", "1",
        outputPath,
      ];
      try {
        await execFileAsync(ffmpeg, args, {
          timeout: 12 * 60 * 1000,
          maxBuffer: 8 * 1024 * 1024,
          windowsHide: true,
        });
      } catch (error) {
        throw new Error(
          `ساخت نسخه ${quality.quality}p ویدئو ناموفق بود: ${formatFfmpegExecutionError(error)}`,
        );
      }

      const data = await readFile(outputPath);
      if (data.length < 12 || data.subarray(4, 8).toString("latin1") !== "ftyp") {
        throw new Error(`خروجی ${quality.quality}p یک فایل MP4 معتبر نیست.`);
      }
      outputs.push({
        quality: quality.quality,
        data,
        contentType: "video/mp4",
        pathname: `${basePath(input.pathname)}-${quality.quality}p.mp4`,
      });
    }

    return outputs;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
