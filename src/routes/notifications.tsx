import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, CheckCheck, ExternalLink, RefreshCw, TrendingDown } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { listPublishedPropertyCards, type PropertyCardData, type PropertyOrientation, type PropertyType, type PropertyTransaction } from "@/lib/properties";
import { absoluteUrl, socialMeta } from "@/lib/seo";

type WatchAlert = { id: string; slug: string; type: string; message: string; createdAt: string };
type FeedItem = { id: string; kind: "watch" | "drop" | "new" | "saved-search"; title: string; text: string; href?: string; createdAt?: string; alertId?: string };

const SEEN_AT_KEY = "hirmand-notification-seen-at";
const SEEN_ALERTS_KEY = "hirmand-notification-alerts-seen";
const SAVED_SEARCHES_KEY = "hirmand-saved-searches";

export const Route = createFileRoute("/notifications")({
  head: () => {
    const title = "مرکز اعلان‌ها | املاک هیرمند";
    const description = "تغییر قیمت، تغییر وضعیت و فایل‌های تازه هیرمند را یک‌جا ببینید.";
    return { meta: [{ title }, { name: "description", content: description }, { name: "robots", content: "noindex, follow" }, ...socialMeta({ title, description, url: absoluteUrl("/notifications") })], links: [{ rel: "canonical", href: absoluteUrl("/notifications") }] };
  },
  component: NotificationsPage,
});

function safeRead(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function readSavedSearches(): Array<{ id: string; name: string; params: string; alerts?: boolean; lastCheckedAt?: string }> {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.params === "string") : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked by privacy settings.
  }
}

function NotificationsPage() {
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const [recent, setRecent] = useState<PropertyCardData[]>([]);
  const [savedSearchMatches, setSavedSearchMatches] = useState<Array<{ id: string; name: string; count: number; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  async function refresh() {
    setLoading(true);
    try {
      const savedSearches = readSavedSearches().filter((item) => item.alerts !== false && item.lastCheckedAt);
      const [watchResponse, latest] = await Promise.all([
        fetch("/api/property-watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync" }) })
          .then((response) => response.json() as Promise<{ alerts?: WatchAlert[] }>),
        listPublishedPropertyCards({ data: { sort: "newest", offset: 0 } }),
      ]);
      const nextAlerts = Array.isArray(watchResponse.alerts) ? watchResponse.alerts : [];
      setAlerts(nextAlerts);
      setRecent(latest);

      const searchMatches = await Promise.all(savedSearches.map(async (search) => {
        try {
          const params = new URLSearchParams(search.params);
          const numberParam = (key: string) => {
            const value = Number(params.get(key));
            return Number.isFinite(value) ? Math.round(value) : undefined;
          };
          const rawTransaction = params.get("transaction") ?? "";
          const transactionType = ["sell", "buy", "rent", "mortgage"].includes(rawTransaction) ? rawTransaction as PropertyTransaction : undefined;
          const rawPropertyType = params.get("type") ?? "";
          const propertyType = ["apartment", "villa", "office", "heritage", "land", "commercial"].includes(rawPropertyType)
            ? rawPropertyType as PropertyType
            : undefined;
          const rawOrientation = params.get("orientation") ?? "";
          const orientation = ["north","south","east","west","northeast","northwest","southeast","southwest","two_fronts","three_fronts","four_fronts","other"].includes(rawOrientation)
            ? rawOrientation as PropertyOrientation
            : undefined;
          const rows = await listPublishedPropertyCards({ data: {
            search: params.get("q") || undefined,
            transactionType,
            propertyType,
            neighborhood: params.get("neighborhood") || undefined,
            minArea: numberParam("minArea"),
            maxArea: numberParam("maxArea"),
            minPrice: numberParam("minPrice"),
            maxPrice: numberParam("maxPrice"),
            minBedrooms: numberParam("bedrooms"),
            minBathrooms: numberParam("bathrooms"),
            minFloor: numberParam("minFloor"),
            maxFloor: numberParam("maxFloor"),
            floorType: params.get("floorType") === "suite" ? "suite" : undefined,
            orientation,
            convertibleOnly: params.get("convertible") === "1" || undefined,
            minTotalFloors: numberParam("minFloors"),
            maxTotalFloors: numberParam("maxFloors"),
            minBuiltYear: numberParam("minYear"),
            maxBuiltYear: numberParam("maxYear"),
            parkingOnly: params.get("parking") === "1" || undefined,
            elevatorOnly: params.get("elevator") === "1" || undefined,
            storageOnly: params.get("storage") === "1" || undefined,
            specFilters: (params.get("specs") || "").split(",").map((item) => item.trim()).filter(Boolean),
            featureSearch: params.get("features") || undefined,
            featuredOnly: params.get("featured") === "1" || undefined,
            hasImagesOnly: params.get("images") === "1" || undefined,
            hasLocationOnly: params.get("location") === "1" || undefined,
            sort: "newest",
            offset: 0,
          }});
          const since = Date.parse(search.lastCheckedAt || "");
          if (!Number.isFinite(since)) return null;
          const matching = rows.filter((property) => {
            const published = property.publishedAt ? Date.parse(property.publishedAt) : NaN;
            return Number.isFinite(published) && published > since;
          });
          return matching.length ? {
            id: search.id,
            name: search.name,
            count: matching.length,
            createdAt: matching.reduce((latestAt, item) => Math.max(latestAt, Date.parse(item.publishedAt || "") || 0), 0) ? new Date(Math.max(...matching.map((item) => Date.parse(item.publishedAt || "") || 0))).toISOString() : new Date().toISOString(),
          } : null;
        } catch {
          return null;
        }
      }));
      const nextSearchMatches = searchMatches.filter((item): item is { id: string; name: string; count: number; createdAt: string } => Boolean(item));
      setSavedSearchMatches(nextSearchMatches);
      if ("Notification" in window) setBrowserPermission(Notification.permission);

      const seen = new Set<string>(JSON.parse(safeRead(SEEN_ALERTS_KEY) ?? "[]"));
      const freshAlerts = nextAlerts.filter((alert) => !seen.has(alert.id));
      const freshSearches = nextSearchMatches.filter((item) => !seen.has("search:" + item.id + ":" + item.createdAt));
      if ("Notification" in window && Notification.permission === "granted" && (freshAlerts.length || freshSearches.length)) {
        for (const alert of freshAlerts.slice(0, 2)) {
          new Notification("هیرمند · اعلان ملک", { body: alert.message });
          seen.add(alert.id);
        }
        for (const item of freshSearches.slice(0, 1)) {
          new Notification("هیرمند · فایل جدید مطابق جستجو", { body: item.name + " · " + item.count.toLocaleString("fa-IR") + " فایل جدید" });
          seen.add("search:" + item.id + ":" + item.createdAt);
        }
        safeWrite(SEEN_ALERTS_KEY, JSON.stringify([...seen].slice(-100)));
      }
      safeWrite(SEEN_AT_KEY, new Date().toISOString());
    } catch {
      // Keep the existing notification feed when a source temporarily fails.
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = alerts.map((alert) => ({
      id: "watch:" + alert.id,
      kind: "watch",
      title: alert.type === "price_drop" ? "کاهش قیمت فایل پیگیری‌شده" : "تغییر در فایل پیگیری‌شده",
      text: alert.message,
      href: "/properties/" + encodeURIComponent(alert.slug),
      createdAt: alert.createdAt,
      alertId: alert.id,
    }));
    for (const item of savedSearchMatches) {
      items.push({
        id: "search:" + item.id + ":" + item.createdAt,
        kind: "saved-search",
        title: "فایل جدید مطابق جستجوی «" + item.name + "»",
        text: item.count.toLocaleString("fa-IR") + " فایل تازه با معیارهای جستجوی ذخیره‌شده پیدا شد.",
        href: "/properties",
        createdAt: item.createdAt,
        alertId: "search:" + item.id + ":" + item.createdAt,
      });
    }
    const seenAt = Date.parse(safeRead(SEEN_AT_KEY) ?? "");
    const windowStart = Number.isFinite(seenAt) ? seenAt : Date.now() - 48 * 60 * 60 * 1000;
    for (const property of recent) {
      const publishedAt = property.publishedAt ? Date.parse(property.publishedAt) : NaN;
      if (Number.isFinite(publishedAt) && publishedAt >= windowStart) {
        items.push({ id: "new:" + property.id, kind: "new", title: "فایل جدید", text: property.title + " · " + property.neighborhood, href: "/properties/" + encodeURIComponent(property.slug), createdAt: property.publishedAt ?? undefined });
      }
      if ((property.priceDropPercent ?? 0) > 0) {
        items.push({ id: "drop:" + property.id, kind: "drop", title: "کاهش قیمت " + property.priceDropPercent + "%", text: property.title + " · " + property.neighborhood, href: "/properties/" + encodeURIComponent(property.slug), createdAt: property.publishedAt ?? undefined });
      }
    }
    return items.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")).slice(0, 30);
  }, [alerts, recent, savedSearchMatches]);

  async function requestBrowserNotifications() {
    if (!("Notification" in window)) { setBrowserPermission("unsupported"); return; }
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    if (permission === "granted") void refresh();
  }

  async function markAllSeen() {
    const ids = alerts.map((alert) => Number(alert.id)).filter(Number.isFinite);
    if (ids.length) {
      await fetch("/api/property-watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "seen", alertIds: ids }) }).catch(() => {});
    }
    const alertSeen = new Set<string>(JSON.parse(safeRead(SEEN_ALERTS_KEY) ?? "[]"));
    savedSearchMatches.forEach((item) => alertSeen.add("search:" + item.id + ":" + item.createdAt));
    alerts.forEach((alert) => alertSeen.add(alert.id));
    safeWrite(SEEN_ALERTS_KEY, JSON.stringify([...alertSeen].slice(-100)));
    safeWrite(SEEN_AT_KEY, new Date().toISOString());
    setAlerts([]);
    setRecent([]);
    setSavedSearchMatches([]);
  }

  return (
    <SiteChrome className="property-detail-shell">
      <main className="smart-tool-page">
        <section className="smart-tool-hero notification-hero">
          <span className="kicker">یک‌جا، بدون گم‌شدن اعلان</span>
          <h1>مرکز اعلان‌های هیرمند</h1>
          <p>کاهش قیمت، تغییر وضعیت فایل‌های پیگیری‌شده، فایل‌های تازه و نتیجه جستجوهای ذخیره‌شده در یک صفحه جمع می‌شوند.</p>
          <div className="notification-actions">
            <button type="button" className="btn-gold" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? "در حال به‌روزرسانی…" : "به‌روزرسانی"}</button>
            {browserPermission !== "granted" && browserPermission !== "denied" && browserPermission !== "unsupported" ? <button type="button" className="btn-ghost" onClick={() => void requestBrowserNotifications()}><BellRing size={16} /> فعال‌سازی اعلان مرورگر</button> : null}
            <button type="button" className="btn-ghost" onClick={() => void markAllSeen()}><CheckCheck size={16} /> پاک‌کردن موارد دیده‌نشده</button>
          </div>
          {browserPermission === "denied" ? <small className="notification-note">اعلان مرورگر در تنظیمات مرورگر مسدود شده است.</small> : null}
        </section>
        <section className="notification-feed" aria-live="polite">
          <div className="smart-search-result-head">
            <div><span className="kicker">آخرین رویدادها</span><h2>{feed.length.toLocaleString("fa-IR")} اعلان فعال</h2></div>
            <Link to="/properties" className="btn-ghost">مشاهده فایل‌ها <ExternalLink size={15} /></Link>
          </div>
          {feed.length ? <div className="notification-list">
            {feed.map((item) => (
              <article key={item.id} className="notification-card">
                <div className="notification-icon" aria-hidden="true">{item.kind === "watch" || item.kind === "drop" ? <TrendingDown size={18} /> : <Bell size={18} />}</div>
                <div className="notification-copy"><strong>{item.title}</strong><p>{item.text}</p>{item.createdAt ? <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("fa-IR")}</time> : null}</div>
                {item.href ? <Link to={item.href} className="notification-open">باز کردن</Link> : null}
              </article>
            ))}
          </div> : <section className="property-empty"><Bell size={28} /><strong>فعلاً اعلان فعالی ندارید.</strong><p>فایل جدید مطابق جستجوهای ذخیره‌شده یا تغییر مهم در فایل‌های پیگیری‌شده، از همین‌جا قابل مشاهده است.</p><Link to="/properties" className="btn-gold">رفتن به فایل‌ها</Link></section>}
        </section>
      </main>
    </SiteChrome>
  );
}
