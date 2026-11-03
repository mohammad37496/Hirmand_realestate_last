import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const responsiveCss = fs.readFileSync(new URL("mobile-responsive-hardening.css", root), "utf8");
const rootRoute = fs.readFileSync(new URL("routes/__root.tsx", root), "utf8");

test("empty music player is hidden by a stylesheet loaded after responsive overrides", () => {
  assert.match(rootRoute, /href:\s*responsiveHardeningCss\s*\}/);
  assert.match(responsiveCss, /\.music-player\.music-player-empty\s*\{[^}]*display:\s*none\s*!important;[^}]*pointer-events:\s*none\s*!important;/s);
  assert.equal([...responsiveCss.matchAll(/\.music-player(?:\.music-player-empty)?/g)].at(-1)?.[0], ".music-player.music-player-empty", "the empty-player override must be the final player selector");
});
