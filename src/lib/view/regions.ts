// "go to" seas and oceans for the Place tab: a camera per region (centre and zoom), chosen so
// the region fills a laptop-sized map. They move the map only; what loads is still decided by the
// viewport (planView), so a region never changes the bytes rule. A sea or ocean has no gazetteer
// feature, so choosing one clears the outlined place. Gazetteer places (sanctuaries, leases, lines,
// cables, undersea features ...) are not listed here: the picker reads them from the gazetteer index
// (src/lib/places/index.ts), and a pre-0.7.0 link `pl=NMS:MBNMS` resolves through it.
export interface Region {
  id: string;
  label: string;
  group: string;
  lon: number;
  lat: number;
  zoom: number;
}

/** the picker group of the camera presets */
export const SEAS_GROUP = "Seas & oceans";

export const REGIONS: Region[] = [
  { id: "world", label: "Whole world", group: SEAS_GROUP, lon: -20, lat: 5, zoom: 1.4 },
  { id: "pacific", label: "Pacific Ocean", group: SEAS_GROUP, lon: -160, lat: 5, zoom: 1.8 },
  { id: "atlantic", label: "Atlantic Ocean", group: SEAS_GROUP, lon: -35, lat: 15, zoom: 1.9 },
  { id: "indian", label: "Indian Ocean", group: SEAS_GROUP, lon: 75, lat: -15, zoom: 2.2 },
  { id: "southern", label: "Southern Ocean", group: SEAS_GROUP, lon: 0, lat: -62, zoom: 1.6 },
  { id: "arctic", label: "Arctic Ocean", group: SEAS_GROUP, lon: 0, lat: 78, zoom: 2.2 },
  { id: "caribbean", label: "Caribbean Sea", group: SEAS_GROUP, lon: -75, lat: 16, zoom: 4.2 },
  { id: "gulf-maine", label: "Gulf of Maine", group: SEAS_GROUP, lon: -68.5, lat: 42.8, zoom: 6.2 },
  { id: "north-sea", label: "North Sea", group: SEAS_GROUP, lon: 3, lat: 56, zoom: 4.8 },
  { id: "mediterranean", label: "Mediterranean Sea", group: SEAS_GROUP, lon: 18, lat: 38, zoom: 3.9 },
  { id: "gbr", label: "Great Barrier Reef", group: SEAS_GROUP, lon: 150, lat: -18, zoom: 4.6 },
  { id: "coral-triangle", label: "Coral Triangle", group: SEAS_GROUP, lon: 125, lat: 0, zoom: 4 },
  { id: "benguela", label: "Benguela Current", group: SEAS_GROUP, lon: 14, lat: -27, zoom: 4.6 },
];
