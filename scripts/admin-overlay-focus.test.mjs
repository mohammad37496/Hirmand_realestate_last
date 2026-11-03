import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const utils = fs.readFileSync(new URL("../src/components/hirmand/admin-ui-utils.tsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
const palette = fs.readFileSync(new URL("../src/components/hirmand/admin-command-palette.tsx", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("shared overlay hook traps forward and reverse Tab at modal boundaries", () => {
  assert.match(utils, /containerRef\?: React\.RefObject<HTMLElement \| null>/);
  assert.match(utils, /container\.querySelectorAll<HTMLElement>\(/);
  assert.match(utils, /event\.shiftKey && \(active === first \|\| active === container \|\| !container\.contains\(active\)\)/);
  assert.match(utils, /!event\.shiftKey && \(active === last \|\| !container\.contains\(active\)\)/);
  assert.match(utils, /event\.preventDefault\(\);\s*last\.focus\(\)/);
  assert.match(utils, /event\.preventDefault\(\);\s*first\.focus\(\)/);
  assert.match(utils, /if \(!focusable\.length\)[\s\S]*?container\.focus\(\)/);
});

test("shared overlay hook retains Escape dismissal, scroll lock and opener restoration", () => {
  assert.match(utils, /document\.addEventListener\("keydown", onKeyDown\)/);
  assert.match(utils, /event\.key === "Escape"[\s\S]*?onClose\(\)/);
  assert.match(utils, /body\.style\.overflow = "hidden"/);
  assert.match(utils, /body\.style\.overflow = previousOverflow/);
  assert.match(utils, /restoreFocusRef\.current\?\.focus\?\.\(\)/);
});

test("mobile admin drawer focuses its close button and contains focus within its dialog", () => {
  assert.match(admin, /const drawerRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(admin, /const drawerCloseRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(admin, /initialFocusRef: drawerCloseRef,[\s\S]*?containerRef: drawerRef/);
  assert.match(admin, /className="admin-drawer"\s+ref=\{drawerRef\}/);
  assert.match(admin, /className="admin-icon-btn"\s+ref=\{drawerCloseRef\}/);
  assert.doesNotMatch(admin, /initialFocusRef: drawerTriggerRef/);
});

test("command palette uses shared modal focus handling and restores the invoking element", () => {
  assert.match(palette, /useOverlayDismiss\(\{ open, onClose: closePalette, initialFocusRef: inputRef, containerRef: dialogRef \}\)/);
  assert.match(palette, /const openerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(palette, /<button ref=\{openerRef\} type="button"/);
  assert.match(palette, /<div ref=\{dialogRef\} role="dialog" aria-modal="true"/);
  assert.match(palette, /<input ref=\{inputRef\}/);
  assert.doesNotMatch(palette, /setTimeout\(\(\) => document\.getElementById/);
  assert.doesNotMatch(palette, /event\.key === "Escape"/);
});

test("overlay focus regression test is part of the normal npm test suite", () => {
  assert.match(packageJson.scripts.test, /scripts\/admin-overlay-focus\.test\.mjs/);
  assert.equal(packageJson.scripts["test:admin-overlay-focus"], "node --test scripts/admin-overlay-focus.test.mjs");
});
