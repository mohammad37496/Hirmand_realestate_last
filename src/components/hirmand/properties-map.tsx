import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import { LocateFixed, MapPin, MapPinned, Minus, Plus } from "lucide-react";
import type { PropertyCardData } from "@/lib/properties";
import type { Neighborhood } from "@/lib/site";
import {
  DEFAULT_MAP_VIEW,
  TILE_SIZE,
  fitBoundsToView,
  isValidWgs84Point,
  normalizeCoordinateBounds,
  parseCoordinateBounds,
  project,
  unproject,
  viewportBoundsFromView,
  type CoordinateBounds,
  type MapView,
  type PixelPoint,
} from "@/lib/map-geometry";

type MapProperty = PropertyCardData;

type MapSize = { width: number; height: number };

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
type NeighborhoodBox = {
  key: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  selected: boolean;
};

export function PropertiesMap({
  properties,
  neighborhoods,
  selectedNeighborhood,
  selectedPropertyId,
  onSelect,
  onSelectNeighborhood,
  onViewportChange,
  onResetMap,
  viewportResetBounds,
  viewportResetVersion,
}: {
  properties: MapProperty[];
  neighborhoods: Neighborhood[];
  selectedNeighborhood: string;
  selectedPropertyId: string | null;
  onSelect: (id: string) => void;
  onSelectNeighborhood: (name: string) => void;
  onViewportChange?: (bounds: CoordinateBounds) => void;
  onResetMap: () => void;
  viewportResetBounds: CoordinateBounds | undefined;
  viewportResetVersion: number;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const appliedViewportResetVersion = useRef(0);
  const initialBoundsRef = useRef<CoordinateBounds | null>(null);
  const userChangedViewRef = useRef(false);
  const neighborhoodBoxesRef = useRef<NeighborhoodBox[]>([]);
  const [view, setView] = useState<MapView>(DEFAULT_MAP_VIEW);
  const [size, setSize] = useState<MapSize>({ width: 920, height: 640 });
  const [sizeReady, setSizeReady] = useState(false);
  const [dragOffset, setDragOffset] = useState<PixelPoint>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [failedTiles, setFailedTiles] = useState<Set<string>>(new Set());
  const [showNeighborhoodBounds, setShowNeighborhoodBounds] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(340, Math.round(rect.height)),
      });
      setSizeReady(true);
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
    initialBoundsRef.current =
      parseCoordinateBounds(params.get("map_bbox")) ??
      parseCoordinateBounds(params.get("bbox")) ??
      null;
    setViewportReady(true);
  }, []);

  // A direct neighborhood URL without map_bbox opens at its stored Divar extent.
  // A saved viewport always takes precedence over a neighborhood bounding box.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedBounds =
      parseCoordinateBounds(params.get("map_bbox")) ??
      parseCoordinateBounds(params.get("bbox"));
    if (savedBounds || !selectedNeighborhood) return;
    const area = neighborhoods.find((item) => item.name === selectedNeighborhood);
    const areaBounds = normalizeCoordinateBounds(area?.divarBbox);
    if (areaBounds) initialBoundsRef.current = areaBounds;
  }, [selectedNeighborhood, neighborhoods]);

  // Wait until the real viewport is measured, then fit the whole rectangle.
  // Initial restore/resize is presentation only and must not mutate the URL filter.
  useEffect(() => {
    if (!viewportReady || !sizeReady || userChangedViewRef.current) return;
    const bounds = initialBoundsRef.current;
    if (!bounds) return;
    const fitted = fitBoundsToView(bounds, size.width, size.height);
    if (fitted) setView(fitted);
  }, [viewportReady, sizeReady, size.width, size.height, selectedNeighborhood, neighborhoods]);

  useEffect(() => {
    if (appliedViewportResetVersion.current === viewportResetVersion) return;
    appliedViewportResetVersion.current = viewportResetVersion;
    initialBoundsRef.current = normalizeCoordinateBounds(viewportResetBounds) ?? null;
    userChangedViewRef.current = false;
    if (!viewportResetBounds) {
      setView(DEFAULT_MAP_VIEW);
      return;
    }
    const fitted = fitBoundsToView(viewportResetBounds, size.width, size.height);
    setView(fitted ?? DEFAULT_MAP_VIEW);
  }, [viewportResetBounds, viewportResetVersion, size.width, size.height]);

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

  const viewportBounds = useMemo(
    () => viewportBoundsFromView(view, size.width, size.height),
    [view.latitude, view.longitude, view.zoom, size.width, size.height],
  );

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

  const neighborhoodBoxes = useMemo<NeighborhoodBox[]>(() => {
    if (!showNeighborhoodBounds) return [];
    const boxes = neighborhoods.flatMap((area): NeighborhoodBox[] => {
      const bounds = area.divarBbox;
      if (!bounds) return [];
      const validBounds = normalizeCoordinateBounds(bounds);
      if (!validBounds) return [];
      const [west, south, east, north] = validBounds;
      const upperLeft = project(north, west, view.zoom);
      const lowerRight = project(south, east, view.zoom);
      const left = upperLeft.x - worldLeft;
      const top = upperLeft.y - worldTop;
      const width = lowerRight.x - upperLeft.x;
      const height = lowerRight.y - upperLeft.y;
      const selected = area.name === selectedNeighborhood;
      if (left + width < 0 || top + height < 0 || left > size.width || top > size.height) return [];
      // At city scale, tiny boxes overlap heavily. Reveal them as users zoom in;
      // always retain the selected neighborhood so its approximate extent remains visible.
      if (!selected && view.zoom < 13) return [];
      if (!selected && (width < 15 || height < 13)) return [];
      return [{
        key: `${area.name}:${area.divarDistrictId ?? "local"}`,
        name: area.name,
        left,
        top,
        width,
        height,
        selected,
      }];
    });
    // Keep the selected extent inside the capped list, even when many neighborhood boxes overlap.
    return boxes.sort((a, b) => Number(b.selected) - Number(a.selected)).slice(0, 180);
  }, [neighborhoods, selectedNeighborhood, showNeighborhoodBounds, view.zoom, worldLeft, worldTop, size.width, size.height]);

  // The pointer callback is declared above the memo; keep the latest boxes in a ref
  // so the callback never closes over a later const binding (TDZ) and stays stable.
  neighborhoodBoxesRef.current = neighborhoodBoxes;

  const markers = useMemo(() => {
    const groups = new Map<string, { x: number; y: number; items: MapProperty[] }>();
    for (const property of properties) {
      if (!isValidWgs84Point(property.latitude, property.longitude)) continue;
      const latitude = Number(property.latitude);
      const longitude = Number(property.longitude);
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
    () => properties.filter((property) => isValidWgs84Point(property.latitude, property.longitude)).length,
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

  const completeMapGesture = useCallback((
    deltaX: number,
    deltaY: number,
    clientX: number,
    clientY: number,
  ) => {
    setDragging(false);
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      userChangedViewRef.current = true;
      const nextCenter = unproject({ x: centerWorld.x - deltaX, y: centerWorld.y - deltaY }, view.zoom);
      const nextView = { ...view, ...nextCenter };
      setView(nextView);
      // Persist the exact viewport produced by the same gesture that changed
      // the camera. Do not depend on a later effect to infer the user's action.
      const nextBounds = viewportBoundsFromView(nextView, size.width, size.height);
      if (nextBounds) onViewportChange?.(nextBounds);
    } else {
      // Neighborhood extents are visual bbox overlays, not interactive layers:
      // resolve a tap to the smallest visible bbox so map dragging remains available.
      const rect = mapRef.current?.getBoundingClientRect();
      if (rect) {
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const hit = neighborhoodBoxesRef.current
          .filter((area) => x >= area.left && x <= area.left + area.width && y >= area.top && y <= area.top + area.height)
          .sort((a, b) => a.width * a.height - b.width * b.height)[0];
        if (hit) onSelectNeighborhood(hit.name);
      }
    }
    setDragOffset({ x: 0, y: 0 });
  }, [centerWorld.x, centerWorld.y, view, size.width, size.height, onViewportChange, onSelectNeighborhood]);

  const onMapPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    dragOrigin.current = null;
    completeMapGesture(
      event.clientX - origin.x,
      event.clientY - origin.y,
      event.clientX,
      event.clientY,
    );
  }, [completeMapGesture]);

  // Pointer events are the primary path. Keep a touch fallback for WebViews
  // that deliver touch events but fail to synthesize pointer capture; otherwise
  // the visible map may pan while the bbox in the shared URL stays stale.
  const onMapTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    // A touch sequence may emit pointerdown without a reliable pointerup in
    // embedded browsers. Let the native touch lifecycle own this gesture so
    // touchmove/touchend can always commit the viewport and its URL bounds.
    dragOrigin.current = { x: touch.clientX, y: touch.clientY, pointerId: -1 };
    setDragOffset({ x: 0, y: 0 });
    setDragging(true);
  }, []);

  const onMapTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (dragOrigin.current?.pointerId !== -1) return;
    const touch = event.touches[0];
    if (!touch) return;
    setDragOffset({
      x: touch.clientX - dragOrigin.current.x,
      y: touch.clientY - dragOrigin.current.y,
    });
  }, []);

  const onMapTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== -1) return;
    const touch = event.changedTouches[0];
    if (!touch) {
      dragOrigin.current = null;
      setDragging(false);
      setDragOffset({ x: 0, y: 0 });
      return;
    }
    dragOrigin.current = null;
    completeMapGesture(
      touch.clientX - origin.x,
      touch.clientY - origin.y,
      touch.clientX,
      touch.clientY,
    );
  }, [completeMapGesture]);

  const zoomBy = useCallback((amount: number) => {
    userChangedViewRef.current = true;
    const nextView = {
      ...view,
      zoom: Math.max(10, Math.min(18, view.zoom + amount)),
    };
    setView(nextView);
    const nextBounds = viewportBoundsFromView(nextView, size.width, size.height);
    if (nextBounds) onViewportChange?.(nextBounds);
  }, [view, size.width, size.height, onViewportChange]);

  const resetMap = useCallback(() => {
    onResetMap();
  }, [onResetMap]);

  const openCurrentMap = `https://www.openstreetmap.org/#map=${view.zoom}/${view.latitude.toFixed(6)}/${view.longitude.toFixed(6)}`;

  return (
    <div
      className={`pf-map-canvas${dragging ? " is-dragging" : ""}`}
      ref={mapRef}
      role="region"
      aria-label="نقشه تعاملی موقعیت فایل‌های ملکی در اصفهان"
      data-map-zoom={view.zoom}
      data-map-center-latitude={view.latitude}
      data-map-center-longitude={view.longitude}
      data-map-viewport-bounds={viewportBounds?.join(",") ?? ""}
      onPointerDown={onMapPointerDown}
      onPointerMove={onMapPointerMove}
      onPointerUp={onMapPointerUp}
      onPointerCancel={onMapPointerUp}
      onTouchStart={onMapTouchStart}
      onTouchMove={onMapTouchMove}
      onTouchEnd={onMapTouchEnd}
      onTouchCancel={onMapTouchEnd}
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
      {neighborhoodBoxes.map((area) => (
        <div
          key={area.key}
          className={`pf-map-neighborhood-box${area.selected ? " is-active" : ""}`}
          style={{ left: area.left, top: area.top, width: area.width, height: area.height }}
          data-neighborhood-name={area.name}
          aria-hidden="true"
        >
          {area.width >= 72 && area.height >= 25 ? <span>{area.name}</span> : null}
        </div>
      ))}
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
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setShowNeighborhoodBounds((value) => !value)}
          aria-label={showNeighborhoodBounds ? "پنهان کردن محدوده محله‌ها" : "نمایش محدوده محله‌ها"}
          aria-pressed={showNeighborhoodBounds}
          title={showNeighborhoodBounds ? "پنهان کردن کادر محله‌ها" : "نمایش کادر محله‌ها"}
          className={showNeighborhoodBounds ? "is-active" : ""}
        ><MapPinned size={17} /></button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetMap} aria-label="بازگشت به نمای اصفهان یا محله انتخاب‌شده"><LocateFixed size={18} /></button>
      </div>
      {showNeighborhoodBounds ? <div className="pf-map-bounds-note">کادر محله‌ها تقریبی است، نه مرز رسمی ثبتی</div> : null}
      <div className="pf-map-attribution">
        نقشه © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </div>
    </div>
  );
}
