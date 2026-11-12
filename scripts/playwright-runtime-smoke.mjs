import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.setContent(
    "<!doctype html><title>Playwright runtime ready</title>",
  );
  const title = await page.title();
  if (title !== "Playwright runtime ready") {
    throw new Error(`Unexpected Chromium smoke title: ${title}`);
  }
} finally {
  await browser.close();
}
