import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { MusicPlayer } from "@/components/hirmand/music-player";
import { SITE } from "@/lib/site";
import { trackPublic404 } from "@/lib/seo-redirects";
import appCss from "../styles.css?url";
import propertiesProCss from "../properties-pro.css?url";
import themeProCss from "../theme-pro.css?url";
import themeProPagesCss from "../theme-pro-pages.css?url";
import mobileCss from "../mobile.css?url";
import refinementsCss from "../refinements.css?url";
import uiClarityCss from "../ui-clarity.css?url";
import propertyDetailProCss from "../property-detail-pro.css?url";
import mobileDeviceFixesCss from "../mobile-device-fixes.css?url";
import themeHarmonyCss from "../theme-harmony.css?url";
import propertyCardCss from "../property-card.css?url";
import homePropertyLayoutCss from "../home-property-layout.css?url";
import propertyDetailRedesignCss from "../property-detail-redesign.css?url";
import budgetMatcherRedesignCss from "../budget-matcher-redesign.css?url";
import propertyDetailLightThemeCss from "../property-detail-light-theme.css?url";
import adminMobileClarityCss from "../admin-mobile-clarity.css?url";
import adminMatchingCss from "../admin-matching.css?url";
import adminOpsCss from "../admin-ops.css?url";
import smartToolsCss from "../smart-tools.css?url";
import desktopNavReadabilityCss from "../desktop-nav-readability.css?url";
import headerRedesignCss from "../header-redesign.css?url";
import propertyDetailFlowCss from "../property-detail-flow.css?url";
import propertyToolCenterCss from "../property-tool-center.css?url";
import propertyDetailPolishCss from "../property-detail-polish.css?url";
import homepagePolishCss from "../components/hirmand/homepage-polish.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: SITE.title },
      { name: "description", content: SITE.description },
      { name: "theme-color", content: "#0b1a2b" },
      { name: "color-scheme", content: "light" },
      { name: "author", content: SITE.nameFa },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { name: "format-detection", content: "telephone=yes" },
      { name: "application-name", content: SITE.shortName },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: SITE.shortName },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/pwa/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: propertiesProCss },
      { rel: "stylesheet", href: themeProCss },
      { rel: "stylesheet", href: themeProPagesCss },
      { rel: "stylesheet", href: mobileCss },
      { rel: "stylesheet", href: refinementsCss },
      { rel: "stylesheet", href: uiClarityCss },
      { rel: "stylesheet", href: propertyDetailProCss },
      { rel: "stylesheet", href: mobileDeviceFixesCss },
      { rel: "stylesheet", href: themeHarmonyCss },
      { rel: "stylesheet", href: propertyCardCss },
      { rel: "stylesheet", href: homePropertyLayoutCss },
      { rel: "stylesheet", href: propertyDetailRedesignCss },
      { rel: "stylesheet", href: budgetMatcherRedesignCss },
      { rel: "stylesheet", href: propertyDetailLightThemeCss },
      { rel: "stylesheet", href: adminMobileClarityCss },
      { rel: "stylesheet", href: adminMatchingCss },
      { rel: "stylesheet", href: adminOpsCss },
      { rel: "stylesheet", href: smartToolsCss },
      { rel: "stylesheet", href: desktopNavReadabilityCss },
      { rel: "stylesheet", href: headerRedesignCss },
      { rel: "stylesheet", href: propertyDetailFlowCss },
      { rel: "stylesheet", href: propertyToolCenterCss },
      { rel: "stylesheet", href: propertyDetailPolishCss },
      { rel: "stylesheet", href: homepagePolishCss },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFoundPage,
});

function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // PWA support is optional and must never affect navigation.
    });
  }, []);
  return null;
}

function RootDocument() {
  return (
    <html lang="fa" dir="rtl" className="js antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PwaRegistrar />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
          <MusicPlayer />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/api/")) return;
    void trackPublic404({
      data: {
        path,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      },
    }).catch(() => {});
  }, []);

  return (
    <main className="property-not-found" aria-labelledby="not-found-title">
      <h1 id="not-found-title">صفحه موردنظر پیدا نشد</h1>
      <p>این فایل ممکن است حذف شده باشد یا دیگر برای نمایش عمومی در دسترس نباشد.</p>
      <Link to="/" className="btn-gold">بازگشت به صفحه اصلی</Link>
    </main>
  );
}
