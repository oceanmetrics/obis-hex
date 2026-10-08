// "go to" places for the Place & scale tab: a camera per region (centre and zoom), chosen so the
// region fills a laptop-sized map. They move the map only; what loads is still decided by the
// viewport (planView), so a region never changes the bytes rule.
//
// A region with a `place_id` is also a place of the Ocean Metrics gazetteer (places.pmtiles): choosing
// it outlines the polygon on the map (0.5.2). Its `bbox` (from the gazetteer's places.parquet) is what
// the map fits to, so the whole outline is in view; PMNM spans the antimeridian, so it has none and
// keeps its camera. Seas and oceans have no gazetteer feature and no place_id.
export interface Region {
  id: string;
  label: string;
  group: string;
  lon: number;
  lat: number;
  zoom: number;
  /** gazetteer place id (`NMS:<code>`, `MRGID:<n>`, `PSGID:<n>`): the polygon to outline */
  place_id?: string;
  /** the gazetteer polygon's bounds [west, south, east, north], for fitBounds */
  bbox?: [number, number, number, number];
}

export const REGIONS: Region[] = [
  { id: "world", label: "Whole world", group: "World", lon: -20, lat: 5, zoom: 1.4 },
  { id: "pacific", label: "Pacific Ocean", group: "Oceans", lon: -160, lat: 5, zoom: 1.8 },
  { id: "atlantic", label: "Atlantic Ocean", group: "Oceans", lon: -35, lat: 15, zoom: 1.9 },
  { id: "indian", label: "Indian Ocean", group: "Oceans", lon: 75, lat: -15, zoom: 2.2 },
  { id: "southern", label: "Southern Ocean", group: "Oceans", lon: 0, lat: -62, zoom: 1.6 },
  { id: "arctic", label: "Arctic Ocean", group: "Oceans", lon: 0, lat: 78, zoom: 2.2 },
  { id: "mbnms", label: "Monterey Bay", group: "Sanctuaries and seas", lon: -122.12, lat: 36.69, zoom: 6.6, place_id: "NMS:MBNMS", bbox: [-123.14, 35.5, -121.104, 37.882] },
  { id: "fknms", label: "Florida Keys", group: "Sanctuaries and seas", lon: -81.61, lat: 24.98, zoom: 7, place_id: "NMS:FKNMS", bbox: [-83.15, 24.3, -80.066, 25.65] },
  { id: "pmnm", label: "Papahānaumokuākea", group: "Sanctuaries and seas", lon: -168, lat: 25.5, zoom: 4.8, place_id: "NMS:PMNM" },
  { id: "nmsas", label: "American Samoa", group: "Sanctuaries and seas", lon: -169.21, lat: -13.19, zoom: 6.0, place_id: "NMS:NMSAS", bbox: [-171.141, -15.386, -167.284, -10.998] },
  { id: "fgbnms", label: "Flower Garden Banks", group: "Sanctuaries and seas", lon: -93.14, lat: 28.07, zoom: 7.4, place_id: "NMS:FGBNMS", bbox: [-94.309, 27.784, -91.973, 28.355] },
  { id: "hihwnms", label: "Hawaiian Islands Humpback Whale", group: "Sanctuaries and seas", lon: -157.71, lat: 21.01, zoom: 6.7, place_id: "NMS:HIHWNMS", bbox: [-159.6, 19.728, -155.822, 22.285] },
  { id: "ocnms", label: "Olympic Coast", group: "Sanctuaries and seas", lon: -124.93, lat: 47.82, zoom: 7.1, place_id: "NMS:OCNMS", bbox: [-125.682, 47.129, -124.184, 48.506] },
  { id: "cbnms", label: "Cordell Bank", group: "Sanctuaries and seas", lon: -123.54, lat: 38.03, zoom: 8.7, place_id: "NMS:CBNMS", bbox: [-124.0, 37.767, -123.082, 38.3] },
  { id: "gfnms", label: "Greater Farallones", group: "Sanctuaries and seas", lon: -123.48, lat: 38.25, zoom: 7.2, place_id: "NMS:GFNMS", bbox: [-124.334, 37.494, -122.628, 39.0] },
  { id: "chnms", label: "Chumash Heritage", group: "Sanctuaries and seas", lon: -120.82, lat: 34.51, zoom: 7.4, place_id: "NMS:CHNMS", bbox: [-121.705, 33.824, -119.933, 35.193] },
  { id: "cinms", label: "Channel Islands", group: "Sanctuaries and seas", lon: -119.77, lat: 33.78, zoom: 7.8, place_id: "NMS:CINMS", bbox: [-120.642, 33.362, -118.907, 34.207] },
  { id: "grnms", label: "Gray’s Reef", group: "Sanctuaries and seas", lon: -80.87, lat: 31.39, zoom: 10, place_id: "NMS:GRNMS", bbox: [-80.921, 31.363, -80.828, 31.421] },
  { id: "mbpr", label: "Mallows Bay–Potomac River", group: "Sanctuaries and seas", lon: -77.29, lat: 38.44, zoom: 10, place_id: "NMS:MBPR", bbox: [-77.323, 38.397, -77.257, 38.486] },
  { id: "mnms", label: "Monitor", group: "Sanctuaries and seas", lon: -75.41, lat: 35.01, zoom: 10, place_id: "NMS:MNMS", bbox: [-75.418, 34.998, -75.401, 35.015] },
  { id: "sbnms", label: "Stellwagen Bank", group: "Sanctuaries and seas", lon: -70.32, lat: 42.43, zoom: 8.3, place_id: "NMS:SBNMS", bbox: [-70.597, 42.093, -70.035, 42.767] },
  { id: "lonms", label: "Lake Ontario", group: "Sanctuaries and seas", lon: -76.72, lat: 43.69, zoom: 7.9, place_id: "NMS:LONMS", bbox: [-77.388, 43.27, -76.059, 44.113] },
  { id: "wscnms", label: "Wisconsin Shipwreck Coast", group: "Sanctuaries and seas", lon: -87.62, lat: 43.83, zoom: 7.6, place_id: "NMS:WSCNMS", bbox: [-87.888, 43.315, -87.344, 44.353] },
  { id: "tbnms", label: "Thunder Bay", group: "Sanctuaries and seas", lon: -83.33, lat: 45.17, zoom: 7.3, place_id: "NMS:TBNMS", bbox: [-84.333, 44.512, -82.33, 45.833] },
  { id: "tortugas", label: "Tortugas Ecological Reserve", group: "Sanctuaries and seas", lon: -82.97, lat: 24.53, zoom: 9.1, place_id: "PSGID:939", bbox: [-83.15, 24.3, -82.8, 24.767] },
  { id: "pitcairn", label: "Pitcairn EEZ", group: "Sanctuaries and seas", lon: -127.27, lat: -24.49, zoom: 5.0, place_id: "MRGID:8439", bbox: [-133.433, -28.425, -121.109, -20.561] },
  { id: "caribbean", label: "Caribbean Sea", group: "Sanctuaries and seas", lon: -75, lat: 16, zoom: 4.2 },
  { id: "gulf-maine", label: "Gulf of Maine", group: "Sanctuaries and seas", lon: -68.5, lat: 42.8, zoom: 6.2 },
  { id: "north-sea", label: "North Sea", group: "Sanctuaries and seas", lon: 3, lat: 56, zoom: 4.8 },
  { id: "mediterranean", label: "Mediterranean Sea", group: "Sanctuaries and seas", lon: 18, lat: 38, zoom: 3.9 },
  { id: "gbr", label: "Great Barrier Reef", group: "Sanctuaries and seas", lon: 150, lat: -18, zoom: 4.6 },
  { id: "coral-triangle", label: "Coral Triangle", group: "Sanctuaries and seas", lon: 125, lat: 0, zoom: 4 },
  { id: "benguela", label: "Benguela Current", group: "Sanctuaries and seas", lon: 14, lat: -27, zoom: 4.6 },
];

/** the gazetteer place a region outlines, or null (seas and oceans have no polygon) */
export function placeIdOf(regionId: string | null | undefined): string | null {
  return REGIONS.find((r) => r.id === regionId)?.place_id ?? null;
}

/** the region a gazetteer place id belongs to (a link with `pl=` outlines it without a pick) */
export function regionOfPlace(placeId: string | null | undefined): Region | null {
  return placeId ? (REGIONS.find((r) => r.place_id === placeId) ?? null) : null;
}
