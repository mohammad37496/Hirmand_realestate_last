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

  // Explicit pause clears playback intent; a later media error must not
  // unexpectedly start another source in the background.
  await page.locator(".music-play").click();
  await page.waitForFunction(
    () => document.querySelector(".music-play")?.getAttribute("aria-label") === "پخش",
    null,
    { timeout: 5_000 },
  );
  const attemptsBeforePausedError = await page.evaluate(() => window.__musicPlayAttempts.length);
  await page.locator("audio").dispatchEvent("error");
  await page.waitForTimeout(50);
  const pausedErrorResult = await page.locator("audio").evaluate((audio) => ({
    source: audio.src,
    attempts: window.__musicPlayAttempts,
    playLabel: document.querySelector(".music-play")?.getAttribute("aria-label"),
  }));
  assert.equal(pausedErrorResult.attempts.length, attemptsBeforePausedError);
  assert.equal(pausedErrorResult.playLabel, "پخش");

  // A play() promise from an old track must not update the controls after the
  // visitor has switched tracks and paused the new one.
  const racePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const racePageErrors = [];
  racePage.on("pageerror", (error) => racePageErrors.push(error.message));
  await racePage.route("**/api/music", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: [
          { id: "pending-track-a", title: "Track A", src: "/music/track-a.mp3" },
          { id: "pending-track-b", title: "Track B", src: "/music/track-b.mp3" },
        ],
      }),
    }),
  );
  await racePage.addInitScript(() => {
    const mediaState = new WeakMap();
    const sourceState = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return sourceState.get(this) || ""; },
      set(value) { sourceState.set(this, new URL(String(value), location.href).toString()); },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
      configurable: true,
      get() { return sourceState.get(this) || ""; },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() { return mediaState.get(this)?.paused ?? true; },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() { return 120; },
    });
    HTMLMediaElement.prototype.load = function load() {
      const source = this.src;
      setTimeout(() => {
        if (this.src !== source) return;
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("canplay"));
      }, 0);
    };
    HTMLMediaElement.prototype.play = function play() {
      if (this.src.endsWith("/music/track-a.mp3")) {
        mediaState.set(this, { paused: false });
        this.dispatchEvent(new Event("play"));
        return new Promise((resolve) => { window.__resolveTrackA = resolve; });
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
  await racePage.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await racePage.waitForSelector(".music-player:not(.music-player-empty)", { timeout: 30_000 });
  await racePage.locator(".music-play").click();
  await racePage.waitForFunction(() => typeof window.__resolveTrackA === "function");
  await racePage.locator('.music-transport button[aria-label="آهنگ بعدی"]').click();
  await racePage.waitForFunction(
    () => document.querySelector(".music-meta strong")?.textContent === "Track B" &&
      document.querySelector(".music-play")?.getAttribute("aria-label") === "توقف",
  );
  await racePage.locator(".music-play").click();
  await racePage.waitForFunction(
    () => document.querySelector(".music-play")?.getAttribute("aria-label") === "پخش",
  );
  await racePage.evaluate(() => window.__resolveTrackA());
  await racePage.waitForTimeout(50);
  const stalePlayResult = await racePage.locator("audio").evaluate((audio) => ({
    paused: audio.paused,
    source: audio.src,
    title: document.querySelector(".music-meta strong")?.textContent,
    playLabel: document.querySelector(".music-play")?.getAttribute("aria-label"),
  }));
  assert.equal(stalePlayResult.paused, true);
  assert.ok(stalePlayResult.source.endsWith("/music/track-b.mp3"));
  assert.equal(stalePlayResult.title, "Track B");
  assert.equal(stalePlayResult.playLabel, "پخش");
  assert.deepEqual(racePageErrors, [], `the async playback race should not cause browser errors: ${racePageErrors.join(" | ")}`);
  await racePage.close();
  assert.deepEqual(pageErrors, [], `the player should not cause uncaught browser errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({
    ok: true,
    checks: [
      "media error and play rejection advance fallback only once",
      "playback intent survives successful play so later source failures still fall back",
      "manual pause prevents later media errors from restarting playback",
      "a late play() resolution from a previous track cannot restart a paused track",
    ],
    fallbackResult,
    midPlaybackFallback,
    pausedErrorResult,
    stalePlayResult,
  }, null, 2));
} finally {
  await browser.close();
}
