/**
 * Verified point locations for neighborhood pages.
 *
 * Important: Divar's public district-list schema provides district display names
 * and slugs, not neighborhood polygons. Keep a point here only when a separate
 * map source can verify it. Do not infer or fabricate boundary polygons.
 */
export type AreaGeography = {
  lat: number;
  lng: number;
  zoom: number;
  source: "OpenStreetMap";
  sourceUrl: string;
  precision: "reference-point";
  boundaryStatus: "not-published";
};

const AREA_GEOGRAPHY: Record<string, AreaGeography> = {
  // Shahrak-e Vali-ye Asr, Isfahan. OpenStreetMap node 4414536430.
  // This is a mapped neighborhood reference point, not a polygon boundary.
  "شهرک-ولیعصر": {
    lat: 32.73888,
    lng: 51.66175,
    zoom: 14,
    source: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org/node/4414536430",
    precision: "reference-point",
    boundaryStatus: "not-published",
  },
};

export function getAreaGeography(slug: string): AreaGeography | null {
  return AREA_GEOGRAPHY[slug] ?? null;
}
