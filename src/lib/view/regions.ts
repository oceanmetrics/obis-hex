// "go to" places for the Place & scale tab: a camera per region (centre and zoom), chosen so the
// region fills a laptop-sized map. They move the map only; what loads is still decided by the
// viewport (planView), so a region never changes the bytes rule.
export interface Region {
  id: string;
  label: string;
  group: string;
  lon: number;
  lat: number;
  zoom: number;
}

export const REGIONS: Region[] = [
  { id: "world", label: "Whole world", group: "World", lon: -20, lat: 5, zoom: 1.4 },
  { id: "pacific", label: "Pacific Ocean", group: "Oceans", lon: -160, lat: 5, zoom: 1.8 },
  { id: "atlantic", label: "Atlantic Ocean", group: "Oceans", lon: -35, lat: 15, zoom: 1.9 },
  { id: "indian", label: "Indian Ocean", group: "Oceans", lon: 75, lat: -15, zoom: 2.2 },
  { id: "southern", label: "Southern Ocean", group: "Oceans", lon: 0, lat: -62, zoom: 1.6 },
  { id: "arctic", label: "Arctic Ocean", group: "Oceans", lon: 0, lat: 78, zoom: 2.2 },
  { id: "mbnms", label: "Monterey Bay", group: "Sanctuaries and seas", lon: -122.05, lat: 36.75, zoom: 9.2 },
  { id: "fknms", label: "Florida Keys", group: "Sanctuaries and seas", lon: -81.4, lat: 24.6, zoom: 7.5 },
  { id: "pmnm", label: "Papahānaumokuākea", group: "Sanctuaries and seas", lon: -168, lat: 25.5, zoom: 4.8 },
  { id: "caribbean", label: "Caribbean Sea", group: "Sanctuaries and seas", lon: -75, lat: 16, zoom: 4.2 },
  { id: "gulf-maine", label: "Gulf of Maine", group: "Sanctuaries and seas", lon: -68.5, lat: 42.8, zoom: 6.2 },
  { id: "north-sea", label: "North Sea", group: "Sanctuaries and seas", lon: 3, lat: 56, zoom: 4.8 },
  { id: "mediterranean", label: "Mediterranean Sea", group: "Sanctuaries and seas", lon: 18, lat: 38, zoom: 3.9 },
  { id: "gbr", label: "Great Barrier Reef", group: "Sanctuaries and seas", lon: 150, lat: -18, zoom: 4.6 },
  { id: "coral-triangle", label: "Coral Triangle", group: "Sanctuaries and seas", lon: 125, lat: 0, zoom: 4 },
  { id: "benguela", label: "Benguela Current", group: "Sanctuaries and seas", lon: 14, lat: -27, zoom: 4.6 },
];
