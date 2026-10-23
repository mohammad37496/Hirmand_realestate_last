import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { applyPropertyImageWatermarkServer } from "./property-image-watermark.server.ts";
import { applyPropertyVideoWatermark } from "./property-video-watermark.server.ts";
import { watermarkPropertyMediaFile } from "./property-media-file-processing.server.ts";
import type { PropertyWatermarkSettings } from "./property-watermark.ts";
import {
  formatFfmpegExecutionError,
  projectRoots,
  resolveBrandLogo,
  resolveBundledFfmpeg,
  resolveWatermarkFont,
} from "./watermark-runtime.server.ts";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..", "..");

/** Same lookup order the production modules use, restricted to what tests need. */
function ffmpegBinary(): string {
  const configured = process.env.FFMPEG_BIN?.trim();
  if (configured && existsSync(configured)) return configured;
  const bundled = join(projectRoot, ".runtime", "ffmpeg", "ffmpeg");
  return existsSync(bundled) ? bundled : "";
}

const FFMPEG = ffmpegBinary();
const LOGO = join(projectRoot, "public", "images", "hirmand-logo.png");
const FONT = join(projectRoot, ".runtime", "fonts", "Vazirmatn-Regular.ttf");
/** Real rendering needs the bundled binary plus the provisioned brand assets. */
const CAN_RENDER = Boolean(FFMPEG) && existsSync(LOGO) && existsSync(FONT);

const SETTINGS: PropertyWatermarkSettings = {
  enabled: true,
  showLogo: true,
  showText: true,
  text: "املاک هیرمند",
  opacity: 0.82,
  size: 1,
};

const imageSource = await readFile(
  new URL("./property-image-watermark.server.ts", import.meta.url),
  "utf8",
);
const videoSource = await readFile(
  new URL("./property-video-watermark.server.ts", import.meta.url),
  "utf8",
);

/**
 * The production build bundles these modules into `.output/server/_chunks/`,
 * where a fixed `join(__dirname, "..", ...)` misses the repo-level `.runtime/`
 * tree. That made every upload die in finalization with "font not found" →
 * HTTP 500, so the lookup must also consider the app root (`process.cwd()`).
 */
test("watermark assets resolve from the app root, not just the module directory", () => {
  assert.ok(
    projectRoots().includes(process.cwd()),
    "process.cwd() must be searched for .runtime/ and public/",
  );

  if (existsSync(FFMPEG)) {
    assert.equal(resolveBundledFfmpeg(), FFMPEG, "bundled FFmpeg must be found from the app root");
  }
  if (existsSync(LOGO)) {
    assert.equal(resolveBrandLogo(), LOGO, "brand logo must be found from the app root");
  }
  if (existsSync(FONT)) {
    assert.equal(resolveWatermarkFont(), FONT, "Vazirmatn font must be found from the app root");
  }

  const previous = process.env.HIRMAND_PROJECT_ROOT;
  process.env.HIRMAND_PROJECT_ROOT = projectRoot;
  try {
    assert.equal(projectRoots()[0], projectRoot, "HIRMAND_PROJECT_ROOT must win over the defaults");
  } finally {
    if (previous === undefined) delete process.env.HIRMAND_PROJECT_ROOT;
    else process.env.HIRMAND_PROJECT_ROOT = previous;
  }
});

/**
 * `drawtext` only exposes the frame size as `main_w` / `main_h`. The `iw` / `ih`
 * aliases belong to drawbox/scale; using them made FFmpeg abort with
 * "[Eval] Undefined constant ... in 'iw*0.012*0.900'", which is exactly the
 * HTTP 500 this suite exists to prevent from coming back.
 */
test("FFmpeg execution diagnostics preserve spawn and encoder failure causes", () => {
  const spawnError = Object.assign(
    new Error("spawn /app/.runtime/ffmpeg/ffmpeg EACCES"),
    { code: "EACCES", errno: -13, syscall: "spawn", path: "/app/.runtime/ffmpeg/ffmpeg" },
  );
  const spawnDiagnostic = formatFfmpegExecutionError(spawnError);
  assert.match(spawnDiagnostic, /code=EACCES/);
  assert.match(spawnDiagnostic, /syscall=spawn/);
  assert.match(spawnDiagnostic, /path=\/app\/\.runtime\/ffmpeg\/ffmpeg/);

  const encoderError = Object.assign(new Error("FFmpeg exited"), {
    code: 1,
    stderr: "Unknown encoder 'libx264'",
  });
  const encoderDiagnostic = formatFfmpegExecutionError(encoderError);
  assert.match(encoderDiagnostic, /code=1/);
  assert.match(encoderDiagnostic, /stderr=Unknown encoder 'libx264'/);
});

test("watermark filters use drawtext-safe frame variables", () => {
  for (const [name, source] of [
    ["image", imageSource],
    ["video", videoSource],
  ] as const) {
    const drawtextCalls = source
      .split("\n")
      .filter((line) => line.includes("drawtext=") && line.includes("fontsize="));
    assert.equal(drawtextCalls.length, 1, `${name} watermark should build exactly one drawtext filter`);
    for (const line of drawtextCalls) {
      assert.match(line, /fontsize=\$\{fontSize\}/, `${name} fontsize must come from the shared expression`);
      assert.match(line, /x=\$\{textX\}/, `${name} text x must come from the shared expression`);
      assert.match(line, /y=\$\{textY\}/, `${name} text y must come from the shared expression`);
    }

    assert.match(
      source,
      /[fF]ontSize = `18\+main_w\*0\.012\*/,
      `${name} watermark must size text from main_w, not the drawbox-only iw alias`,
    );
    assert.match(source, /main_w-104-text_w/, `${name} text must be offset from main_w`);
    assert.match(source, /main_h\*0\.875-text_h\/2/, `${name} text must be vertically centred from main_h`);
  }

  assert.doesNotMatch(imageSource, /fontsize=18\+iw\*/, "image fontsize must not use iw");
  assert.doesNotMatch(videoSource, /fontsize=18\+iw\*/, "video fontsize must not use iw");
});

/**
 * `-loop 1 -i logo` is an endless input. With overlay `shortest=0` the graph
 * never reaches EOF, so the encode ran until the 8 minute command timeout and
 * every video upload failed.
 */
test("video overlay ends with the source video instead of the endless logo", () => {
  assert.match(
    videoSource,
    /overlay=\$\{overlayPosition\[position\] \?\? overlayPosition\["bottom-right"\]\}:eof_action=repeat:shortest=1/,
    "the looped logo input must stop at EOF and use the selected corner",
  );
  const overlayCalls = videoSource
    .split("\n")
    .filter((line) => line.includes("[wm_base][wm_logo]overlay=") && !line.trimStart().startsWith("//"));
  assert.equal(overlayCalls.length, 1);
  assert.doesNotMatch(overlayCalls[0]!, /shortest=0/);
});

test("compact logo watermark supports all four corners without a text footer", () => {
  for (const [name, source] of [
    ["image", imageSource],
    ["video", videoSource],
  ] as const) {
    for (const position of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      assert.ok(source.includes(`"${position}"`), `${name} watermark should support ${position}`);
    }
  }
  assert.match(imageSource, /const drawingParts = settings\.showText\s*\?/);
  assert.match(videoSource, /const panelParts = settings\.showText\s*\?/);
  assert.match(imageSource, /overlay=\$\{overlayPosition\[position\]/);
  assert.match(videoSource, /overlay=\$\{overlayPosition\[position\]/);
});

test("watermarked outputs stay visible and video processing is bounded for Liara", () => {
  assert.match(imageSource, /Math\.round\(90 \* size\)/, "image logo should remain visible in scaled property cards");
  assert.match(videoSource, /Math\.round\(90 \* settings\.size\)/, "video logo should remain visible in scaled previews");
  assert.match(videoSource, /scale='min\(1920,iw\)':'min\(1080,ih\)'/, "large phone videos should be downscaled before overlay");
  assert.match(videoSource, /"-preset",\s*"ultrafast"/, "video encoder should prioritize low request CPU time");
  assert.match(videoSource, /"-filter_threads",\s*"1"/, "video filter threads should be bounded");
  assert.match(videoSource, /output\.subarray\(4, 8\)\.toString\("latin1"\) !== "ftyp"/, "only a valid MP4 should be reported as watermarked");
});


test(
  "disk-backed watermarking creates valid image and video files without Buffer-returning APIs",
  { skip: CAN_RENDER ? false : "FFmpeg/logo/font are not provisioned in this environment" },
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), "hirmand-watermark-file-test-"));
    try {
      const jpegPath = join(workDir, "source.jpg");
      await execFileAsync(FFMPEG, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=0x101820:size=1200x900",
        "-frames:v", "1", "-q:v", "3", jpegPath,
      ]);
      const imageResult = await watermarkPropertyMediaFile({
        inputPath: jpegPath,
        contentType: "image/jpeg",
        pathname: "properties/uploads/large-photo.jpg",
        workDir,
        settings: SETTINGS,
      });
      assert.equal(imageResult.contentType, "image/webp");
      assert.match(imageResult.pathname, /-watermarked\.webp$/);
      const imageBytes = await readFile(imageResult.path);
      assert.equal(imageBytes.subarray(0, 4).toString("latin1"), "RIFF");
      assert.equal(imageBytes.subarray(8, 12).toString("latin1"), "WEBP");

      const videoPath = join(workDir, "source.mp4");
      await execFileAsync(FFMPEG, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=25",
        "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-an", videoPath,
      ]);
      const videoResult = await watermarkPropertyMediaFile({
        inputPath: videoPath,
        contentType: "video/mp4",
        pathname: "properties/uploads/large-clip.mp4",
        workDir,
        settings: SETTINGS,
      });
      assert.equal(videoResult.contentType, "video/mp4");
      assert.match(videoResult.pathname, /-watermarked\.mp4$/);
      const videoBytes = await readFile(videoResult.path);
      assert.equal(videoBytes.subarray(4, 8).toString("latin1"), "ftyp");
      assert.ok(videoBytes.length > 0);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
);

test(
  "a real JPEG is permanently watermarked into a valid WebP",
  { skip: CAN_RENDER ? false : "FFmpeg/logo/font are not provisioned in this environment" },
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), "hirmand-watermark-test-"));
    try {
      const jpegPath = join(workDir, "photo.jpg");
      // A 1200x900 solid JPEG, the same rough shape as an admin gallery upload.
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x101820:size=1200x900",
        "-frames:v",
        "1",
        "-q:v",
        "3",
        jpegPath,
      ]);
      const jpeg = await readFile(jpegPath);

      const result = await applyPropertyImageWatermarkServer({
        data: jpeg,
        contentType: "image/jpeg",
        pathname: "properties/uploads/photo_2026-10-19_12-57-34.jpg",
        settings: SETTINGS,
      });

      assert.equal(result.contentType, "image/webp");
      assert.match(result.pathname, /-watermarked\.webp$/);
      assert.ok(result.data.length > 0, "watermarked output must not be empty");
      assert.ok(
        result.data.subarray(0, 4).toString("latin1") === "RIFF" &&
          result.data.subarray(8, 12).toString("latin1") === "WEBP",
        "output must carry a real WebP container signature",
      );

      // Decode the produced bytes and prove the watermark text was really drawn:
      // a bare copy of the dark source has no bright pixels in the footer band.
      const webpPath = join(workDir, "watermarked.webp");
      await writeFile(webpPath, result.data);
      const grayPath = join(workDir, "out.gray");
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        webpPath,
        "-pix_fmt",
        "gray",
        "-f",
        "rawvideo",
        grayPath,
      ]);

      const gray = await readFile(grayPath);
      const width = 1200;
      const height = Math.round(gray.length / width);
      assert.equal(height, 900, "watermarking must preserve the aspect ratio and dimensions");

      let bright = 0;
      for (let y = Math.round(height * 0.84); y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (gray[y * width + x] > 150) bright += 1;
        }
      }
      assert.ok(
        bright > 150,
        `the footer watermark text must be visible (found ${bright} bright pixels)`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
);

test(
  "logo-only mode used by gallery uploads visibly changes the selected image corner",
  { skip: CAN_RENDER ? false : "FFmpeg/logo/font are not provisioned in this environment" },
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), "hirmand-logo-only-test-"));
    try {
      const jpegPath = join(workDir, "photo.jpg");
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x101820:size=1200x900",
        "-frames:v",
        "1",
        "-q:v",
        "3",
        jpegPath,
      ]);
      const result = await applyPropertyImageWatermarkServer({
        data: await readFile(jpegPath),
        contentType: "image/jpeg",
        pathname: "properties/uploads/gallery/photo.jpg",
        settings: {
          enabled: true,
          showLogo: true,
          showText: false,
          text: "املاک هیرمند",
          opacity: 0.76,
          size: 0.78,
          position: "bottom-right",
        },
      });

      assert.equal(result.contentType, "image/webp");
      assert.match(result.pathname, /-watermarked\.webp$/);
      const outputPath = join(workDir, "watermarked.webp");
      await writeFile(outputPath, result.data);
      const grayPath = join(workDir, "out.gray");
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        outputPath,
        "-pix_fmt",
        "gray",
        "-f",
        "rawvideo",
        grayPath,
      ]);
      const gray = await readFile(grayPath);
      const width = 1200;
      const height = Math.round(gray.length / width);
      assert.equal(height, 900, "the output dimensions must remain stable");

      // The source image is uniformly dark. A logo-only watermark must create
      // visible pixel variation in the selected lower-right corner even when
      // the text panel/footer is disabled by the live upload pipeline.
      let visiblePixels = 0;
      for (let y = height - 120; y < height - 4; y += 1) {
        for (let x = width - 160; x < width - 4; x += 1) {
          if (gray[y * width + x] > 55) visiblePixels += 1;
        }
      }
      assert.ok(
        visiblePixels > 40,
        `the corner logo must alter visible pixels in logo-only mode (found ${visiblePixels})`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
);

test(
  "a real video is watermarked and keeps its duration",
  { skip: CAN_RENDER ? false : "FFmpeg/logo/font are not provisioned in this environment" },
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), "hirmand-watermark-video-test-"));
    try {
      const inputPath = join(workDir, "input.mp4");
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=640x360:r=25",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
        inputPath,
      ]);
      const input = await readFile(inputPath);

      const result = await applyPropertyVideoWatermark({
        data: input,
        contentType: "video/mp4",
        pathname: "properties/uploads/clip.mp4",
        settings: SETTINGS,
      });

      assert.equal(result.contentType, "video/mp4");
      assert.match(result.pathname, /-watermarked\.mp4$/);
      assert.ok(result.data.length > 0);
      assert.equal(
        result.data.subarray(4, 8).toString("latin1"),
        "ftyp",
        "output must be a real MP4 container",
      );

      const outputPath = join(workDir, "out.mp4");
      await writeFile(outputPath, result.data);

      // Decode an actual output frame and prove the watermark changes visible
      // pixels against a uniformly blue source. A valid MP4 container/receipt
      // alone cannot prove that the brand was baked into the video frames.
      const framePath = join(workDir, "watermarked-frame.rgb");
      await execFileAsync(FFMPEG, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        outputPath,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        framePath,
      ]);
      const frame = await readFile(framePath);
      assert.equal(frame.length, 640 * 360 * 3, "decoded frame dimensions must remain 640x360");
      const backgroundOffset = (24 * 640 + 24) * 3;
      const background = [
        frame[backgroundOffset]!,
        frame[backgroundOffset + 1]!,
        frame[backgroundOffset + 2]!,
      ];
      let alteredPixels = 0;
      for (let y = 270; y < 356; y += 1) {
        for (let x = 320; x < 636; x += 1) {
          const offset = (y * 640 + x) * 3;
          const difference =
            Math.abs(frame[offset]! - background[0]!) +
            Math.abs(frame[offset + 1]! - background[1]!) +
            Math.abs(frame[offset + 2]! - background[2]!);
          if (difference > 55) alteredPixels += 1;
        }
      }
      assert.ok(
        alteredPixels > 500,
        `the decoded video must contain visible watermark pixels (found ${alteredPixels})`,
      );

      const probe = await execFileAsync(FFMPEG, ["-hide_banner", "-i", outputPath]).catch(
        (error: { stderr?: string }) => ({ stderr: error.stderr ?? "", stdout: "" }),
      );
      const detail = `${probe.stderr ?? ""}${probe.stdout ?? ""}`;
      const duration = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(detail);
      assert.ok(duration, "the watermarked video must be readable by FFmpeg");
      const seconds =
        Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
      assert.ok(
        Math.abs(seconds - 1) < 0.35,
        `watermarked video must keep the source duration (got ${seconds}s)`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
);
