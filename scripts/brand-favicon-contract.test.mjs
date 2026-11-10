import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderWebManifest } from "./grok-pwa-shared.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const pngSize = (path) => {
  const bytes = readFileSync(join(root, path));
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", `${path} must be a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

test("document head advertises the official Hirmand PNG favicon", () => {
  const rootRoute = read("src/routes/__root.tsx");
  assert.match(rootRoute, /rel: "icon", type: "image\/png", sizes: "96x96", href: "\/favicon-96\.png"/);
  assert.match(rootRoute, /rel: "apple-touch-icon", href: "\/pwa\/icon-180\.png"/);
});

test("web app manifest icons are valid square PNGs", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.deepEqual(manifest.icons.slice(0, 3).map(({ src, sizes, purpose }) => ({ src, sizes, purpose })), [
    { src: "/pwa/icon-192.png", sizes: "192x192", purpose: "any" },
    { src: "/pwa/icon-512.png", sizes: "512x512", purpose: "any" },
    { src: "/pwa/icon-maskable.png", sizes: "512x512", purpose: "maskable" },
  ]);
  assert.equal(manifest.icons.some((icon) => icon.purpose === "monochrome"), false);
  assert.deepEqual(pngSize("public/favicon-96.png"), [96, 96]);
  assert.deepEqual(pngSize("public/pwa/icon-180.png"), [180, 180]);
  assert.deepEqual(pngSize("public/pwa/icon-192.png"), [192, 192]);
  assert.deepEqual(pngSize("public/pwa/icon-512.png"), [512, 512]);
  assert.deepEqual(pngSize("public/pwa/icon-maskable.png"), [512, 512]);
});

test("platform-generated manifest and service worker cache the branded icons", () => {
  const generatedManifest = JSON.parse(renderWebManifest("hirmandrealestate.ir", {
    site: { title: "گروه مشاورین املاک هیرمند", short_name: "هیرمند" },
  }));
  assert.ok(generatedManifest.icons.some((icon) => icon.src === "/pwa/icon-maskable.png" && icon.purpose === "maskable"));
  assert.equal(generatedManifest.icons.some((icon) => icon.purpose === "monochrome"), false);
  const serviceWorker = read("public/sw.js");
  assert.match(serviceWorker, /hirmand-shell-v8/);
  assert.match(serviceWorker, /"\/favicon-96\.png"/);
  assert.match(serviceWorker, /"\/pwa\/icon-maskable\.png"/);
});
