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

  // A one-track playlist must stop at the end unless repeat is enabled.
  await page.locator(".music-play").click();
  await page.waitForFunction(
    () => document.querySelector(".music-play")?.getAttribute("aria-label") === "توقف",
    null,
    { timeout: 5_000 },
  );
  const attemptsBeforeSingleTrackEnd = await page.evaluate(() => window.__musicPlayAttempts.length);
  await page.locator("audio").evaluate((audio) => {
    audio.pause();
    audio.dispatchEvent(new Event("ended"));
  });
  await page.waitForFunction(
    () => document.querySelector(".music-play")?.getAttribute("aria-label") === "پخش",
    null,
    { timeout: 5_000 },
  );
  await page.waitForTimeout(50);
  const singleTrackEndResult = await page.locator("audio").evaluate((audio) => ({
    paused: audio.paused,
    attempts: window.__musicPlayAttempts.length,
    playLabel: document.querySelector(".music-play")?.getAttribute("aria-label"),
  }));
  assert.equal(singleTrackEndResult.paused, true);
  assert.equal(singleTrackEndResult.attempts, attemptsBeforeSingleTrackEnd);
  assert.equal(singleTrackEndResult.playLabel, "پخش");

  await page.locator(".music-cover").click();
  await page.locator('button[title="تکرار"]').click();
  await page.locator(".music-play").click();
  await page.waitForFunction(
    () => document.querySelector(".music-play")?.getAttribute("aria-label") === "توقف",
    null,
    { timeout: 5_000 },
  );
  const attemptsBeforeRepeat = await page.evaluate(() => window.__musicPlayAttempts.length);
  await page.locator("audio").dispatchEvent("ended");
  await page.waitForFunction(
    (previousAttempts) => window.__musicPlayAttempts.length === previousAttempts + 1,
    attemptsBeforeRepeat,
    { timeout: 5_000 },
  );
  const repeatResult = await page.locator("audio").evaluate((audio) => ({
    paused: audio.paused,
    attempts: window.__musicPlayAttempts.length,
    playLabel: document.querySelector(".music-play")?.getAttribute("aria-label"),
    repeatEnabled: document.querySelector('button[title="تکرار"]')?.getAttribute("aria-pressed"),
  }));
  assert.equal(repeatResult.paused, false);
  assert.equal(repeatResult.attempts, attemptsBeforeRepeat + 1);
  assert.equal(repeatResult.playLabel, "توقف");
  assert.equal(repeatResult.repeatEnabled, "true");
  await page.locator(".music-play").click();

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

  const responsiveViewports = [
    { width: 320, height: 640, touch: true },
    { width: 390, height: 844, touch: true },
    { width: 568, height: 320, touch: true },
    { width: 640, height: 360, touch: true },
    { width: 768, height: 900, touch: true },
    { width: 1024, height: 768, touch: true },
    { width: 1280, height: 400, touch: false },
    { width: 1280, height: 800, touch: false },
    { width: 1920, height: 1080, touch: false },
  ];
  const responsiveResults = [];
  for (const viewport of responsiveViewports) {
    const responsivePage = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.width <= 720,
      hasTouch: viewport.touch,
    });
    const responsivePageErrors = [];
    responsivePage.on("pageerror", (error) => responsivePageErrors.push(error.message));
    await responsivePage.route("**/api/music", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tracks: Array.from({ length: 18 }, (_, index) => ({
            id: `responsive-track-${index}`,
            title: `آهنگ آزمایشی ${index + 1}`,
            artist: "هیرمند",
            src: `/music/responsive-${index}.mp3`,
          })),
        }),
      }),
    );
    await responsivePage.addInitScript(() => {
      const mediaState = new WeakMap();
      const sourceState = new WeakMap();
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        get() { return sourceState.get(this) || ""; },
        set(value) { sourceState.set(this, new URL(String(value), location.href).toString()); },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get() { return mediaState.get(this)?.paused ?? true; },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "duration", {
        configurable: true,
        get() { return 180; },
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
    await responsivePage.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await responsivePage.waitForSelector(".music-player:not(.music-player-empty)", { timeout: 30_000 });
    await responsivePage.locator(".music-cover").evaluate((button) => button.click());
    await responsivePage.locator('.music-compact-actions button[aria-label="فهرست موسیقی"]').evaluate((button) => button.click());
    const layout = await responsivePage.evaluate(() => {
      const player = document.querySelector(".music-player");
      const playlist = document.querySelector(".music-playlist");
      const playlistList = document.querySelector(".music-playlist-list");
      const progress = document.querySelector(".music-progress");
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          bottom: Math.round(bounds.bottom),
        };
      };
      const visibleButtons = [...player.querySelectorAll("button")].filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        player: rect(player),
        playlist: rect(playlist),
        playlistList: rect(playlistList),
        playlistPosition: getComputedStyle(playlist).position,
        playerOverflowY: getComputedStyle(player).overflowY,
        playerScrollHeight: player.scrollHeight,
        playerClientHeight: player.clientHeight,
        playlistListOverflowY: getComputedStyle(playlistList).overflowY,
        progress: rect(progress),
        buttons: visibleButtons.map((button) => ({
          label: button.getAttribute("aria-label") || button.textContent.trim(),
          ...rect(button),
        })),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(layout.player.y >= 0, `music dock must stay below the viewport top: ${JSON.stringify(layout)}`);
    assert.ok(layout.player.bottom <= viewport.height, `music dock must stay inside the viewport: ${JSON.stringify(layout)}`);
    const scrollableDock = viewport.touch || viewport.height <= 420;
    assert.equal(layout.playlistPosition, scrollableDock ? "static" : "absolute",
      `playlist positioning must match the available screen: ${JSON.stringify(layout)}`);
    if (scrollableDock) {
      assert.ok(["auto", "scroll"].includes(layout.playerOverflowY));
      assert.ok(layout.playerScrollHeight >= layout.playerClientHeight);
    } else {
      assert.ok(layout.playlist.y >= 0 && layout.playlist.bottom <= viewport.height,
        `desktop playlist popover must stay visible: ${JSON.stringify(layout)}`);
    }
    const minimumTarget = viewport.touch ? 44 : 36;
    const minimumSeek = scrollableDock ? 44 : 18;
    assert.ok(layout.progress.height >= minimumSeek, `seek control hit area is too small: ${JSON.stringify(layout)}`);
    for (const button of layout.buttons) {
      assert.ok(button.width >= minimumTarget && button.height >= minimumTarget,
        `player target is too small: ${JSON.stringify(button)} in ${JSON.stringify(viewport)}`);
    }
    assert.equal(layout.horizontalOverflow, false, `music player must not create horizontal page overflow: ${JSON.stringify(layout)}`);
    if (scrollableDock) {
      await responsivePage.locator(".music-player").evaluate((player) => { player.scrollTop = player.scrollHeight; });
    } else {
      await responsivePage.locator(".music-playlist-list").evaluate((list) => { list.scrollTop = list.scrollHeight; });
    }
    const lastTrack = await responsivePage.locator(".music-track").last().evaluate((track, useDock) => {
      const bounds = track.getBoundingClientRect();
      const playerBounds = track.closest(".music-player").getBoundingClientRect();
      const scrollBounds = track.closest(useDock ? ".music-player" : ".music-playlist-list").getBoundingClientRect();
      return {
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        playerTop: Math.round(playerBounds.top),
        playerBottom: Math.round(playerBounds.bottom),
        scrollTop: Math.round(scrollBounds.top),
        scrollBottom: Math.round(scrollBounds.bottom),
      };
    }, scrollableDock);
    assert.ok(lastTrack.top >= lastTrack.scrollTop && lastTrack.bottom <= lastTrack.scrollBottom,
      `the last playlist item must remain reachable by scrolling its container: ${JSON.stringify({ viewport, lastTrack, layout })}`);
    assert.deepEqual(responsivePageErrors, [], `responsive player should not cause browser errors: ${responsivePageErrors.join(" | ")}`);
    responsiveResults.push({ viewport, player: layout.player, minButton: Math.min(...layout.buttons.map((button) => Math.min(button.width, button.height))), progressHeight: layout.progress.height });
    await responsivePage.close();
  }

  // Resizing an already-open touch player must switch between the bounded
  // landscape scroll dock and the wider tablet playlist popover cleanly.
  const resizePage = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  await resizePage.route("**/api/music", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: Array.from({ length: 18 }, (_, index) => ({
          id: `resize-track-${index}`,
          title: `آهنگ تغییر اندازه ${index + 1}`,
          src: `/music/resize-${index}.mp3`,
        })),
      }),
    }),
  );
  await resizePage.addInitScript(() => {
    const mediaState = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() { return mediaState.get(this)?.paused ?? true; },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() { return 180; },
    });
    HTMLMediaElement.prototype.load = function load() {
      setTimeout(() => this.dispatchEvent(new Event("canplay")), 0);
    };
    HTMLMediaElement.prototype.play = function play() {
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
  await resizePage.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await resizePage.waitForSelector(".music-player:not(.music-player-empty)", { timeout: 30_000 });
  await resizePage.locator(".music-cover").click();
  await resizePage.locator('.music-compact-actions button[aria-label="فهرست موسیقی"]').click();
  await resizePage.locator(".music-track").last().click();
  await resizePage.waitForFunction(() => document.querySelector(".music-meta strong")?.textContent === "آهنگ تغییر اندازه 18");
  await resizePage.locator('.music-transport button[aria-label="آهنگ بعدی"]').click();
  await resizePage.waitForFunction(() => document.querySelector(".music-meta strong")?.textContent === "آهنگ تغییر اندازه 1");
  await resizePage.locator('.music-transport button[aria-label="آهنگ قبلی"]').click();
  await resizePage.waitForFunction(() => document.querySelector(".music-meta strong")?.textContent === "آهنگ تغییر اندازه 18");
  await resizePage.locator('.music-compact-actions button[aria-label="فهرست موسیقی"]').click();
  await resizePage.setViewportSize({ width: 568, height: 320 });
  const landscapeResize = await resizePage.evaluate(() => {
    const player = document.querySelector(".music-player");
    const playlist = document.querySelector(".music-playlist");
    const bounds = player.getBoundingClientRect();
    return {
      playerTop: Math.round(bounds.top),
      playerBottom: Math.round(bounds.bottom),
      playerScrollHeight: player.scrollHeight,
      playerClientHeight: player.clientHeight,
      playlistPosition: getComputedStyle(playlist).position,
      overflowY: getComputedStyle(player).overflowY,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(landscapeResize.playerTop >= 0 && landscapeResize.playerBottom <= 320,
    `resized landscape dock must remain visible: ${JSON.stringify(landscapeResize)}`);
  assert.equal(landscapeResize.playlistPosition, "static");
  assert.ok(["auto", "scroll"].includes(landscapeResize.overflowY));
  assert.equal(landscapeResize.horizontalOverflow, false);

  await resizePage.setViewportSize({ width: 1024, height: 768 });
  const tabletResize = await resizePage.evaluate(() => {
    const player = document.querySelector(".music-player");
    const playlist = document.querySelector(".music-playlist");
    const playerBounds = player.getBoundingClientRect();
    const playlistBounds = playlist.getBoundingClientRect();
    return {
      playerTop: Math.round(playerBounds.top),
      playerBottom: Math.round(playerBounds.bottom),
      playlistTop: Math.round(playlistBounds.top),
      playlistBottom: Math.round(playlistBounds.bottom),
      playlistPosition: getComputedStyle(playlist).position,
      overflowY: getComputedStyle(player).overflowY,
      playerScrollHeight: player.scrollHeight,
      playerClientHeight: player.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(tabletResize.playerTop >= 0 && tabletResize.playerBottom <= 768,
    `resized tablet dock must remain visible: ${JSON.stringify(tabletResize)}`);
  assert.equal(tabletResize.playlistPosition, "static");
  assert.ok(["auto", "scroll"].includes(tabletResize.overflowY));
  assert.ok(tabletResize.playerScrollHeight > tabletResize.playerClientHeight,
    `resized touch tablet playlist must remain in its scrollable dock: ${JSON.stringify(tabletResize)}`);
  await resizePage.locator(".music-player").evaluate((player) => { player.scrollTop = player.scrollHeight; });
  const resizedTabletLastTrack = await resizePage.locator(".music-track").last().evaluate((track) => {
    const bounds = track.getBoundingClientRect();
    const playerBounds = track.closest(".music-player").getBoundingClientRect();
    return {
      top: Math.round(bounds.top),
      bottom: Math.round(bounds.bottom),
      playerTop: Math.round(playerBounds.top),
      playerBottom: Math.round(playerBounds.bottom),
    };
  });
  assert.ok(resizedTabletLastTrack.top >= resizedTabletLastTrack.playerTop &&
    resizedTabletLastTrack.bottom <= resizedTabletLastTrack.playerBottom,
  `resized touch tablet last playlist item must remain reachable: ${JSON.stringify({ tabletResize, resizedTabletLastTrack })}`);
  assert.equal(tabletResize.horizontalOverflow, false);
  await resizePage.close();

  assert.deepEqual(pageErrors, [], `the player should not cause uncaught browser errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({
    ok: true,
    checks: [
      "media error and play rejection advance fallback only once",
      "playback intent survives successful play so later source failures still fall back",
      "manual pause prevents later media errors from restarting playback",
      "a one-track playlist stops at the end when repeat is disabled",
      "a one-track playlist restarts when repeat is enabled",
      "a late play() resolution from a previous track cannot restart a paused track",
      "playlist selection and next/previous controls update the active track",
      "touch and desktop targets, seek controls, and playlist scrolling fit nine phone, landscape, tablet, and desktop viewports",
      "resizing an open touch player between landscape and tablet keeps its dock and playlist visible",
    ],
    fallbackResult,
    midPlaybackFallback,
    pausedErrorResult,
    singleTrackEndResult,
    repeatResult,
    stalePlayResult,
    responsiveResults,
    landscapeResize,
    tabletResize,
    resizedTabletLastTrack,
  }, null, 2));
} finally {
  await browser.close();
}
