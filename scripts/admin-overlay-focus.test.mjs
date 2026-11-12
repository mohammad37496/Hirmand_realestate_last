import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const utils = fs.readFileSync(new URL("../src/components/hirmand/admin-ui-utils.tsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
const palette = fs.readFileSync(new URL("../src/components/hirmand/admin-command-palette.tsx", import.meta.url), "utf8");
const adminUi = fs.readFileSync(new URL("../src/components/hirmand/admin-ui.tsx", import.meta.url), "utf8");
const mobileManagement = fs.readFileSync(new URL("../src/components/hirmand/admin-mobile-management.tsx", import.meta.url), "utf8");
const propertyPreview = fs.readFileSync(new URL("../src/components/hirmand/admin-property-preview.tsx", import.meta.url), "utf8");
const browserAudit = fs.readFileSync(new URL("./admin-visual-audit.mjs", import.meta.url), "utf8");
const confirmBrowserTest = fs.readFileSync(new URL("./admin-confirm-dialog-focus-browser.test.mjs", import.meta.url), "utf8");
const confirmFixture = fs.readFileSync(new URL("./admin-confirm-dialog-focus-fixture.tsx", import.meta.url), "utf8");
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
  assert.match(utils, /activeElementRef\.current\?\.focus\?\.\(\)/);
  assert.match(utils, /focusTarget\?\.focus\?\.\(\)/);
});

test("mobile admin drawer focuses its close button and contains focus within its dialog", () => {
  assert.match(admin, /const drawerRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(admin, /const drawerCloseRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(admin, /initialFocusRef: drawerCloseRef,[\s\S]*?containerRef: drawerRef/);
  assert.match(admin, /className="admin-drawer"\s+ref=\{drawerRef\}/);
  assert.match(admin, /className="admin-icon-btn"\s+ref=\{drawerCloseRef\}/);
  assert.doesNotMatch(admin, /initialFocusRef: drawerTriggerRef/);
});

test("confirmation dialogs use the shared focus trap and scroll lock", () => {
  assert.match(utils, /const dialogRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(utils, /const openerRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(utils, /if \(!dialogRef\.current\)\s*\{[\s\S]*?openerRef\.current = document\.activeElement instanceof HTMLElement \? document\.activeElement : null/);
  assert.match(utils, /restoreFocusRef\?: React\.RefObject<HTMLElement \| null>/);
  assert.match(utils, /restoreFocusRef: openerRef,[\s\S]*?containerRef: dialogRef/);
  assert.match(utils, /<AdminConfirmDialog request=\{request\} onSettle=\{settle\} dialogRef=\{dialogRef\} \/>/);
  assert.match(adminUi, /dialogRef:\s*React\.RefObject<HTMLDivElement \| null>/);
  assert.match(adminUi, /ref=\{dialogRef\}/);
  assert.doesNotMatch(adminUi, /document\.addEventListener\("keydown", onKeyDown\)/);
});

test("confirmation dialog browser regression covers cancel, confirm and Escape opener restoration", () => {
  assert.equal(packageJson.scripts["test:admin-confirm-dialog-focus-browser"], "node scripts/admin-confirm-dialog-focus-browser.test.mjs");
  assert.match(confirmBrowserTest, /for \(const flow of \["cancel", "confirm", "escape"\]\)/);
  assert.match(confirmBrowserTest, /\$\{flow\} close should restore focus to the exact opener/);
  assert.match(confirmBrowserTest, /initially focus the confirm action/);
  assert.match(confirmFixture, /useConfirmDialog\(\)/);
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

test("mobile enrollment wizard contains focus, closes with Escape and restores its trigger", () => {
  assert.match(mobileManagement, /useOverlayDismiss\(\{ open, onClose, initialFocusRef: closeRef, containerRef: dialogRef \}\)/);
  assert.match(mobileManagement, /ref=\{dialogRef\} className="admin-mobile-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-title" tabIndex=\{-1\}/);
  assert.match(mobileManagement, /ref=\{closeRef\} type="button" className="admin-mobile-close"/);
  assert.match(mobileManagement, /const closeEnrollment = useCallback\(\(\) => setEnrollmentOpen\(false\), \[\]\)/);
});

test("mobile revoke confirmation is named, traps focus and starts on the safe cancel action", () => {
  assert.match(mobileManagement, /useOverlayDismiss\(\{ open: true, onClose, initialFocusRef: cancelRef, containerRef: dialogRef \}\)/);
  assert.match(mobileManagement, /role="dialog" aria-modal="true" aria-labelledby="mobile-device-revoke-title" aria-describedby="mobile-device-revoke-description"/);
  assert.match(mobileManagement, /<h2 id="mobile-device-revoke-title">لغو دسترسی دستگاه؟<\/h2>/);
  assert.match(mobileManagement, /<button ref=\{cancelRef\} type="button" className="admin-mobile-secondary-action" onClick=\{onClose\}>انصراف/);
  assert.match(mobileManagement, /const closeConfirm = useCallback\(\(\) => setConfirmDevice\(null\), \[\]\)/);
});

test("admin property preview has a labelled dialog and shared keyboard dismissal", () => {
  assert.match(propertyPreview, /useOverlayDismiss\(\{open,onClose:closePreview,initialFocusRef:closeRef,containerRef:dialogRef\}\)/);
  assert.match(propertyPreview, /<div className="admin-preview-backdrop" role="presentation"/);
  assert.match(propertyPreview, /<section ref=\{dialogRef\} className="admin-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-preview-title" tabIndex=\{-1\}>/);
  assert.match(propertyPreview, /<h2 id="admin-preview-title">/);
  assert.match(propertyPreview, /<button ref=\{closeRef\} type="button" className="admin-preview-close"/);
});

test("overlay focus regression test is part of the normal npm test suite", () => {
  assert.match(packageJson.scripts.test, /npm run test:site-regressions/);
  assert.match(packageJson.scripts["test:site-regressions"], /scripts\/admin-overlay-focus\.test\.mjs/);
  assert.equal(packageJson.scripts["test:admin-overlay-focus"], "node --test scripts/admin-overlay-focus.test.mjs");
});

test("admin browser audit exercises Tab and Shift+Tab wrapping in the drawer and command palette", () => {
  assert.match(browserAudit, /async function auditCommandPalette\(/);
  assert.match(browserAudit, /command palette did not focus its search input when opened/);
  assert.match(browserAudit, /Shift\+Tab from the command palette input did not wrap/);
  assert.match(browserAudit, /Tab from the last command palette control did not wrap/);
  assert.match(browserAudit, /closing the command palette did not restore focus to its trigger/);
  assert.match(browserAudit, /Shift\+Tab from the first drawer control did not wrap to the last control/);
  assert.match(browserAudit, /Tab from the last drawer control did not wrap to the first control/);
  assert.match(browserAudit, /for \(const issue of entry\.issues\.focus \?\? \[\]\)/);
});
