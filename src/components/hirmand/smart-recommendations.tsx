import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  listPublishedPropertyCards,
  type PropertyCardData,
} from "@/lib/properties";

const RECENT_PROPERTIES_KEY = "hirmand-recent-properties";
const FAVORITES_KEY = "hirmand-favorite-properties";
const SAVED_SEARCHES_KEY = "hirmand-saved-searches";

type SavedSearch = { params?: string; name?: string };

function readArray(key: string, limit: number) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

function readSavedSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SavedSearch => Boolean(item && typeof item === "object")).slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function getPrice(property: PropertyCardData) {
  const raw = Number(property.price ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function scoreProperty(
  property: PropertyCardData,
  recentProperties: PropertyCardData[],
  recentSlugs: string[],
  favoriteSlugs: string[],
  savedSearches: SavedSearch[],
) {
  let score = 0;
  const reasons: string[] = [];
  const recentIndex = recentSlugs.indexOf(property.slug);

  if (recentIndex >= 0) {
    score += 65 - recentIndex * 6;
    reasons.push("نزدیک به بازدیدهای اخیر");
  }
  if (favoriteSlugs.includes(property.slug)) score += 90;

  const reference = recentProperties.slice(0, 5);
  const sameNeighborhood = reference.some((item) => item.neighborhood === property.neighborhood);
  const sameType = reference.some((item) => item.propertyType === property.propertyType);
  const sameTransaction = reference.some((item) => item.transactionType === property.transactionType);

  if (sameNeighborhood) {
    score += 24;
    reasons.push("هم‌محله با فایل‌های مورد توجه شما");
  }
  if (sameType) {
    score += 14;
    reasons.push("هم‌نوع با فایل‌های اخیر");
  }
  if (sameTransaction) score += 10;

  const price = getPrice(property);
  const peerPrices = reference.map(getPrice).filter((value): value is number => value != null);
  if (price && peerPrices.length) {
    const average = peerPrices.reduce((sum, item) => sum + item, 0) / peerPrices.length;
    if (average > 0 && Math.abs(price - average) / average <= 0.18) {
      score += 8;
      reasons.push("در محدوده قیمتی مورد توجه شما");
    }
  }

  for (const saved of savedSearches) {
    if (!saved.params) continue;
    const params = new URLSearchParams(saved.params);
    let matched = 0;
    if (params.get("neighborhood") && params.get("neighborhood") === property.neighborhood) matched += 4;
    if (params.get("type") && params.get("type") === property.propertyType) matched += 3;
    if (params.get("transaction") && params.get("transaction") === property.transactionType) matched += 3;
    const minArea = Number(params.get("minArea"));
    const maxArea = Number(params.get("maxArea"));
    const minPrice = Number(params.get("minPrice"));
    const maxPrice = Number(params.get("maxPrice"));
    const minBedrooms = Number(params.get("bedrooms"));
    if (Number.isFinite(minArea) && (property.areaM2 ?? 0) >= minArea) matched += 1;
    if (Number.isFinite(maxArea) && maxArea > 0 && (property.areaM2 ?? 0) <= maxArea) matched += 1;
    if (Number.isFinite(minPrice) && (price ?? 0) >= minPrice) matched += 1;
    if (Number.isFinite(maxPrice) && maxPrice > 0 && (price ?? 0) <= maxPrice) matched += 1;
    if (Number.isFinite(minBedrooms) && (property.bedrooms ?? 0) >= minBedrooms) matched += 1;
    if (matched >= 5) {
      score += matched * 5;
      reasons.push("نزدیک به جست‌وجوی ذخیره‌شده");
      break;
    }
  }

  if (property.priceDropPercent && property.priceDropPercent > 0) {
    score += 5;
    reasons.push("تغییر قیمت اخیر");
  }
  if (property.featured) score += 2;
  if (!reasons.length) reasons.push("پیشنهاد شروع برای شما");

  return { property, score, reason: reasons.slice(0, 2).join(" · ") };
}

export function SmartRecommendations() {
  const [properties, setProperties] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listPublishedPropertyCards({ data: { offset: 0, sort: "newest" } });
        if (cancelled) return;
        setProperties(data);
      } catch {
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(() => {
    if (!properties.length) return [];
    const recentSlugs = readArray(RECENT_PROPERTIES_KEY, 8);
    const favoriteSlugs = readArray(FAVORITES_KEY, 30);
    const savedSearches = readSavedSearches();
    const reference = properties.filter((item) => recentSlugs.includes(item.slug));
    const candidates = properties
      .map((property) => scoreProperty(property, reference, recentSlugs, favoriteSlugs, savedSearches))
      .filter((item) => !favoriteSlugs.includes(item.property.slug) || recentSlugs.includes(item.property.slug))
      .sort((a, b) => b.score - a.score);

    const hasSignals = recentSlugs.length || favoriteSlugs.length || savedSearches.length;
    return (hasSignals ? candidates : candidates.filter((item) => item.property.featured))
      .filter((item, index, array) => array.findIndex((x) => x.property.slug === item.property.slug) === index)
      .slice(0, 6);
  }, [properties]);

  if (loading || !ranked.length) return null;

  return (
    <section className="section smart-recommendations" aria-labelledby="smart-recommendations-title">
      <div className="section-head">
        <span className="kicker"><Sparkles size={14} /> پیشنهاد هوشمند</span>
        <h2 id="smart-recommendations-title">فایل‌هایی نزدیک به سلیقه و جست‌وجوی شما</h2>
        <p>با تکیه بر بازدیدها، علاقه‌مندی‌ها و جست‌وجوهای ذخیره‌شده همین مرورگر.</p>
      </div>
      <div className="smart-recommendations-grid">
        {ranked.map(({ property, reason }) => (
          <Link
            key={property.id}
            to="/properties/$slug"
            params={{ slug: property.slug }}
            className="smart-recommendation-card"
          >
            <div className="smart-recommendation-media">
              {property.image ? <img src={property.image} alt="" loading="lazy" /> : <span>هیرمند</span>}
              {property.priceDropPercent ? <b>تغییر قیمت</b> : null}
            </div>
            <div className="smart-recommendation-copy">
              <strong>{property.title}</strong>
              <span>{property.neighborhood}{property.areaM2 ? ` · ${property.areaM2.toLocaleString("fa-IR")} متر` : ""}</span>
              <em>{reason}</em>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/favorites" className="smart-recommendations-foot">مدیریت علاقه‌مندی‌ها <ArrowLeft size={15} /></Link>
    </section>
  );
}
