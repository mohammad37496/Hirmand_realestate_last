import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LocateFixed, MapPin, Minus, Plus } from "lucide-react";
import type { PropertyCardData } from "@/lib/properties";

type MapProperty = PropertyCardData;

type MapView = { latitude: number; longitude: number; zoom: number };
type PixelPoint = { x: number; y: number };
type MapSize = { width: number; height: number };

const TILE_SIZE = 256;
const DEFAULT_VIEW: MapView = { latitude: 32.655, longitude: 51.668, zoom: 12 };

function project(latitude: number, longitude: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function unproject(point: PixelPoint, zoom: number): Pick<MapView, "latitude" | "longitude"> {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  return {
    longitude: (point.x / scale) * 360 - 180,
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

function normalizeBbox(raw: string | null): [number, number, number, number] | null {
  if (!raw) return null;
  const values = raw.split(",").map((value) => Number(value.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return [west, south, east, north];
}

function propertyAmountLabel(property: MapProperty): string {
  const amount = (value: number | string | null | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const compact = (value: number) => {
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " میلیارد";
    if (value >= 1_000_000) return (value / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " میلیون";
    return value.toLocaleString("fa-IR");
  };
  const price = amount(property.price);
  const deposit = amount(property.deposit);
  const rent = amount(property.rent);
  if (property.transactionType === "rent") {
    if (rent && deposit) return compact(rent) + " اجاره";
    if (rent) return compact(rent) + " اجاره";
    if (deposit) return compact(deposit) + " رهن";
  }
  if (property.transactionType === "mortgage" && deposit) return compact(deposit) + " رهن";
  if (price) return compact(price);
  if (deposit) return compact(deposit) + " رهن";
  return "تماس";
}

type Tile = { key: string; url: string; left: number; top: number };

export function PropertiesMap({
  properties,
  selectedPropertyId,
  onSelect,
}: {
  properties: MapProperty[];
  selectedPropertyId: string | null;
  onSelect: (id: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [view, setView] = useState<MapView>(DEFAULT_VIEW);
  const [size, setSize] = useState<MapSize>({ width: 920, height: 640 });
  const [dragOffset, setDragOffset] = useState<PixelPoint>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [failedTiles, setFailedTiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(340, Math.round(rect.height)),
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bounds = normalizeBbox(params.get("map_bbox")) ?? normalizeBbox(params.get("bbox"));
    if (!bounds) return;
    const [west, south, east, north] = bounds;
    setView({
      latitude: (south + north) / 2,
      longitude: (west + east) / 2,
      zoom: 14,
    });
  }, []);

  useEffect(() => {
    setFailedTiles(new Set());
  }, [view.latitude, view.longitude, view.zoom]);

  const centerWorld = useMemo(() => project(view.latitude, view.longitude, view.zoom), [view.latitude, view.longitude, view.zoom]);
  const visualCenter = {
    x: centerWorld.x - dragOffset.x,
    y: centerWorld.y - dragOffset.y,
  };
  const worldLeft = visualCenter.x - size.width / 2;
  const worldTop = visualCenter.y - size.height / 2;

  const tiles = useMemo<Tile[]>(() => {
    const totalTiles = 2 ** view.zoom;
    const startX = Math.floor(worldLeft / TILE_SIZE);
    const endX = Math.floor((worldLeft + size.width) / TILE_SIZE);
    const startY = Math.floor(worldTop / TILE_SIZE);
    const endY = Math.floor((worldTop + size.height) / TILE_SIZE);
    const result: Tile[] = [];
    for (let rawY = startY; rawY <= endY; rawY += 1) {
      if (rawY < 0 || rawY >= totalTiles) continue;
      for (let rawX = startX; rawX <= endX; rawX += 1) {
        const x = ((rawX % totalTiles) + totalTiles) % totalTiles;
        result.push({
          key: `${view.zoom}/${x}/${rawY}`,
          url: `https://tile.openstreetmap.org/${view.zoom}/${x}/${rawY}.png`,
          left: rawX * TILE_SIZE - worldLeft,
          top: rawY * TILE_SIZE - worldTop,
        });
      }
    }
    return result;
  }, [view.zoom, worldLeft, worldTop, size.width, size.height]);

  const markers = useMemo(() => {
    const groups = new Map<string, { x: number; y: number; items: MapProperty[] }>();
    for (const property of properties) {
      if (property.latitude == null || property.longitude == null) continue;
      const latitude = Number(property.latitude);
      const longitude = Number(property.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const point = project(latitude, longitude, view.zoom);
      const x = point.x - worldLeft;
      const y = point.y - worldTop;
      if (x < -60 || y < -60 || x > size.width + 60 || y > size.height + 60) continue;
      const key = `${Math.floor(x / 56)}:${Math.floor(y / 56)}`;
      const group = groups.get(key);
      if (group) {
        group.x = (group.x * group.items.length + x) / (group.items.length + 1);
        group.y = (group.y * group.items.length + y) / (group.items.length + 1);
        group.items.push(property);
      } else {
        groups.set(key, { x, y, items: [property] });
      }
    }
    return [...groups.values()];
  }, [properties, view.zoom, worldLeft, worldTop, size.width, size.height]);

  const mappedCount = useMemo(
    () => properties.filter((property) => property.latitude != null && property.longitude != null).length,
    [properties],
  );

  const onMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setDragOffset({ x: 0, y: 0 });
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onMapPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current || dragOrigin.current.pointerId !== event.pointerId) return;
    setDragOffset({
      x: event.clientX - dragOrigin.current.x,
      y: event.clientY - dragOrigin.current.y,
    });
  }, []);

  const onMapPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    dragOrigin.current = null;
    setDragging(false);
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      const nextCenter = unproject({ x: centerWorld.x - deltaX, y: centerWorld.y - deltaY }, view.zoom);
      setView((current) => ({ ...current, ...nextCenter }));
    }
    setDragOffset({ x: 0, y: 0 });
  }, [centerWorld.x, centerWorld.y, view.zoom]);

  const zoomBy = useCallback((amount: number) => {
    setView((current) => ({
      ...current,
      zoom: Math.max(10, Math.min(18, current.zoom + amount)),
    }));
  }, []);

  const resetMap = useCallback(() => setView(DEFAULT_VIEW), []);

  const openCurrentMap = `https://www.openstreetmap.org/#map=${view.zoom}/${view.latitude.toFixed(6)}/${view.longitude.toFixed(6)}`;

  return (
    <div
      className={`pf-map-canvas${dragging ? " is-dragging" : ""}`}
      ref={mapRef}
      role="region"
      aria-label="نقشه تعاملی موقعیت فایل‌های ملکی در اصفهان"
      onPointerDown={onMapPointerDown}
      onPointerMove={onMapPointerMove}
      onPointerUp={onMapPointerUp}
      onPointerCancel={onMapPointerUp}
    >
      <div className="pf-map-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="pf-map-tile"
            src={tile.url}
            alt=""
            draggable={false}
            loading="lazy"
            style={{ left: tile.left, top: tile.top }}
            onError={() => setFailedTiles((previous) => {
              if (previous.has(tile.key)) return previous;
              const next = new Set(previous);
              next.add(tile.key);
              return next;
            })}
          />
        ))}
      </div>
      <div className="pf-map-wash" aria-hidden="true" />
      {markers.map((marker) => {
        const active = marker.items.some((item) => item.id === selectedPropertyId);
        const property = marker.items.find((item) => item.id === selectedPropertyId) ?? marker.items[0];
        const label = marker.items.length > 1
          ? `${marker.items.length.toLocaleString("fa-IR")} فایل`
          : propertyAmountLabel(property);
        return (
          <button
            type="button"
            key={marker.items.map((item) => item.id).sort().join(":")}
            className={`pf-map-marker${active ? " is-active" : ""}${marker.items.length > 1 ? " is-cluster" : ""}`}
            style={{ left: marker.x, top: marker.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(property.id)}
            title={marker.items.length > 1 ? `${marker.items.length.toLocaleString("fa-IR")} فایل در این محدوده` : property.title}
            aria-label={marker.items.length > 1 ? `${marker.items.length} فایل در این محدوده` : `انتخاب فایل ${property.title}`}
          >
            {label}
          </button>
        );
      })}
      {mappedCount === 0 ? (
        <div className="pf-map-empty-note">
          <MapPin size={18} />
          <span>برای این جست‌وجو هنوز مختصات فایل ثبت نشده است؛ فهرست فایل‌ها همچنان در دسترس است.</span>
        </div>
      ) : null}
      {failedTiles.size >= 4 ? (
        <div className="pf-map-offline-note" role="status">
          نقشه پایه در این اتصال بارگذاری نمی‌شود؛ فهرست و فیلترهای فایل فعال هستند.
        </div>
      ) : null}
      <div className="pf-map-floating-head">
        <span><MapPin size={14} /> اصفهان · {mappedCount.toLocaleString("fa-IR")} فایل دارای موقعیت</span>
        <a href={openCurrentMap} target="_blank" rel="noopener noreferrer">نقشه بزرگ‌تر</a>
      </div>
      <div className="pf-map-controls" aria-label="کنترل نقشه">
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1)} aria-label="بزرگ‌نمایی نقشه"><Plus size={18} /></button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(-1)} aria-label="کوچک‌نمایی نقشه"><Minus size={18} /></button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetMap} aria-label="بازگشت به نمای اصفهان"><LocateFixed size={18} /></button>
      </div>
      <div className="pf-map-attribution">
        نقشه © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </div>
    </div>
  );
}
