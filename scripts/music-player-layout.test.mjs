import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const player = fs.readFileSync(new URL("../src/components/hirmand/site-music-player.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/music-player.css", import.meta.url), "utf8");
const root = fs.readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

test("the music player is mounted once in the shared root for every route", () => {
  assert.equal((root.match(/<SiteMusicPlayer\s*\/>/g) ?? []).length, 1);
  assert.match(root, /import \{ SiteMusicPlayer \} from "@\/components\/hirmand\/site-music-player"/);
  assert.doesNotMatch(player, /useLocation|startsWith\("\/admin"\)/,
    "route changes and the admin path must not create a separate player or hide the shared dock");
});

test("the shared player stays viewport-fixed and uses the reference mobile placement", () => {
  assert.match(css, /html body \.music-player-float:not\(\.music-player-float-empty\)\s*\{[^}]*position:\s*fixed\s*!important;[^}]*bottom:\s*20px\s*!important;[^}]*left:\s*20px\s*!important;/s);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?html body \.music-player-float:not\(\.music-player-float-empty\)\s*\{[^}]*right:\s*auto\s*!important;[^}]*bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom\)\)\s*!important;[^}]*left:\s*10px\s*!important;[^}]*width:\s*calc\(100vw - 20px\)\s*!important;[^}]*height:\s*132px\s*!important;/s);
  assert.match(css, /html body:has\(\.pf-page, \.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\)\s*\{[^}]*position:\s*fixed\s*!important;/s,
    "legacy listing-specific mobile rules must not turn the dock into a scrolling element");
  assert.match(css, /html body \.music-player-float\.is-collapsed\s*\{[^}]*right:\s*auto\s*!important;[^}]*left:\s*10px\s*!important;/s,
    "the minimized dock must keep the same viewport edge across route wrappers");
});

test("the player exposes working collapse and restore controls without unmounting audio", () => {
  assert.match(player, /className="music-player-restore"[\s\S]*?onClick=\{\(\) => setCollapsed\(false\)\}[\s\S]*?aria-label="باز کردن پلیر موسیقی"/s);
  assert.match(player, /className="music-player-utility music-player-hide" onClick=\{\(\) => \{ setExpanded\(false\); setCollapsed\(true\); \}\} aria-label="جمع کردن پلیر"/);
  assert.match(player, /<audio[\s\S]*?ref=\{audioRef\}[\s\S]*?\/>[\s\S]*?className="music-player-restore"/,
    "audio must stay mounted when the visible dock is collapsed");
  assert.match(css, /html body \.music-player-float\.is-collapsed > :not\(audio\):not\(\.music-player-restore\)\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /html body \.music-player-float\.is-collapsed \.music-player-restore\s*\{\s*display:\s*flex\s*!important;/);
});

test("the reference player controls and progress bar remain in the shared component", () => {
  for (const label of ["موسیقی هیرمند", "نمایش فهرست موسیقی", "آهنگ قبلی", "آهنگ بعدی", "موقعیت آهنگ"]) {
    assert.ok(player.includes(label), `missing expected player control: ${label}`);
  }
  assert.match(player, /fetch\("\/api\/music"/);
  assert.match(player, /onLoadedMetadata=/);
  assert.match(player, /onTimeUpdate=/);
  assert.match(player, /onEnded=\{handleTrackEnded\}/);
  assert.match(player, /onError=/);
});
