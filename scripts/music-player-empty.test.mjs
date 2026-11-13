import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const responsiveCss = fs.readFileSync(new URL("mobile-responsive-hardening.css", root), "utf8");
const musicLayoutCss = fs.readFileSync(new URL("music-player-layout.css", root), "utf8");
const rootRoute = fs.readFileSync(new URL("routes/__root.tsx", root), "utf8");
const musicPlayer = fs.readFileSync(new URL("components/hirmand/music-player.tsx", root), "utf8");

test("empty music player is hidden by a stylesheet loaded after responsive overrides", () => {
  assert.match(rootRoute, /href:\s*responsiveHardeningCss\s*\}/);
  assert.match(rootRoute, /href:\s*musicPlayerLayoutCss\s*\}/);
  assert.match(responsiveCss, /\.music-player\.music-player-empty\s*\{[^}]*display:\s*none\s*!important;[^}]*pointer-events:\s*none\s*!important;/s);
  assert.equal([...responsiveCss.matchAll(/\.music-player(?:\.music-player-empty)?/g)].at(-1)?.[0], ".music-player.music-player-empty", "the empty-player override must be the final player selector");
});

test("desktop music player uses one compact fixed lower-left size", () => {
  assert.match(musicLayoutCss, /@media\s*\(min-width:\s*721px\)[\s\S]*?\.music-player\s*\{[^}]*left:\s*14px\s*!important;[^}]*bottom:\s*14px\s*!important;[^}]*width:\s*min\(450px,\s*calc\(100vw - 28px\)\)\s*!important;[^}]*max-width:\s*450px\s*!important;/);
  assert.match(musicLayoutCss, /@media\s*\(min-width:\s*721px\)\s*and\s*\(pointer:\s*fine\)[\s\S]*?\.music-player\s*\{[^}]*width:\s*min\(360px,\s*calc\(100vw - 28px\)\)\s*!important;[^}]*max-width:\s*360px\s*!important;[^}]*min-height:\s*46px\s*!important;/);
});

test("playlist is controlled by one icon-only button", () => {
  assert.equal([...musicPlayer.matchAll(/<ListMusic\b/g)].length, 1);
  assert.doesNotMatch(musicPlayer, /<span>فهرست پخش<\/span>/);
});

test("mobile music launcher is small and opens the full control sheet", () => {
  assert.match(musicLayoutCss, /\.music-player-launcher\s*\{[^}]*width:\s*48px\s*!important;[^}]*height:\s*48px\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open:not\(\.is-hidden\)\s*\{[^}]*display:\s*flex\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-progress-row\s*\{[^}]*order:\s*1\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-player-panel\s*\{[^}]*order:\s*2\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-playlist\s*\{[^}]*order:\s*3\s*!important;/s);
});

test("keyboard ArrowRight advances and ArrowLeft rewinds the current track", () => {
  const rightArrow = musicPlayer.match(/if \(event\.key === "ArrowRight"\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const leftArrow = musicPlayer.match(/if \(event\.key === "ArrowLeft"\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(rightArrow, /seek\(\(audioRef\.current\?\.currentTime \?\? 0\) \+ 5\)/);
  assert.match(leftArrow, /seek\(\(audioRef\.current\?\.currentTime \?\? 0\) - 5\)/);
});
