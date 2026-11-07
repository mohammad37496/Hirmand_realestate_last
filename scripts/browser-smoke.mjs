#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";
import { computeBrandWarnings } from "./brand-check.mjs";
import {
  authInvariantWarnings,
  buildAuthEnabled,
  compareAuthInvariant,
  probeDevAuthEnabled,
} from "./check-auth-invariant.mjs";
import {
  baselineComparison,
  bodyTextPrefix,
  derivedPaths,
  exitCodeFor,
  normalizeBodyText,
  normalizedBodyTextHash,
  parseSmokeArgs,
} from "./browser-smoke-verdict.mjs";

const args = parseSmokeArgs(process.argv.slice(2), process.env);
if (args.error) {
  console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
  process.exit(1);
}

const url = checkedUrl(args.url);
const outPng = checkedOutputPath(args.outPng, ["/workspace"]);
const derived = derivedPaths(outPng);
const mobilePng = checkedOutputPath(derived.mobilePng, ["/workspace"]);
const outJson = checkedOutputPath(derived.verdictJson, ["/workspace"], "verdict JSON");

const MAX_BASELINE_BYTES = 1024 * 1024;
const baselineRequested = Boolean(args.baseline);
let baselinePath = null;
let baselineResolveError = null;
if (baselineRequested) {
  try {
    baselinePath = checkedOutputPath(realpathSync(args.baseline), ["/workspace"], "baseline");
  } catch (err) {
    baselineResolveError = err?.code ?? "unresolvable path";
  }
  if (baselinePath === outJson) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            `--baseline ${args.baseline} is this run's own verdict output; ` +
            "pass a distinct output PNG (e.g. app-builder-built.png) so the baseline is not overwritten",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

const timeoutMs = Number(process.env.BROWSER_SMOKE_TIMEOUT_MS || 45000);

const screenshotFor = (name, fallback) =>
  name === "desktop-1280"
    ? outPng
    : name === "mobile-390"
      ? fallback
      : checkedOutputPath(
          outPng.replace(/\.png$/i, "-" + name + ".png"),
          ["/workspace"],
          name + " screenshot",
        );

const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 900, screenshot: screenshotFor("desktop-1920", mobilePng) },
  { name: "desktop-1280", width: 1280, height: 800, screenshot: outPng },
  { name: "tablet-1024", width: 1024, height: 820, screenshot: screenshotFor("tablet-1024", mobilePng) },
  { name: "mobile-430", width: 430, height: 900, screenshot: screenshotFor("mobile-430", mobilePng) },
  { name: "mobile-390", width: 390, height: 844, screenshot: mobilePng },
  { name: "mobile-375", width: 375, height: 812, screenshot: screenshotFor("mobile-375", mobilePng) },
];

mkdirSync(dirname(outPng), { recursive: true });

function compareAgainstBaseline(verdict) {
  if (!baselinePath) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${baselineResolveError ?? "unresolvable path"}`],
    };
  }
  try {
    if (statSync(baselinePath).size > MAX_BASELINE_BYTES) {
      return { divergesFromBaseline: true, reasons: ["baseline unreadable: too large"] };
    }
    return baselineComparison(verdict, readFileSync(baselinePath, "utf8"));
  } catch (err) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${err?.code ?? "read error"}`],
    };
  }
}

let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const viewports = {};
  for (const vp of VIEWPORTS) {
    const errors = { consoleErrors: [], pageErrors: [], httpErrors: [] };
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.pageErrors.push(String(err?.message || err)));
    // Chromium's generic "Failed to load resource: 404" console message omits
    // the requested URL. Capture same-origin failing responses so CI reports
    // the actual missing asset/API instead of only a browser exit code.
    const appOrigin = new URL(url).origin;
    page.on("response", (response) => {
      if (response.status() < 400) return;
      try {
        if (new URL(response.url()).origin === appOrigin) {
          errors.httpErrors.push(`http ${response.status()}: ${response.url()}`);
        }
      } catch {
        // Ignore non-URL response entries; the browser console still records them.
      }
    });
    // `domcontentloaded`, not `networkidle`: Vite keeps an HMR websocket open, so
    // networkidle never settles and would burn the whole timeout.
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = resp?.status() ?? 0;
    await page.waitForTimeout(1000);

    const title = await page.title();
    const hasCanvas = (await page.locator("canvas").count()) > 0;
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const horizontalOverflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });
    await page.screenshot({ path: vp.screenshot, fullPage: false });

    // Isolate the finance tools section for a focused visual regression check.
    const financeTools = page.locator(".tools-wrap").first();
    if (await financeTools.count()) {
      await financeTools.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(250);
      const financePath = vp.screenshot.replace(/\.png$/i, "-finance.png");
      await page.screenshot({ path: financePath, fullPage: false });
    }

    await page.close();

    viewports[vp.name] = {
      width: vp.width,
      height: vp.height,
      status,
      title,
      hasCanvas,
      bodyTextLen: normalizeBodyText(bodyText).length,
      bodyTextHash: normalizedBodyTextHash(bodyText),
      bodyTextPrefix: bodyTextPrefix(bodyText),
      horizontalOverflow,
      consoleErrors: errors.consoleErrors,
      pageErrors: errors.pageErrors,
      httpErrors: errors.httpErrors,
      screenshot: vp.screenshot,
    };
  }


  // Exercise the key public routes as part of the same Chromium session.
  // This catches client-side navigation regressions that a homepage-only smoke
  // test cannot see, especially the property-detail route reported by users.
  const routeChecks = [];
  const publicRoutes = [
    "/",
    "/properties",
    "/favorites",
    "/compare",
    "/tracking",
    "/consultants",
    "/budget-match",
    "/tools",
    "/tools/commission",
    "/tools/deposit",
    "/tools/loan",
    "/tools/rahn-rent",
  ].map((path) => new URL(path, url).toString());
  for (const routeUrl of publicRoutes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const routeErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") routeErrors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => routeErrors.push(`page: ${String(err?.message || err)}`));
    // A 404 shows up in the console as "Failed to load resource" with no URL, so
    // record the responses too — otherwise the report cannot say what broke.
    page.on("response", (response) => {
      if (response.status() < 400) return;
      routeErrors.push(`http ${response.status()}: ${response.url()}`);
    });
    let routeStatus = 0;
    let routeBodyTextLen = 0;
    let routeHorizontalOverflow = false;
    try {
      const response = await page.goto(routeUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      routeStatus = response?.status() ?? 0;
      await page.waitForTimeout(500);
      routeBodyTextLen = normalizeBodyText(await page.locator("body").innerText().catch(() => "")).length;
      routeHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    } finally {
      await page.close();
    }
    routeChecks.push({
      url: routeUrl,
      status: routeStatus,
      bodyTextLen: routeBodyTextLen,
      consoleErrors: routeErrors.filter((item) => item.startsWith("console:") || item.startsWith("http ")),
      pageErrors: routeErrors.filter((item) => item.startsWith("page:")),
      horizontalOverflow: routeHorizontalOverflow,
      ok:
        routeStatus >= 200 &&
        routeStatus < 400 &&
        routeBodyTextLen > 0 &&
        !routeHorizontalOverflow &&
        routeErrors.length === 0,
    });
  }

  const apiPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let musicApiCheck;
  try {
    const response = await apiPage.request.get(new URL("/api/music", url).toString(), { timeout: timeoutMs });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A non-JSON response should be reported through the structured smoke result below.
    }
    musicApiCheck = {
      status: response.status(),
      hasTracksArray: Array.isArray(payload?.tracks),
      ok: response.ok() && Array.isArray(payload?.tracks),
    };
  } catch (error) {
    musicApiCheck = { status: 0, hasTracksArray: false, ok: false, error: String(error?.message || error) };
  } finally {
    await apiPage.close();
  }

  // Auth is enabled on the deployed app. Probe the session endpoint explicitly
  // even when a preview build has auth disabled, so a missing production route
  // cannot hide behind an otherwise-green /favorites page smoke.
  const authApiPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let authRouteCheck;
  try {
    const response = await authApiPage.request.get(
      new URL("/api/auth/get-session", url).toString(),
      { timeout: timeoutMs },
    );
    let payload;
    let validJson = false;
    try {
      payload = await response.json();
      validJson = true;
    } catch {
      // A non-JSON response (notably the SPA HTML 404) is a failed auth route.
    }
    authRouteCheck = {
      status: response.status(),
      contentType: response.headers()["content-type"] ?? "",
      validJson,
      hasSessionShape: payload === null || Boolean(payload && typeof payload === "object"),
      ok: response.status() === 200 && validJson && (payload === null || Boolean(payload && typeof payload === "object")),
    };
  } catch (error) {
    authRouteCheck = { status: 0, contentType: "", validJson: false, hasSessionShape: false, ok: false, error: String(error?.message || error) };
  } finally {
    await authApiPage.close();
  }

  // When published listings exist, exercise a real card-to-detail navigation.
  // This is the regression test for the recurring "clicking a file does nothing" bug.
  const requirePropertySmoke = process.env.REQUIRE_PROPERTY_SMOKE === "1";
  const expectedPropertyId = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim() || "";
  const expectedPropertySlug = process.env.BROWSER_SMOKE_PROPERTY_SLUG?.trim() || "";
  const expectedPropertyTitle = process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() || "";
  const propertyNavigationCheck = {
    attempted: false,
    ok: true,
    href: null,
    hrefDecodedSlug: null,
    hrefMatchesExpectedSlug: true,
    status: null,
    bodyTextLen: 0,
    bodyContainsExpectedTitle: true,
    detailRendered: false,
    detailHeading: null,
    error: null,
    secondNavigationTested: false,
    secondNavigationOk: true,
    secondDetailHeading: null,
    secondGalleryCounter: null,
    galleryImagesLoaded: false,
    gallerySlideCount: 0,
    noWatermarkInNormalView: false,
    watermarkVisibleInLightbox: false,
    secondLightboxImageLoaded: false,
    watermarkAnchoredBottomRight: false,
    noWatermarkWhenDisabled: false,
    noWatermarkOnLightboxThumbnails: false,
  };
  const propertyPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const watermarkEnabledForSmoke = true;
  await propertyPage.route("**/api/public-watermark", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      enabled: watermarkEnabledForSmoke,
      showLogo: true,
      showText: true,
      text: "املاک هیرمند",
      opacity: 0.82,
      size: 1,
    }),
  }));
  /**
   * The file page is the only place `PropertyDetailView` mounts, and the
   * listing never renders that class — so this is what separates "the file
   * opened" from "the URL changed but the listing stayed". The old check only
   * looked at the URL plus body text, and the card carrying the property title
   * satisfies the title assertion on the listing, which is how a section-wide
   * routing dead end stayed green.
   */
  const readDetailState = async () => {
    await propertyPage
      .waitForSelector(".property-detail-page:not(.property-detail-skeleton)", { timeout: 10_000 })
      .catch(() => undefined);
    return propertyPage.evaluate(() => {
      const root = document.querySelector(".property-detail-page");
      return {
        rendered: Boolean(root) && !root.classList.contains("property-detail-skeleton"),
        heading: root?.querySelector("h1")?.textContent?.trim() ?? "",
      };
    });
  };
  const waitForHydratedPropertyLink = async (index = 0) => {
    await propertyPage.waitForFunction(
      (targetIndex) => {
        const link = document.querySelectorAll('[data-property-link="true"]')[targetIndex];
        if (!link) return false;
        const reactPropsKey = Object.keys(link).find((key) => key.startsWith("__reactProps$"));
        return Boolean(reactPropsKey && typeof link[reactPropsKey]?.onClick === "function");
      },
      index,
      { timeout: timeoutMs },
    );
  };
  try {
    const propertiesUrl = new URL("/properties", url).toString();
    await propertyPage.goto(propertiesUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const cards = propertyPage.locator('[data-property-link="true"]');
    if (await cards.count()) {
      // SSR cards can appear before React attaches TanStack Link's click
      // handler. Wait for the hydrated handler instead of racing a fixed delay.
      await waitForHydratedPropertyLink(0);
      const link = cards.first();
      const href = await link.getAttribute("href").catch(() => null);
      propertyNavigationCheck.href = href;

      if (href) {
        propertyNavigationCheck.attempted = true;
        const propertyId = await link.getAttribute("data-property-id").catch(() => null);
        const propertiesUrl = new URL("/properties", url);
        const canonicalUrl = new URL(href, propertiesUrl);
        const pathParts = canonicalUrl.pathname.split("/").filter(Boolean);
        const canonicalSlug = pathParts[pathParts.length - 1]
          ? decodeURIComponent(pathParts[pathParts.length - 1])
          : "";
        propertyNavigationCheck.hrefDecodedSlug = canonicalSlug;
        propertyNavigationCheck.hrefMatchesExpectedSlug =
          !expectedPropertySlug || canonicalSlug === expectedPropertySlug;

        await link.click();
        await propertyPage.waitForFunction(
          () => window.location.pathname.startsWith("/properties/") && window.location.pathname !== "/properties/",
          null,
          { timeout: timeoutMs },
        );
        propertyNavigationCheck.status = await propertyPage.evaluate(() => window.location.pathname);
        // The router can update the URL before the detail view replaces the
        // listing DOM. Wait for the real detail heading before sampling body
        // text, otherwise this check races the render it is meant to verify.
        const clickedDetail = await readDetailState();
        const textValue = await propertyPage.locator("body").innerText().catch(() => "");
        const normalizedText = normalizeBodyText(textValue);
        propertyNavigationCheck.bodyTextLen = normalizedText.length;
        propertyNavigationCheck.bodyContainsExpectedTitle =
          !expectedPropertyTitle || normalizedText.includes(normalizeBodyText(expectedPropertyTitle));
        propertyNavigationCheck.detailRendered = clickedDetail.rendered;
        propertyNavigationCheck.detailHeading = clickedDetail.heading || null;
        const initialGallery = await propertyPage.evaluate(() => ({
          thumbCount: document.querySelectorAll(".property-gallery-rail .property-gallery-thumb").length,
          counter: document.querySelector(".property-gallery-counter")?.textContent?.trim() ?? "",
        }));
        propertyNavigationCheck.ok =
          propertyNavigationCheck.status.startsWith("/properties/") &&
          propertyNavigationCheck.status !== "/properties/" &&
          propertyNavigationCheck.bodyTextLen > 80 &&
          propertyNavigationCheck.hrefMatchesExpectedSlug &&
          propertyNavigationCheck.bodyContainsExpectedTitle &&
          propertyNavigationCheck.detailRendered &&
          initialGallery.thumbCount > 0;
        if (!initialGallery.thumbCount && propertyNavigationCheck.ok === false) {
          propertyNavigationCheck.error = "property detail gallery rendered without thumbnails";
        }
        // Exercise the actual detail gallery and lightbox with two committed raster
        // photos. The public settings endpoint is controlled here so both enabled
        // and disabled states are deterministic and independent of production data.
        if (propertyNavigationCheck.ok) {
          try {
            await propertyPage.waitForFunction(() => {
              const image = document.querySelector(".property-gallery-main img");
              return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
            }, null, { timeout: timeoutMs });
            propertyNavigationCheck.galleryImagesLoaded = await propertyPage.evaluate(() => {
              const image = document.querySelector(".property-gallery-main img");
              return image instanceof HTMLImageElement && image.naturalWidth > 0 &&
                !/watermarked/i.test(image.currentSrc || image.src);
            });
            propertyNavigationCheck.gallerySlideCount =
              await propertyPage.locator(".property-gallery-rail .property-gallery-thumb").count();
            propertyNavigationCheck.noWatermarkInNormalView =
              (await propertyPage.locator(".property-media-watermark").count()) === 0;

            await propertyPage.waitForFunction(() => {
              const button = document.querySelector(".property-gallery-open");
              const reactPropsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
              return Boolean(reactPropsKey && typeof button[reactPropsKey]?.onClick === "function");
            }, null, { timeout: timeoutMs });
            await propertyPage.getByRole("button", { name: "باز کردن گالری تصاویر در اندازه بزرگ" }).click();
            await propertyPage.waitForSelector(".property-lightbox", { timeout: timeoutMs });
            await propertyPage.waitForSelector(".property-lightbox-media-wrap .property-media-watermark", { timeout: timeoutMs });
            propertyNavigationCheck.watermarkVisibleInLightbox =
              (await propertyPage.locator(".property-lightbox-media-wrap .property-media-watermark").count()) === 1;
            propertyNavigationCheck.noWatermarkOnLightboxThumbnails =
              (await propertyPage.locator(".property-lightbox-thumb .property-media-watermark").count()) === 0;
            await propertyPage.locator(".property-lightbox").getByRole("button", { name: "تصویر بعدی" }).click();
            await propertyPage.waitForFunction(() => {
              const image = document.querySelector(".property-lightbox-media-button img");
              return image instanceof HTMLImageElement &&
                image.complete && image.naturalWidth > 0 &&
                new URL(image.currentSrc || image.src).searchParams.get("qa-gallery") === "2";
            }, null, { timeout: timeoutMs });
            propertyNavigationCheck.secondLightboxImageLoaded = true;
            propertyNavigationCheck.watermarkAnchoredBottomRight = await propertyPage.evaluate(() => {
              const watermark = document.querySelector(".property-lightbox-media-wrap .property-media-watermark");
              const wrap = document.querySelector(".property-lightbox-media-wrap");
              if (!watermark || !wrap) return false;
              const mark = watermark.getBoundingClientRect();
              const frame = wrap.getBoundingClientRect();
              const rightGap = frame.right - mark.right;
              const bottomGap = frame.bottom - mark.bottom;
              return rightGap >= -1 && rightGap < 40 && bottomGap >= -1 && bottomGap < 40;
            });
            await propertyPage.getByRole("button", { name: "بستن نمایش تصاویر" }).click();
            await propertyPage.waitForSelector(".property-lightbox", { state: "detached", timeout: timeoutMs });

            // Verify the disabled setting in a fresh page instead of reloading
            // the page that just mounted/unmounted the portal. This keeps the
            // second state independent of stale router/portal hydration state.
            const disabledWatermarkPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
            try {
              await disabledWatermarkPage.route("**/api/public-watermark", (route) => route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                  enabled: false,
                  showLogo: true,
                  showText: true,
                  text: "املاک هیرمند",
                  opacity: 0.82,
                  size: 1,
                }),
              }));
              await disabledWatermarkPage.goto(new URL(propertyNavigationCheck.status, url).toString(), {
                waitUntil: "domcontentloaded",
                timeout: timeoutMs,
              });
              await disabledWatermarkPage.waitForSelector(".property-detail-page:not(.property-detail-skeleton)", {
                timeout: timeoutMs,
              });
              await disabledWatermarkPage.waitForFunction(() => {
                const button = document.querySelector(".property-gallery-open");
                const reactPropsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
                return Boolean(reactPropsKey && typeof button[reactPropsKey]?.onClick === "function");
              }, null, { timeout: timeoutMs });
              const disabledSettingsResponse = disabledWatermarkPage.waitForResponse((response) => {
                try {
                  return new URL(response.url()).pathname === "/api/public-watermark";
                } catch {
                  return false;
                }
              }, { timeout: timeoutMs });
              await disabledWatermarkPage.getByRole("button", { name: "باز کردن گالری تصاویر در اندازه بزرگ" }).click();
              await disabledWatermarkPage.waitForSelector(".property-lightbox", { timeout: timeoutMs });
              await disabledSettingsResponse;
              await disabledWatermarkPage.waitForFunction(() =>
                document.querySelectorAll(".property-lightbox-media-wrap .property-media-watermark").length === 0,
              null, { timeout: timeoutMs });
              propertyNavigationCheck.noWatermarkWhenDisabled = true;
              await disabledWatermarkPage.getByRole("button", { name: "بستن نمایش تصاویر" }).click();
              await disabledWatermarkPage.waitForSelector(".property-lightbox", { state: "detached", timeout: timeoutMs });
            } finally {
              await disabledWatermarkPage.close();
            }
          } catch (error) {
            propertyNavigationCheck.error = "gallery/lightbox watermark check failed: " + String(error?.message || error);
          }
          const galleryWatermarkContractPassed =
            propertyNavigationCheck.galleryImagesLoaded &&
            propertyNavigationCheck.gallerySlideCount >= 2 &&
            propertyNavigationCheck.noWatermarkInNormalView &&
            propertyNavigationCheck.watermarkVisibleInLightbox &&
            propertyNavigationCheck.secondLightboxImageLoaded &&
            propertyNavigationCheck.watermarkAnchoredBottomRight &&
            propertyNavigationCheck.noWatermarkOnLightboxThumbnails &&
            propertyNavigationCheck.noWatermarkWhenDisabled;
          if (!galleryWatermarkContractPassed) {
            propertyNavigationCheck.ok = false;
            propertyNavigationCheck.error ??= "gallery/lightbox watermark contract did not pass";
          }
        }
        if (!propertyNavigationCheck.ok && !propertyNavigationCheck.detailRendered) {
          propertyNavigationCheck.error = `detail view never mounted for ${propertyNavigationCheck.status}`;
        }

        if (propertyNavigationCheck.ok && (await cards.count()) > 1) {
          propertyNavigationCheck.secondNavigationTested = true;
          await propertyPage.goto(propertiesUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
          await waitForHydratedPropertyLink(1);
          const secondCard = cards.nth(1);
          const secondHref = await secondCard.getAttribute("href").catch(() => null);
          await secondCard.click();
          await propertyPage.waitForFunction(
            () => window.location.pathname.startsWith("/properties/") && window.location.pathname !== "/properties/",
            null,
            { timeout: timeoutMs },
          );
          const secondState = await readDetailState();
          const secondCounter = await propertyPage.evaluate(() =>
            document.querySelector(".property-gallery-counter")?.textContent?.trim() ?? "",
          );
          propertyNavigationCheck.secondDetailHeading = secondState.heading || null;
          propertyNavigationCheck.secondGalleryCounter = secondCounter || null;
          propertyNavigationCheck.secondNavigationOk =
            Boolean(secondHref) &&
            secondState.rendered &&
            Boolean(secondState.heading) &&
            (!secondCounter || secondCounter.includes("تصویر ۱ از"));
          if (!propertyNavigationCheck.secondNavigationOk) {
            propertyNavigationCheck.ok = false;
            propertyNavigationCheck.error =
              "second property navigation or gallery state check failed";
          }
        }

        if (propertyNavigationCheck.ok) {
          await propertyPage.reload({ waitUntil: "domcontentloaded" });
          const refreshPath = await propertyPage.evaluate(() => window.location.pathname);
          const refreshBody = normalizeBodyText(
            await propertyPage.locator("body").innerText().catch(() => ""),
          );
          const refreshDetail = await readDetailState();
          propertyNavigationCheck.detailRendered = refreshDetail.rendered;
          propertyNavigationCheck.detailHeading = refreshDetail.heading || null;
          propertyNavigationCheck.ok =
            refreshPath === propertyNavigationCheck.status &&
            refreshBody.length > 80 &&
            refreshDetail.rendered &&
            (!expectedPropertyTitle ||
              refreshBody.includes(normalizeBodyText(expectedPropertyTitle)));
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = refreshDetail.rendered
              ? `detail URL changed after a direct refresh: ${refreshPath}`
              : `detail view never mounted after a direct refresh of ${refreshPath}`;
          }
        }

        if (propertyNavigationCheck.ok && propertyId) {
          await propertyPage.goto(
            new URL("/file/" + encodeURIComponent(propertyId), url).toString(),
            { waitUntil: "domcontentloaded", timeout: timeoutMs },
          );
          await propertyPage.waitForTimeout(300);
          const legacyPath = await propertyPage.evaluate(() => window.location.pathname);
          const legacyDetail = await readDetailState();
          propertyNavigationCheck.ok =
            legacyPath.startsWith("/properties/") &&
            legacyPath !== "/properties/" &&
            legacyDetail.rendered;
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = legacyDetail.rendered
              ? `/file/:id did not land on a file page: ${legacyPath}`
              : `/file/:id landed on ${legacyPath} without the detail view`;
          }
        }

        if (propertyNavigationCheck.ok && propertyId) {
          await propertyPage.goto(
            new URL(
              "/v/" + encodeURIComponent(canonicalSlug) + "/" + encodeURIComponent(propertyId),
              url,
            ).toString(),
            { waitUntil: "domcontentloaded", timeout: timeoutMs },
          );
          await propertyPage.waitForTimeout(300);
          const legacyVPath = await propertyPage.evaluate(() => window.location.pathname);
          const legacyVDetail = await readDetailState();
          propertyNavigationCheck.ok =
            legacyVPath.startsWith("/properties/") &&
            legacyVPath !== "/properties/" &&
            legacyVDetail.rendered;
          if (!propertyNavigationCheck.ok) {
            propertyNavigationCheck.error = legacyVDetail.rendered
              ? `/v/:slug/:id did not land on a file page: ${legacyVPath}`
              : `/v/:slug/:id landed on ${legacyVPath} without the detail view`;
          }
        }

        if (propertyNavigationCheck.ok && expectedPropertyId && propertyId !== expectedPropertyId) {
          propertyNavigationCheck.ok = false;
          propertyNavigationCheck.error = `unexpected property id ${propertyId}; expected ${expectedPropertyId}`;
        }
      }
    } else if (requirePropertySmoke) {
      propertyNavigationCheck.ok = false;
      propertyNavigationCheck.error = "no published property card available in required smoke environment";
    }
  } catch (error) {
    propertyNavigationCheck.error = String(error?.message || error);
    propertyNavigationCheck.ok = false;
  } finally {
    await propertyPage.close();
  }

  const routeFailures = routeChecks.filter((item) => !item.ok);
  if (routeFailures.length) {
    viewports["desktop-1280"].pageErrors.push(
      ...routeFailures.map((item) => `route smoke failed: ${item.url} [${item.status}]`),
    );
  }
  if (!musicApiCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(`music API smoke failed: [${musicApiCheck.status}]`);
  }
  if (!authRouteCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(`auth API smoke failed: [${authRouteCheck.status}]`);
  }
  if (!propertyNavigationCheck.ok) {
    viewports["desktop-1280"].pageErrors.push(
      propertyNavigationCheck.attempted
        ? `property detail navigation smoke failed: ${propertyNavigationCheck.status || propertyNavigationCheck.error || "unknown"}` +
          (propertyNavigationCheck.error ? ` (${propertyNavigationCheck.error})` : "")
        : `property detail navigation smoke skipped: ${propertyNavigationCheck.error || "no published property card is available in this environment"}`,
    );
  }

  const brandWarnings = computeBrandWarnings({
    hasCanvas: viewports["desktop-1280"].hasCanvas,
    workspaceRoot: process.env.GITHUB_WORKSPACE ?? process.cwd(),
  });
  // Only a dev server answers /__app-env, so smoking the built output reads as
  // indeterminate — report a divergence, never the absence of an observation.
  const authWarnings = authInvariantWarnings(
    compareAuthInvariant({
      devAuthEnabled: await probeDevAuthEnabled(url),
      buildAuthEnabled: buildAuthEnabled(),
    }),
  );
  const verdict = { url, viewports, routeChecks, propertyNavigationCheck, musicApiCheck, authRouteCheck, brandWarnings, authWarnings, verdictFile: outJson };
  if (baselineRequested) {
    const { divergesFromBaseline, reasons } = compareAgainstBaseline(verdict);
    verdict.divergesFromBaseline = divergesFromBaseline;
    verdict.baselineReasons = reasons;
  }

  writeFileSync(outJson, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  for (const w of [...brandWarnings, ...authWarnings]) console.error(w);
  // Set the code rather than aborting the process so the `finally` browser
  // teardown always runs (agents typically smoke twice per turn; leaking
  // Chromium accumulates across retries).
  process.exitCode = exitCodeFor(viewports);
} catch (err) {
  const failure = { ok: false, url, error: String(err?.message || err) };
  try {
    writeFileSync(outJson, JSON.stringify(failure, null, 2));
  } catch (writeErr) {
    failure.verdictWriteError = String(writeErr?.message || writeErr);
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
