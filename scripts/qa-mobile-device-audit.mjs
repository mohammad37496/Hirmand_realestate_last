import { chromium } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPORT_ROOT = join(process.cwd(), 'screenshots', 'mobile-device-audit');
const DEV_ORIGIN = process.env.VITE_DEV_ORIGIN ?? 'http://127.0.0.1:8080';

const DEVICES = [
  { name: 'Galaxy J7 Pro', width: 360, height: 640, dpr: 3, ua: 'Mozilla/5.0 (Linux; Android 8.1.0; SM-J701F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
];

await mkdir(REPORT_ROOT, { recursive: true });
await mkdir(join(REPORT_ROOT, 'shots'), { recursive: true });

const tmp = await mkdtemp(join(tmpdir(), 'mobile-audit-'));
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (Linux; Android 8.1.0; SM-J701F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const page = await context.newPage();
const consoleMessages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleMessages.push(msg.text());
});
page.on('pageerror', (err) => consoleMessages.push(`pageerror: ${err.message}`));

try {
  await page.goto(DEV_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  const meta = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bodyOverflowX: document.body.scrollWidth > window.innerWidth,
      cardCount: document.querySelectorAll('.pcard, .property-card, .pf-card').length,
      firstCardW: (() => {
        const c = document.querySelector('.pcard, .property-card, .pf-card');
        return c ? Math.round(c.getBoundingClientRect().width) : null;
      })(),
      actionButtonsBelowFold: (() => {
        const btn = document.querySelector('.pcard-actions .property-action, .property-actions .property-action');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.bottom <= window.innerHeight && r.top >= 0 };
      })(),
      headerSticky: !!document.querySelector('.site-nav[style*="position"]'),
      hasHorizontalScroll: window.scrollX !== 0 || document.body.scrollWidth > window.innerWidth + 2,
    };
  });

  console.log(JSON.stringify({ device: 'Galaxy J7 Pro', page: 'Home', meta, errors: consoleMessages.slice(-3) }));

  const shotPath = join(REPORT_ROOT, 'shots', `galaxy-j7-pro-home.png`);
  await page.screenshot({ path: shotPath, fullPage: true, type: 'png' });
} catch (err) {
  console.log('ko', String(err?.message ?? err));
}

await browser.close();
console.log(`REPORT_DIR=${REPORT_ROOT}`);
