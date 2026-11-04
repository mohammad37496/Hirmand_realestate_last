import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const responsiveCss = fs.readFileSync(new URL("mobile-responsive-hardening.css", root), "utf8");
const musicLayoutCss = fs.readFileSync(new URL("music-player-layout.css", root), "utf8");
const rootRoute = fs.readFileSync(new URL("routes/__root.tsx", root), "utf8");

test("empty music player is hidden by a stylesheet loaded after responsive overrides", () => {
  assert.match(rootRoute, /href:\s*responsiveHardeningCss\s*\}/);
  assert.match(rootRoute, /href:\s*musicPlayerLayoutCss\s*\}/);
  assert.match(responsiveCss, /\.music-player\.music-player-empty\s*\{[^}]*display:\s*none\s*!important;[^}]*pointer-events:\s*none\s*!important;/s);
  assert.equal([...responsiveCss.matchAll(/\.music-player(?:\.music-player-empty)?/g)].at(-1)?.[0], ".music-player.music-player-empty", "the empty-player override must be the final player selector");
});

test("desktop music player uses one compact fixed lower-left size", () => {
  assert.match(musicLayoutCss, /@media\s*\(min-width:\s*721px\)[\s\S]*?\.music-player\s*\{[^}]*left:\s*14px\s*!important;[^}]*bottom:\s*14px\s*!important;[^}]*width:\s*min\(320px,\s*calc\(100vw - 28px\)\)\s*!important;[^}]*max-width:\s*320px\s*!important;/);
  assert.match(musicLayoutCss, /@media\s*\(min-width:\s*721px\)\s*and\s*\(pointer:\s*fine\)[\s\S]*?\.music-player\s*\{[^}]*width:\s*min\(320px,\s*calc\(100vw - 28px\)\)\s*!important;[^}]*max-width:\s*320px\s*!important;[^}]*min-height:\s*48px\s*!important;/);
});

test("mobile music launcher is small and opens the full control sheet", () => {
  assert.match(musicLayoutCss, /\.music-player-launcher\s*\{[^}]*width:\s*48px\s*!important;[^}]*height:\s*48px\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open:not\(\.is-hidden\)\s*\{[^}]*display:\s*flex\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-progress-row\s*\{[^}]*order:\s*1\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-player-panel\s*\{[^}]*order:\s*2\s*!important;/s);
  assert.match(musicLayoutCss, /\.music-player\.is-mobile-open \.music-playlist\s*\{[^}]*order:\s*3\s*!important;/s);
});
