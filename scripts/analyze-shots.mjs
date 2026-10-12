// Use Playwright's bundled chromium to decode PNGs via canvas in the browser.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const files = process.argv.slice(2);
for (const f of files) {
  const b64 = readFileSync(`screenshots/${f}`).toString("base64");
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const W = 98, H = 212;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let whiteish = 0, darkish = 0, bottomNonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > 235) whiteish++;
      if (lum < 40) darkish++;
    }
    for (let y = H - 12; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 60 && lum < 220) bottomNonBg++;
      }
    }
    return {
      w: img.width, h: img.height,
      whiteish: Math.round((100 * whiteish) / (W * H)),
      dark: Math.round((100 * darkish) / (W * H)),
      bottom: Math.round((100 * bottomNonBg) / (12 * W)),
    };
  }, b64);
  console.log(`${f}: ${stats.w}x${stats.h} white=${stats.whiteish}% dark=${stats.dark}% bottomActivity=${stats.bottom}%`);
}
await browser.close();
