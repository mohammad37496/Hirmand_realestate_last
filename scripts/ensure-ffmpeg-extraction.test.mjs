import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractPinnedFfmpegArchive } from "./ensure-ffmpeg.mjs";

const XZ_TAR_FIXTURE = "/Td6WFoAAATm1rRGAgAhARYAAAB0L+Wj4Cf/AH5dADkb7OgvJU6bwFk/ZbHHFHJrWkKsgdYz+qwaXwuxtkGJMMUJH8Ha53tWtNHt6+lrjqro7aOC15FYqvtaPiRh6SuspUNSazAgGQvxuatBXZyBr7MakeMTV/vMIypB3bk0iXBoPpes5VuxADShTHlexbQNCb01BFkQGCbJo5egAAAAAFl764Wd33nxAAGaAYBQAADDUC3DscRn+wIAAAAABFla";
const FIXTURE_CONTENT = "fixture ffmpeg executable bytes";

function readTarEntry(tarBuffer, expectedName) {
  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const dataStart = offset + 512;
    if (name === expectedName) return tarBuffer.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`tar fixture did not contain ${expectedName}`);
}

test("FFmpeg extraction uses the bundled streaming XZ decoder when system tar lacks XZ support", async () => {
  const root = mkdtempSync(join(tmpdir(), "hirmand-ffmpeg-xz-fallback-"));
  const archivePath = join(root, "fixture.tar.xz");
  const extractDir = join(root, "extract");
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(archivePath, Buffer.from(XZ_TAR_FIXTURE, "base64"));

  try {
    let tarCalled = false;
    const runCommand = (command, args) => {
      if (args[0] === "-xJf") throw new Error("system tar has no XZ support");
      assert.equal(command, "tar");
      assert.equal(args[0], "-xf");
      assert.ok(args.includes("--strip-components=2"));
      assert.ok(args.includes("*/bin/ffmpeg"));
      const plainTar = readFileSync(args[1]);
      writeFileSync(join(extractDir, "ffmpeg"), readTarEntry(plainTar, "root/bin/ffmpeg"));
      tarCalled = true;
    };

    await extractPinnedFfmpegArchive(archivePath, extractDir, { runCommand });
    assert.equal(tarCalled, true);
    assert.equal(readFileSync(join(extractDir, "ffmpeg"), "utf8"), FIXTURE_CONTENT);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("FFmpeg fallback tar stream extracts correctly with real tar/xz tools when available", async (t) => {
  try {
    execFileSync("tar", ["--version"], { stdio: "ignore" });
    execFileSync("xz", ["--version"], { stdio: "ignore" });
  } catch {
    t.skip("tar/xz utilities are unavailable in this local environment; CI Linux exercises the fallback.");
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "hirmand-ffmpeg-xz-test-"));
  const sourceDir = join(root, "source");
  const inputDir = join(sourceDir, "root", "bin");
  const extractDir = join(root, "extract");
  const plainTarPath = join(root, "fixture.tar");
  const archivePath = join(root, "fixture.tar.xz");
  const binaryContents = FIXTURE_CONTENT;
  mkdirSync(inputDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(join(inputDir, "ffmpeg"), binaryContents);

  try {
    execFileSync("tar", ["-cf", plainTarPath, "-C", sourceDir, "root/bin/ffmpeg"]);
    const compressed = execFileSync("xz", ["-c", plainTarPath], { maxBuffer: 2 * 1024 * 1024 });
    writeFileSync(archivePath, compressed);

    const runCommand = (command, args, options) => {
      if (args[0] === "-xJf") {
        const error = new Error("system tar has no XZ support");
        error.stderr = Buffer.from("xz: Cannot exec: No such file or directory");
        throw error;
      }
      return execFileSync(command, args, options);
    };

    await extractPinnedFfmpegArchive(archivePath, extractDir, { runCommand });

    assert.equal(readFileSync(join(extractDir, "ffmpeg"), "utf8"), binaryContents);
    assert.equal(readFileSync(archivePath).length, compressed.length, "the pinned archive remains intact for verification/cleanup");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
