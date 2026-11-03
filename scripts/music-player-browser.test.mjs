#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:8081";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/music", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: [
          {
            id: "fallback-race-track",
            title: "آهنگ آزمایشی",
            artist: "هیرمند",
            src: "/music/bad.mp3",
            stream: "/music/good-stream.mp3",
          },
        ],
      }),
    }),
  );
  await page.addInitScript(() => {
    const mediaState = new WeakMap();
    const sourceState = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return sourceState.get(this) || "";
      },
      set(value) {
        sourceState.set(this, new URL(String(value), window.location.href).toString());
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
      configurable: true,
      get() {
        return sourceState.get(this) || "";
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() {
        return mediaState.get(this)?.paused ?? true;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return 180;
      },
    });
    HTMLMediaElement.prototype.load = function load() {
      const requestedSource = this.src;
      if (requestedSource.includes("/music/bad.mp3")) return;
      setTimeout(() => {
        if (this.src !== requestedSource) return;
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("canplay"));
      }, 0);
    };
    HTMLMediaElement.prototype.play = function play() {
      window.__musicPlayAttempts ??= [];
      window.__musicPlayAttempts.push(this.src);
      if (this.src.includes("/music/bad.mp3")) {
        // Both browser signals for the same failed URL happen in one turn.
        this.dispatchEvent(new Event("error"));
        return Promise.reject(new Error("simulated media source failure"));
      }
      mediaState.set(this, { paused: false });
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      mediaState.set(this, { paused: true });
      this.dispatchEvent(new Event("pause"));
    };
  });

  await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".music-player:not(.music-player-empty)", { timeout: 30_000 });
  await page.locator(".music-play").click();
  await page.waitForFunction(
    () => window.__musicPlayAttempts?.length >= 2 && document.querySelector(".music-play")?.getAttribute("aria-label") === "توقف",
    null,
    { timeout: 10_000 },
  );

  const fallbackResult = await page.locator("audio").evaluate((audio) => ({
    source: audio.src,
    attempts: window.__musicPlayAttempts,
  }));
  assert.ok(
    fallbackResult.source.endsWith("/music/good-stream.mp3"),
    `the valid stream fallback must not be skipped: ${JSON.stringify(fallbackResult)}`,
  );
  assert.ok(
    fallbackResult.attempts.some((source) => source.endsWith("/music/good-stream.mp3")),
    `the valid stream must be the source that starts playback: ${JSON.stringify(fallbackResult)}`,
  );

  // A source can fail after play() already resolved. Playback intent must
  // survive that success so the next candidate is still attempted.
  await page.locator("audio").dispatchEvent("error");
  await page.waitForFunction(
    () => document.querySelector("audio")?.src.endsWith("/api/music/file/fallback-race-track"),
    null,
    { timeout: 10_000 },
  );
  const midPlaybackFallback = await page.locator("audio").evaluate((audio) => ({
    source: audio.src,
    attempts: window.__musicPlayAttempts,
  }));
  assert.ok(
    midPlaybackFallback.attempts.some((source) => source.endsWith("/api/music/file/fallback-race-track")),
    `a later source failure must continue through the fallback list: ${JSON.stringify(midPlaybackFallback)}`,
  );
  assert.deepEqual(pageErrors, [], `the player should not cause uncaught browser errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({
    ok: true,
    checks: [
      "media error and play rejection advance fallback only once",
      "playback intent survives successful play so later source failures still fall back",
    ],
    fallbackResult,
    midPlaybackFallback,
  }, null, 2));
} finally {
  await browser.close();
}
