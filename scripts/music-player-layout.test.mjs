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

test("the shared player stays viewport-fixed and uses a compact mobile launcher", () => {
  assert.match(css, /html body \.music-player-float:not\(\.music-player-float-empty\)\s*\{[^}]*position:\s*fixed\s*!important;[^}]*bottom:\s*20px\s*!important;[^}]*left:\s*20px\s*!important;/s);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?html body \.music-player-float:not\(\.music-player-float-empty\),[\s\S]*?width:\s*48px\s*!important;[^}]*height:\s*48px\s*!important;/s);
  assert.match(css, /html body \.music-player-float\.is-expanded:not\(\.music-player-float-empty\)\s*\{[^}]*width:\s*min\(350px, calc\(100vw - 24px\)\)\s*!important;[^}]*max-height:\s*min\(74vh, 620px\)\s*!important;/s,
    "opening the launcher should reveal a bounded dropdown panel rather than a full-width dock");
  assert.match(css, /html body \.music-player-float:not\(\.is-expanded\) \.music-player-full-content\s*\{\s*display:\s*none\s*!important;/,
    "mobile must render as an icon before React applies its post-hydration state");
  assert.match(css, /html body \.music-player-float:not\(\.is-expanded\) \.music-player-restore\s*\{\s*display:\s*flex\s*!important;/,
    "the launcher remains visible without depending on a useEffect state update");
  assert.match(css, /html body:has\(\.pf-page, \.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\):not\(\.is-expanded\)[\s\S]*?width:\s*48px\s*!important;[\s\S]*?height:\s*48px\s*!important;/,
    "legacy property-list CSS must not expand the mobile launcher back to full width");
  assert.match(css, /html body:has\(\.pf-page, \.property-showcase\) \.music-player-float:not\(\.music-player-float-empty\)\.is-expanded[\s\S]*?width:\s*min\(350px, calc\(100vw - 24px\)\)\s*!important;/,
    "legacy property-list CSS must not expand the open panel beyond the viewport");
  assert.match(css, /html body \.music-player-float\.is-collapsed\s*\{[^}]*right:\s*auto\s*!important;[^}]*left:\s*10px\s*!important;/s,
    "the minimized dock must keep the same viewport edge across route wrappers");
});

test("the player exposes working collapse and restore controls without unmounting audio", () => {
  assert.match(player, /className="music-player-restore"[\s\S]*?onClick=\{\(\) => \{ setCollapsed\(false\); if \(window\.matchMedia\("\(max-width: 720px\)"\)\.matches\) setExpanded\(true\); \}\}[\s\S]*?aria-label="باز کردن پلیر موسیقی"/s);
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
  assert.match(player, /aria-label="توقف آهنگ"/);
  assert.match(player, /aria-label="کم و زیاد کردن صدا"/);
  assert.match(player, /aria-label="پخش تصادفی"/);
  assert.match(player, /انتخاب موسیقی/);
  assert.match(player, /aria-label="بستن پنل موسیقی"/,
    "the loading/error state must also be closable on mobile");
});
