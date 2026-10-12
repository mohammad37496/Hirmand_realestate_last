import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPinned, Navigation, Route } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/favorites-route-planner.css";

const STORAGE_KEY = "hirmand-favorites-viewing-route-v1";
const MAX_STOPS = 6;

function distanceKm(a: Property, b: Property) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function readSavedSelection(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_STOPS)
      : [];
  } catch {
    return [];
  }
}

function routeUrl(stops: Property[]) {
  if (stops.length < 2) return "";
  const origin = String(stops[0].latitude) + "," + String(stops[0].longitude);
  const destination = String(stops[stops.length - 1].latitude) + "," + String(stops[stops.length - 1].longitude);
  const waypoints = stops.slice(1, -1).map((item) => String(item.latitude) + "," + String(item.longitude)).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return "https://www.google.com/maps/dir/?" + params.toString();
}

export function FavoritesViewingRoute({ properties }: { properties: Property[] }) {
  const mappable = useMemo(
    () => properties.filter((property) => property.latitude != null && property.longitude != null),
    [properties],
  );
  const mappableIds = mappable.map((property) => property.id).join("|");
  const [selected, setSelected] = useState<string[]>(() => readSavedSelection());
  const [startId, setStartId] = useState("");

  useEffect(() => {
    const valid = selected.filter((id) => mappable.some((property) => property.id === id)).slice(0, MAX_STOPS);
    if (valid.length >= 2) {
      setSelected(valid);
    } else {
      setSelected(mappable.slice(0, Math.min(4, MAX_STOPS)).map((property) => property.id));
    }
  }, [mappableIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    } catch {
      // Optional convenience state.
    }
  }, [selected]);

  useEffect(() => {
    if (startId && selected.includes(startId)) return;
    setStartId(selected[0] ?? "");
  }, [selected, startId]);

  const selectedProperties = useMemo(
    () => selected.map((id) => mappable.find((property) => property.id === id)).filter((property): property is Property => Boolean(property)),
    [mappable, selected],
  );

  const orderedProperties = useMemo(() => {
    if (!selectedProperties.length) return [];
    const start = selectedProperties.find((property) => property.id === startId) ?? selectedProperties[0];
    const remaining = selectedProperties.filter((property) => property.id !== start.id);
    const ordered = [start];
    while (remaining.length) {
      const last = ordered[ordered.length - 1];
      let nextIndex = 0;
      let best = Number.POSITIVE_INFINITY;
      remaining.forEach((candidate, index) => {
        const distance = distanceKm(last, candidate);
        if (distance < best) {
          best = distance;
          nextIndex = index;
        }
      });
      const [next] = remaining.splice(nextIndex, 1);
      if (next) ordered.push(next);
    }
    return ordered;
  }, [selectedProperties, startId]);

  const totalDirectKm = useMemo(
    () => orderedProperties.slice(1).reduce((sum, property, index) => sum + distanceKm(orderedProperties[index], property), 0),
    [orderedProperties],
  );

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length <= 2 ? current : current.filter((item) => item !== id);
      }
      return current.length >= MAX_STOPS ? current : [...current, id];
    });
  }

  if (mappable.length < 2) {
    return null;
  }

  return (
    <section className="favorites-route" aria-labelledby="favorites-route-title">
      <header className="favorites-route-head">
        <div>
          <span className="kicker">بازدید چندملکی</span>
          <h2 id="favorites-route-title"><Route size={19} /> ترتیب پیشنهادی مسیر بازدید</h2>
          <p>ترتیب زیر با کم‌کردن فاصله مستقیم بین مختصات فایل‌ها ساخته می‌شود؛ مسیر رانندگی واقعی را نقشه هنگام باز شدن محاسبه می‌کند.</p>
        </div>
        <span className="favorites-route-limit">{selected.length.toLocaleString("fa-IR")} از {MAX_STOPS.toLocaleString("fa-IR")} توقف</span>
      </header>

      <div className="favorites-route-controls">
        <label>
          <span>شروع از</span>
          <select value={startId} onChange={(event) => setStartId(event.target.value)}>
            {selectedProperties.map((property) => <option value={property.id} key={property.id}>{property.title}</option>)}
          </select>
        </label>
        <span className="favorites-route-distance">
          فاصله مستقیم تقریبی: {totalDirectKm.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلومتر
        </span>
      </div>

      <div className="favorites-route-picks">
        {mappable.map((property) => {
          const active = selected.includes(property.id);
          return (
            <button key={property.id} type="button" className={active ? "is-selected" : ""} onClick={() => toggle(property.id)} aria-pressed={active}>
              {active ? <Navigation size={13} /> : null}
              {property.title}
            </button>
          );
        })}
      </div>

      {orderedProperties.length >= 2 ? (
        <div className="favorites-route-list">
          {orderedProperties.map((property, index) => (
            <div className="favorites-route-stop" key={property.id}>
              <span className="favorites-route-number">{(index + 1).toLocaleString("fa-IR")}</span>
              <div>
                <strong>{property.title}</strong>
                <span>{property.neighborhood}{property.areaM2 ? " · " + property.areaM2.toLocaleString("fa-IR") + " متر" : ""}</span>
              </div>
              {index < orderedProperties.length - 1 ? (
                <small>{distanceKm(property, orderedProperties[index + 1]).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلومتر</small>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="favorites-route-empty">حداقل دو فایل دارای مختصات را انتخاب کنید.</p>
      )}

      <div className="favorites-route-actions">
        {orderedProperties.length >= 2 ? (
          <a className="btn-gold" href={routeUrl(orderedProperties)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> باز کردن مسیر در نقشه
          </a>
        ) : null}
        <div className="favorites-route-location-note">
          <MapPinned size={15} />
          <span>{properties.filter((property) => property.latitude == null || property.longitude == null).length.toLocaleString("fa-IR")} فایل مختصات کافی برای مسیر ندارند.</span>
        </div>
      </div>
    </section>
  );
}
