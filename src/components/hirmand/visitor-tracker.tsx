import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";

const RECENT_PROPERTIES_KEY = "hirmand-recent-properties";
const MAX_RECENT_PROPERTIES = 8;

export function VisitorTracker() {
  const location = useLocation();
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    const pathname = window.location.pathname;

    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;

    const searchParams = new URLSearchParams(window.location.search);
    const send = (payload: Record<string, string>) => {
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          path: pathname,
          referrer: document.referrer,
          utmSource: searchParams.get("utm_source") || "",
          utmMedium: searchParams.get("utm_medium") || "",
          utmCampaign: searchParams.get("utm_campaign") || "",
          ...payload,
        }),
      }).catch(() => {
        // Analytics must never interfere with site navigation.
      });
    };

    const key = pathname;
    if (trackedRef.current !== key) {
      trackedRef.current = key;
      send({});

      const propertyMatch = pathname.match(/^\/properties\/([^/]+)$/);
      const propertySlug = propertyMatch?.[1];
      if (propertySlug) {
        try {
          const raw = localStorage.getItem(RECENT_PROPERTIES_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          const current = Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
          const next = [propertySlug, ...current.filter((item) => item !== propertySlug)]
            .slice(0, MAX_RECENT_PROPERTIES);
          localStorage.setItem(RECENT_PROPERTIES_KEY, JSON.stringify(next));
        } catch {
          // Recent views are optional convenience data.
        }

        send({ event: "property_view", propertySlug });
      }
    }

    const heartbeat = () => {
      if (document.visibilityState === "visible") send({ event: "heartbeat" });
    };

    const interval = window.setInterval(heartbeat, 60_000);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [location.pathname]);

  return null;
}
