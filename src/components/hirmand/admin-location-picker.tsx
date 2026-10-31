import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ExternalLink, LocateFixed, MapPin, MapPinned, Minus, Plus, RotateCcw, Save } from "lucide-react";
import { NEIGHBORHOOD_GROUPS, SITE } from "@/lib/site";

type Coordinates = {
  latitude: number | null;
  longitude: number | null;
};

type AdminLocationPickerProps = Coordinates & {
  neighborhood: string;
  onChange: (coordinates: Coordinates) => void;
};

const LOCATION_PICKER_CSS = `
.admin-location{position:relative;z-index:0;isolation:isolate;display:flex;flex-direction:column;gap:18px;min-width:0;color:var(--fg)}
.admin-location-panel{position:relative;z-index:0;isolation:isolate;display:grid;grid-template-columns:minmax(0,.94fr) minmax(0,1.06fr);gap:18px;align-items:stretch;min-width:0}
.admin-location-controls{display:flex;flex-direction:column;gap:14px;min-width:0}
.admin-location-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:17px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(145deg,var(--card) 0%,var(--card-2) 100%);box-shadow:0 8px 24px rgb(24 29 36 / 4%)}
.admin-location-title{display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1 1 220px}
.admin-location-title>svg{margin-top:2px;color:var(--brass-700);flex:0 0 auto;padding:7px;box-sizing:content-box;border:1px solid rgb(192 138 42 / 20%);border-radius:12px;background:var(--brass-100)}
.admin-location-title strong{display:block;font-size:.98rem;color:var(--fg);letter-spacing:-.025em;line-height:1.8}
.admin-location-title small{display:block;margin-top:4px;color:var(--muted);font-size:.77rem;line-height:1.95}
.admin-location-title small b{color:var(--fg);font-weight:850}
.admin-location-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.admin-location-actions button,.admin-location-actions a{min-height:39px;padding:8px 12px;border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--fg);font:inherit;font-size:.75rem;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease}
.admin-location-actions button:hover:not(:disabled),.admin-location-actions a:hover{border-color:var(--brass-300);background:var(--brass-100);transform:translateY(-1px);box-shadow:0 5px 14px rgb(26 31 38 / 7%)}
.admin-location-actions button:focus-visible,.admin-location-actions a:focus-visible{outline:3px solid rgb(192 138 42 / 22%);outline-offset:2px}
.admin-location-actions button:disabled{opacity:.48;cursor:not-allowed;background:var(--card-2);box-shadow:none;transform:none}
.admin-location-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.admin-location-field{display:flex;flex-direction:column;gap:8px;min-width:0;padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--card-2);box-shadow:0 3px 12px rgb(24 29 36 / 2%)}
.admin-location-field>span{color:var(--muted);font-size:.75rem;font-weight:850;line-height:1.7}
.admin-location-field>small{color:var(--subtle);font-size:.68rem;line-height:1.8}
.admin-location-field input{box-sizing:border-box;width:100%;min-width:0;min-height:48px;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card);color:var(--fg);outline:none;font:inherit;font-size:.92rem;direction:ltr;text-align:left;font-variant-numeric:tabular-nums;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
.admin-location-field input::placeholder{color:var(--subtle);opacity:.78}
.admin-location-field input:focus{border-color:var(--brass-600);box-shadow:0 0 0 4px rgb(192 138 42 / 12%);background:var(--paper)}
.admin-location-field input[aria-invalid="true"]{border-color:#c55b50;background:#fffafa;box-shadow:0 0 0 3px rgb(197 91 80 / 10%)}
.admin-location-validation{display:flex;align-items:center;gap:7px;min-height:18px;color:var(--subtle);font-size:.69rem;line-height:1.65}
.admin-location-validation.is-ok{color:#46735a}
.admin-location-validation.is-error{color:#a34c45}
.admin-location-status{display:flex;align-items:flex-start;gap:10px;margin:0;padding:13px 14px;border:1px solid rgb(192 138 42 / 23%);border-radius:14px;background:linear-gradient(135deg,var(--brass-100),var(--card) 90%);color:var(--brass-800);font-size:.76rem;line-height:1.95}
.admin-location-status-dot{width:8px;height:8px;border-radius:999px;background:var(--brass-600);margin-top:8px;flex:0 0 auto;box-shadow:0 0 0 4px rgb(192 138 42 / 12%)}
.admin-location-save-actions{padding:13px 14px;border:1px solid var(--line);border-radius:15px;background:var(--card-2)}
.admin-location-actions .admin-location-register{min-height:44px;padding:10px 16px;border-color:#172f46;background:#172f46;color:#fff;box-shadow:0 5px 13px rgb(23 47 70 / 14%)}
.admin-location-actions .admin-location-register:hover:not(:disabled){border-color:#234a68;background:#234a68;color:#fff;box-shadow:0 8px 18px rgb(23 47 70 / 20%)}
.admin-location-actions .admin-location-register:disabled{background:var(--card-2);border-color:var(--line);color:var(--muted);box-shadow:none}
.admin-location-save-actions>small{display:block;flex:1 1 170px;min-width:0;color:var(--muted);font-size:.69rem;line-height:1.9}
.admin-location-map-shell{position:relative;z-index:0;isolation:isolate;display:flex;flex-direction:column;min-width:0;min-height:100%;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:var(--paper-2);box-shadow:0 10px 30px rgb(24 29 36 / 8%)}
.admin-location-map-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);background:linear-gradient(145deg,var(--card),var(--card-2))}
.admin-location-map-head strong{color:var(--fg);font-size:.81rem;font-weight:900;letter-spacing:-.01em}
.admin-location-map-head span{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid rgb(192 138 42 / 24%);background:var(--brass-100);color:var(--brass-800);font-size:.66rem;font-weight:850;white-space:nowrap}
.admin-location-map{position:relative;z-index:0;isolation:isolate;contain:layout paint;min-width:0;min-height:440px;height:clamp(390px,48vw,560px);overflow:hidden;background:#e9e8e2;touch-action:pan-y}
.admin-location-map-canvas{position:absolute;inset:0;z-index:0;isolation:isolate;contain:layout paint;overflow:hidden;background-color:#e9e8e2;background-image:radial-gradient(ellipse at 50% 50%,rgb(255 255 255 / 18%),transparent 70%);cursor:crosshair;touch-action:none;user-select:none}
.admin-location-map-canvas.is-dragging{cursor:grabbing}
.admin-location-map-tiles{position:absolute;inset:0;pointer-events:none}
.admin-location-map-tile{position:absolute;width:256px!important;height:256px!important;max-width:none!important;object-fit:cover;pointer-events:none;user-select:none;-webkit-user-drag:none}
.admin-location-map-wash{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgb(255 253 248 / 0%),rgb(241 234 224 / 2%))}
.admin-location-map-marker{position:absolute;z-index:5;display:grid;place-items:center;width:46px;height:46px;padding:0;border:3px solid #fff;border-radius:50% 50% 50% 12px;background:#18344c;color:#fff;box-shadow:0 0 0 7px rgb(24 52 76 / 12%),0 9px 22px rgb(11 26 43 / 34%);transform:translate(-50%,-50%) rotate(-45deg);cursor:grab;touch-action:none;transition:box-shadow .18s ease,background .18s ease}
.admin-location-map-marker svg{color:#f2cd79;pointer-events:none;transform:rotate(45deg)}
.admin-location-map-marker:hover{background:#234a68;box-shadow:0 0 0 9px rgb(24 52 76 / 13%),0 12px 26px rgb(11 26 43 / 38%)}
.admin-location-map-marker:active{cursor:grabbing}
.admin-location-map-marker:focus-visible{outline:3px solid rgb(192 138 42 / 65%);outline-offset:5px}
.admin-location-map-help{position:absolute;z-index:4;left:12px;right:auto;bottom:12px;display:flex;align-items:center;justify-content:flex-start;gap:8px;max-width:calc(100% - 112px);padding:9px 12px;border:1px solid rgb(11 26 43 / 12%);border-radius:12px;background:rgb(255 255 255 / 95%);color:#354558;font-size:.71rem;font-weight:650;line-height:1.8;text-align:left;pointer-events:none;box-shadow:0 5px 18px rgb(11 26 43 / 12%);backdrop-filter:blur(8px)}
.admin-location-map-help svg{flex:0 0 auto;color:#8c641e}
.admin-location-map-controls{position:absolute;z-index:6;top:12px;inset-inline-start:12px;display:grid;gap:6px;padding:5px;border:1px solid rgb(11 26 43 / 10%);border-radius:14px;background:rgb(255 255 255 / 90%);box-shadow:0 5px 18px rgb(11 26 43 / 12%);backdrop-filter:blur(8px)}
.admin-location-map-controls button{display:grid;place-items:center;width:38px;height:38px;padding:0;border:1px solid transparent;border-radius:10px;background:#fff;color:#172f46;box-shadow:0 1px 4px rgb(11 26 43 / 7%);cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease}
.admin-location-map-controls button:hover{background:#fbf2dc;border-color:#d8b66d;transform:translateY(-1px)}
.admin-location-map-controls button:focus-visible{outline:3px solid rgb(192 138 42 / 35%);outline-offset:2px}
.admin-location-map-attribution{position:absolute;z-index:7;right:6px;bottom:6px;padding:4px 6px;border:1px solid rgb(11 26 43 / 8%);border-radius:6px;background:rgb(255 255 255 / 92%);color:#536070;font-size:.61rem;direction:ltr;box-shadow:0 2px 8px rgb(11 26 43 / 8%)}
.admin-location-map-attribution a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.admin-location-map-offline{position:absolute;z-index:4;top:50%;left:68px;right:68px;transform:translateY(-50%);padding:15px 16px;border:1px solid #e7ddc5;border-radius:14px;background:rgb(255 255 255 / 96%);color:#445163;font-size:.75rem;line-height:1.9;text-align:center;pointer-events:none;box-shadow:0 8px 24px rgb(11 26 43 / 10%)}
.admin-location-map-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 15px;border-top:1px solid var(--line);background:var(--card-2);color:var(--subtle);font-size:.69rem;line-height:1.85}
.admin-location-map-foot strong{color:var(--fg);font-weight:850}
.admin-location-foot{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;color:var(--subtle);font-size:.71rem;line-height:1.9;padding:0 2px}
.admin-location-foot strong{color:var(--fg)}
.admin-location-coordinates{display:inline-flex;align-items:center;direction:ltr;unicode-bidi:plaintext;padding:5px 9px;border:1px solid var(--line);border-radius:9px;background:var(--card-2);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:.7rem}
@media (max-width:1100px){
  .admin-location-panel{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:13px}
  .admin-location-head{padding:14px}
  .admin-location-map{height:clamp(360px,43vw,470px);min-height:360px}
  .admin-location-grid{grid-template-columns:1fr}
}
@media (max-width:850px){
  .admin-location-panel{grid-template-columns:minmax(0,1fr)}
  .admin-location-map-shell{order:-1}
  .admin-location-controls{order:0}
  .admin-location-map{height:clamp(320px,62vw,440px);min-height:320px}
  .admin-location-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:560px){
  .admin-location{gap:13px}
  .admin-location-panel{gap:13px}
  .admin-location-head{padding:13px;border-radius:15px}
  .admin-location-title{flex-basis:100%}
  .admin-location-actions{width:100%;gap:7px}
  .admin-location-actions button,.admin-location-actions a{flex:1 1 auto;min-width:0;padding-inline:9px;font-size:.71rem}
  .admin-location-grid{grid-template-columns:minmax(0,1fr);gap:9px}
  .admin-location-field{padding:12px;border-radius:13px}
  .admin-location-save-actions{padding:11px}
  .admin-location-actions .admin-location-register{flex:1 1 100%}
  .admin-location-map-shell{border-radius:16px}
  .admin-location-map-head{padding:12px}
  .admin-location-map-head strong{font-size:.75rem}
  .admin-location-map-head span{font-size:.61rem;padding:4px 7px}
  .admin-location-map{height:340px;min-height:340px}
  .admin-location-map-marker{width:42px;height:42px}
  .admin-location-map-help{left:8px;right:auto;bottom:8px;max-width:calc(100% - 98px);padding:7px 9px;font-size:.64rem;line-height:1.75}
  .admin-location-map-controls{top:8px;inset-inline-start:8px;gap:5px;padding:4px}
  .admin-location-map-controls button{width:35px;height:35px}
  .admin-location-map-offline{left:55px;right:55px;padding:11px;font-size:.69rem}
  .admin-location-map-foot{padding:10px 11px;font-size:.66rem}
  .admin-location-foot{font-size:.68rem}
}
@media (prefers-reduced-motion:reduce){
  .admin-location-actions button,.admin-location-actions a,.admin-location-field input,.admin-location-map-marker,.admin-location-map-controls button{transition:none}
}
`;

function toEnglishDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function parseCoordinate(value: string, min: number, max: number) {
  const normalized = toEnglishDigits(value).trim().replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

type AdminMapView = { latitude: number; longitude: number; zoom: number };
type AdminMapPoint = { x: number; y: number };
type AdminMapTile = { key: string; url: string; left: number; top: number };
type AdminMapSize = { width: number; height: number };
type AdminMapDrag = { mode: "map" | "marker"; x: number; y: number; pointerId: number; moved: boolean };
const ADMIN_MAP_TILE_SIZE = 256;
const ADMIN_MAP_DEFAULT: AdminMapView = { latitude: 32.6546, longitude: 51.668, zoom: 14 };

function projectAdminMap(latitude: number, longitude: number, zoom: number): AdminMapPoint {
  const scale = ADMIN_MAP_TILE_SIZE * 2 ** zoom;
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function unprojectAdminMap(point: AdminMapPoint, zoom: number): Pick<AdminMapView, "latitude" | "longitude"> {
  const scale = ADMIN_MAP_TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  return {
    longitude: Math.max(-180, Math.min(180, (point.x / scale) * 360 - 180)),
    latitude: Math.max(-85.05112878, Math.min(85.05112878, (180 / Math.PI) * Math.atan(Math.sinh(n)))),
  };
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function AdminLocationPicker({
  latitude,
  longitude,
  neighborhood,
  onChange,
}: AdminLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<AdminMapDrag | null>(null);
  const suppressMapClick = useRef(false);
  const [latitudeText, setLatitudeText] = useState(latitude == null ? "" : String(latitude));
  const [longitudeText, setLongitudeText] = useState(longitude == null ? "" : String(longitude));
  const [view, setView] = useState<AdminMapView>({
    latitude: latitude ?? ADMIN_MAP_DEFAULT.latitude,
    longitude: longitude ?? ADMIN_MAP_DEFAULT.longitude,
    zoom: ADMIN_MAP_DEFAULT.zoom,
  });
  const [size, setSize] = useState<AdminMapSize>({ width: 760, height: 330 });
  const [dragOffset, setDragOffset] = useState<AdminMapPoint>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [failedTiles, setFailedTiles] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setLatitudeText(latitude == null ? "" : String(latitude));
    setLongitudeText(longitude == null ? "" : String(longitude));
    if (latitude != null && longitude != null) {
      setView((current) => ({ ...current, latitude, longitude, zoom: Math.max(14, current.zoom) }));
    }
  }, [latitude, longitude]);

  const suggested = useMemo(() => {
    const normalized = neighborhood.trim();
    if (!normalized) return null;
    for (const group of NEIGHBORHOOD_GROUPS) {
      const found = group.items.find((item) => item.name === normalized);
      if (found) return found;
    }
    return null;
  }, [neighborhood]);

  const latitudeDraft = parseCoordinate(latitudeText, -90, 90);
  const longitudeDraft = parseCoordinate(longitudeText, -180, 180);
  const latitudeValid = latitudeText.trim() === "" || latitudeDraft != null;
  const longitudeValid = longitudeText.trim() === "" || longitudeDraft != null;
  const bothBlank = latitudeText.trim() === "" && longitudeText.trim() === "";
  const bothCoordinatesValid = latitudeText.trim() !== "" && longitudeText.trim() !== "" && latitudeDraft != null && longitudeDraft != null;
  const draftPairValid = bothCoordinatesValid || bothBlank;
  const hasCustomLocation = latitude != null && longitude != null;
  const draftMatchesForm = draftPairValid &&
    (bothBlank ? latitude == null && longitude == null : latitudeDraft === latitude && longitudeDraft === longitude);
  const hasPendingChanges = !draftMatchesForm && draftPairValid;
  const canRegister = draftPairValid && hasPendingChanges;
  const markerLatitude = latitudeDraft ?? suggested?.lat ?? view.latitude;
  const markerLongitude = longitudeDraft ?? suggested?.lng ?? view.longitude;

  useEffect(() => {
    setView((current) => ({
      ...current,
      latitude: latitudeDraft ?? suggested?.lat ?? current.latitude,
      longitude: longitudeDraft ?? suggested?.lng ?? current.longitude,
    }));
    // The neighborhood default only moves the map when there is no custom point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighborhood, suggested?.lat, suggested?.lng]);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.max(300, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) });
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

  const centerWorld = useMemo(() => projectAdminMap(view.latitude, view.longitude, view.zoom), [view.latitude, view.longitude, view.zoom]);
  const visualCenter = { x: centerWorld.x - dragOffset.x, y: centerWorld.y - dragOffset.y };
  const worldLeft = visualCenter.x - size.width / 2;
  const worldTop = visualCenter.y - size.height / 2;

  const markerPoint = useMemo(() => {
    const point = projectAdminMap(markerLatitude, markerLongitude, view.zoom);
    return { x: point.x - worldLeft, y: point.y - worldTop };
  }, [markerLatitude, markerLongitude, view.zoom, worldLeft, worldTop]);

  const tiles = useMemo<AdminMapTile[]>(() => {
    const totalTiles = 2 ** view.zoom;
    const startX = Math.floor(worldLeft / ADMIN_MAP_TILE_SIZE);
    const endX = Math.floor((worldLeft + size.width) / ADMIN_MAP_TILE_SIZE);
    const startY = Math.floor(worldTop / ADMIN_MAP_TILE_SIZE);
    const endY = Math.floor((worldTop + size.height) / ADMIN_MAP_TILE_SIZE);
    const result: AdminMapTile[] = [];
    for (let rawY = startY; rawY <= endY; rawY += 1) {
      if (rawY < 0 || rawY >= totalTiles) continue;
      for (let rawX = startX; rawX <= endX; rawX += 1) {
        const x = ((rawX % totalTiles) + totalTiles) % totalTiles;
        result.push({
          key: `${view.zoom}/${x}/${rawY}`,
          url: `https://tile.openstreetmap.org/${view.zoom}/${x}/${rawY}.png`,
          left: rawX * ADMIN_MAP_TILE_SIZE - worldLeft,
          top: rawY * ADMIN_MAP_TILE_SIZE - worldTop,
        });
      }
    }
    return result;
  }, [view.zoom, worldLeft, worldTop, size.width, size.height]);

  useEffect(() => {
    setFailedTiles(new Set());
  }, [view.latitude, view.longitude, view.zoom]);

  const coordinateAtPointer = useCallback((clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const point = unprojectAdminMap({
      x: clientX - rect.left + worldLeft,
      y: clientY - rect.top + worldTop,
    }, view.zoom);
    if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return null;
    return point;
  }, [view.zoom, worldLeft, worldTop]);

  const setDraftCoordinates = useCallback((lat: number, lng: number) => {
    setLatitudeText(formatCoordinate(lat));
    setLongitudeText(formatCoordinate(lng));
  }, []);

  const onMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
    dragOrigin.current = { mode: "map", x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
    setDragOffset({ x: 0, y: 0 });
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onMapPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) origin.moved = true;
    if (origin.mode === "map") {
      setDragOffset({ x: deltaX, y: deltaY });
      return;
    }
    const point = coordinateAtPointer(event.clientX, event.clientY);
    if (point) setDraftCoordinates(point.latitude, point.longitude);
  }, [coordinateAtPointer, setDraftCoordinates]);

  const onMapPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    dragOrigin.current = null;
    setDragging(false);
    if (origin.mode === "map") {
      if (origin.moved) {
        const nextCenter = unprojectAdminMap({ x: centerWorld.x - deltaX, y: centerWorld.y - deltaY }, view.zoom);
        setView((current) => ({ ...current, ...nextCenter }));
        suppressMapClick.current = true;
      }
      setDragOffset({ x: 0, y: 0 });
    } else if (origin.moved) {
      suppressMapClick.current = true;
    }
  }, [centerWorld.x, centerWorld.y, view.zoom]);

  const startMarkerDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragOrigin.current = { mode: "marker", x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
    setDragging(true);
    mapRef.current?.setPointerCapture(event.pointerId);
  }, []);

  const onMapClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressMapClick.current) {
      suppressMapClick.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest("button, a")) return;
    const point = coordinateAtPointer(event.clientX, event.clientY);
    if (!point) return;
    setDraftCoordinates(point.latitude, point.longitude);
  }, [coordinateAtPointer, setDraftCoordinates]);

  const zoomBy = useCallback((amount: number) => {
    setView((current) => ({
      ...current,
      zoom: Math.max(10, Math.min(18, current.zoom + amount)),
    }));
  }, []);

  function useNeighborhoodCenter() {
    if (!suggested) return;
    setDraftCoordinates(suggested.lat ?? ADMIN_MAP_DEFAULT.latitude, suggested.lng ?? ADMIN_MAP_DEFAULT.longitude);
    setView((current) => ({
      ...current,
      latitude: suggested.lat ?? ADMIN_MAP_DEFAULT.latitude,
      longitude: suggested.lng ?? ADMIN_MAP_DEFAULT.longitude,
      zoom: Math.max(14, current.zoom),
    }));
  }

  function clearLocationDraft() {
    setLatitudeText("");
    setLongitudeText("");
  }

  function registerLocation() {
    if (!canRegister) return;
    onChange({
      latitude: bothBlank ? null : latitudeDraft,
      longitude: bothBlank ? null : longitudeDraft,
    });
  }

  function resetMapView() {
    const nextLatitude = latitudeDraft ?? suggested?.lat ?? ADMIN_MAP_DEFAULT.latitude;
    const nextLongitude = longitudeDraft ?? suggested?.lng ?? ADMIN_MAP_DEFAULT.longitude;
    setView((current) => ({ ...current, latitude: nextLatitude, longitude: nextLongitude }));
  }

  return (
    <div className="admin-location">
      <style>{LOCATION_PICKER_CSS}</style>

      <div className="admin-location-panel">
        <div className="admin-location-controls">
          <div className="admin-location-head">
            <div className="admin-location-title">
              <MapPinned size={19} aria-hidden="true" />
              <div>
                <strong>موقعیت تقریبی روی نقشه</strong>
                <small>
                  این نقطه فقط برای نمایش محدوده فایل استفاده می‌شود و
                  <b> آدرس دقیق شما را عمومی نمی‌کند.</b>
                </small>
              </div>
            </div>

            <div className="admin-location-actions">
              {suggested ? (
                <button type="button" onClick={useNeighborhoodCenter}>
                  <LocateFixed size={15} aria-hidden="true" />
                  مرکز محله
                </button>
              ) : null}
              <button type="button" onClick={clearLocationDraft} disabled={bothBlank && latitude == null && longitude == null}>
                <RotateCcw size={15} aria-hidden="true" />
                پاک کردن
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${markerLatitude},${markerLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
                باز کردن نقشه
              </a>
            </div>
          </div>

          <div className="admin-location-grid">
            <label className="admin-location-field">
              <span>عرض جغرافیایی (Latitude)</span>
              <input
                inputMode="decimal"
                value={latitudeText}
                onChange={(event) => setLatitudeText(event.target.value)}
                placeholder={suggested?.lat != null ? String(suggested.lat) : "32.6546"}
                aria-label="عرض جغرافیایی موقعیت تقریبی"
                aria-invalid={!latitudeValid}
              />
              <small>مختصات با کلیک روی نقشه یا کشیدن نشانگر به‌روزرسانی می‌شود.</small>
              <span className={`admin-location-validation ${latitudeValid ? "is-ok" : "is-error"}`} aria-live="polite">
                {latitudeValid ? "فرمت مختصات معتبر است" : "عدد واردشده برای عرض جغرافیایی معتبر نیست"}
              </span>
            </label>

            <label className="admin-location-field">
              <span>طول جغرافیایی (Longitude)</span>
              <input
                inputMode="decimal"
                value={longitudeText}
                onChange={(event) => setLongitudeText(event.target.value)}
                placeholder={suggested?.lng != null ? String(suggested.lng) : "51.6680"}
                aria-label="طول جغرافیایی موقعیت تقریبی"
                aria-invalid={!longitudeValid}
              />
              <small>پس از انتخاب نقطه، روی «ثبت موقعیت» بزن.</small>
              <span className={`admin-location-validation ${longitudeValid ? "is-ok" : "is-error"}`} aria-live="polite">
                {longitudeValid ? "فرمت مختصات معتبر است" : "عدد واردشده برای طول جغرافیایی معتبر نیست"}
              </span>
            </label>
          </div>

          <p className="admin-location-status" role="status">
            <span className="admin-location-status-dot" aria-hidden="true" />
            <span>
              {!draftPairValid
                ? "برای ثبت موقعیت، هر دو مختصات را کامل و معتبر وارد کن."
                : hasPendingChanges
                  ? bothBlank
                    ? "حذف موقعیت آماده ثبت است؛ برای اعمال آن در فرم، «ثبت موقعیت» را بزن."
                    : "نقطه انتخاب شده اما هنوز در فرم ثبت نشده است؛ برای تأیید، «ثبت موقعیت» را بزن."
                  : hasCustomLocation
                    ? "موقعیت اختصاصی در فرم ثبت شده است و در سایت عمومی به‌صورت تقریبی نمایش داده می‌شود."
                    : suggested
                      ? `هنوز موقعیت اختصاصی ثبت نشده؛ مرکز «${neighborhood}» فقط پیش‌نمایش است تا نقطه‌ای انتخاب و ثبت شود.`
                      : "هنوز موقعیت اختصاصی ثبت نشده؛ نقطه فعلی روی نقشه فقط پیش‌نمایش است."}
            </span>
          </p>
          <div className="admin-location-actions admin-location-save-actions">
            <button type="button" onClick={registerLocation} disabled={!canRegister} className="admin-location-register">
              <Save size={15} aria-hidden="true" />
              ثبت موقعیت در فرم
            </button>
            <small>برای ذخیره نهایی اطلاعات در سامانه، پس از آن دکمهٔ اصلی ذخیرهٔ فایل را هم بزن.</small>
          </div>
        </div>

        <div className="admin-location-map-shell">
          <div className="admin-location-map-head">
            <strong>انتخاب موقعیت روی نقشه</strong>
            <span>{hasPendingChanges ? "موقعیت ثبت‌نشده" : hasCustomLocation ? "مختصات فرم" : "پیش‌نمایش تقریبی"}</span>
          </div>
          <div
            className={`admin-location-map-canvas${dragging ? " is-dragging" : ""}`}
            ref={mapRef}
            role="application"
            aria-label="نقشه انتخاب موقعیت؛ برای انتخاب روی نقشه کلیک کنید یا نشانگر را بکشید"
            onPointerDown={onMapPointerDown}
            onPointerMove={onMapPointerMove}
            onPointerUp={onMapPointerUp}
            onPointerCancel={onMapPointerUp}
            onClick={onMapClick}
            onDragStart={(event) => event.preventDefault()}
          >
            <div className="admin-location-map-tiles" aria-hidden="true">
              {tiles.map((tile) => (
                <img
                  key={tile.key}
                  className="admin-location-map-tile"
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
            <div className="admin-location-map-wash" aria-hidden="true" />
            <button
              type="button"
              className="admin-location-map-marker"
              style={{ left: markerPoint.x, top: markerPoint.y }}
              aria-label="نشانگر موقعیت؛ با کلیدهای جهت‌دار جابه‌جا کنید یا آن را بکشید"
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
              title="با کلیدهای جهت‌دار جابه‌جا کنید؛ با Shift حرکت دقیق‌تر است"
              onPointerDown={startMarkerDrag}
              onKeyDown={(event) => {
                if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const step = event.shiftKey ? 0.001 : 0.0001;
                const lat = markerLatitude;
                const lng = markerLongitude;
                setDraftCoordinates(
                  Math.max(-90, Math.min(90, lat + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))),
                  Math.max(-180, Math.min(180, lng + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))),
                );
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <MapPin size={22} aria-hidden="true" />
            </button>
            <div className="admin-location-map-controls" aria-label="کنترل نقشه">
              <button type="button" onClick={() => zoomBy(1)} aria-label="بزرگ‌نمایی"><Plus size={17} /></button>
              <button type="button" onClick={() => zoomBy(-1)} aria-label="کوچک‌نمایی"><Minus size={17} /></button>
              <button type="button" onClick={resetMapView} aria-label="مرکز کردن نقشه روی موقعیت انتخاب‌شده"><LocateFixed size={17} /></button>
            </div>
            {failedTiles.size >= 4 ? (
              <div className="admin-location-map-offline" role="status">
                نقشه پایه بارگذاری نشده است؛ می‌توانی روی این محدوده کلیک کنی، اما برای دیدن خیابان‌ها اتصال نقشه لازم است.
              </div>
            ) : null}
            <div className="admin-location-map-help"><MapPin size={15} aria-hidden="true" /> روی نقطهٔ موردنظر کلیک کن، نشانگر را بکش یا پس از انتخاب آن با کلیدهای جهت‌دار جابه‌جایش کن؛ سپس موقعیت را ثبت کن.</div>
            <div className="admin-location-map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></div>
          </div>
          <div className="admin-location-map-foot">
            <span>نقطه روی نقشه تا زمان زدن «ثبت موقعیت» فقط پیش‌نویس است.</span>
            <strong>{bothCoordinatesValid ? "مختصات معتبر" : bothBlank ? "مختصات انتخاب نشده" : "در انتظار دو مختصات معتبر"}</strong>
          </div>
        </div>
      </div>

      <div className="admin-location-foot">
        <span>
          <strong>حریم خصوصی:</strong> نقطه را روی محدوده نزدیک ملک بگذار، نه روی پلاک یا ورودی دقیق ساختمان.
        </span>
        {bothCoordinatesValid ? (
          <span className="admin-location-coordinates">{formatCoordinate(latitudeDraft!)} · {formatCoordinate(longitudeDraft!)}</span>
        ) : hasCustomLocation ? (
          <span className="admin-location-coordinates">{latitude} · {longitude}</span>
        ) : null}
      </div>
    </div>
  );
}
