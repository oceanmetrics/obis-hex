// the Ocean Metrics gazetteer as the Place picker's source: the manifest (`layers.json`: one PMTiles
// per collection, with title, paint and credit) and the index (`places_index.parquet`: one row per
// place, 14,734 of them in 22 collections). Plain functions with no DOM, so tests drive them with
// a small fixture; the index is read through the app's DuckDB engine (any object with `rows(sql)`).
//
// A place is keyed by (collection, place_id): the ids are not unique across collections (the
// BOEM Pacific lease ids repeat in the wind leases), which is why a link may carry `pc=<collection>`.
import { lit } from "../engine/sql";

import { GAZETTEER_BASE, INDEX_URL, LAYERS_URL, OBIS_CREDIT, pmtilesUrl } from "./urls";

export { GAZETTEER_BASE, INDEX_URL, LAYERS_URL, OBIS_CREDIT, pmtilesUrl };

/** one collection of the manifest */
export interface PlaceLayer {
  slug: string;
  title: string;
  authority: string | null;
  place_type: string | null;
  geom_type: string;
  n: number;
  /** rewritten to the bucket host */
  pmtiles: string;
  attribution: string;
  attribution_html: string;
  license: string;
  license_url: string;
  citation: string;
  bbox: [number, number, number, number] | null;
}

/** one place of the index (no per-row attribution: it is the collection's, in the manifest) */
export interface PlaceRow {
  place_id: string;
  name: string;
  authority: string | null;
  place_type: string | null;
  geom_type: string | null;
  collection: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  lon: number;
  lat: number;
  /** folded name + id, what the search matches */
  hay: string;
}

export interface PlaceData {
  layers: PlaceLayer[];
  rows: PlaceRow[];
}

/** anything with the engine's `rows(sql)` (the Engine, or a stub in tests) */
export interface RowSource {
  rows<T = Record<string, unknown>>(sql: string): Promise<T[]>;
}

// manifest and index ----

/** the manifest's layers, in its order, with `pmtiles` rewritten to the bucket host */
export function parseLayers(json: unknown): PlaceLayer[] {
  const list = (json as { layers?: unknown })?.layers;
  if (!Array.isArray(list)) throw new Error("gazetteer manifest has no layers");
  return list.map((l: Record<string, unknown>) => ({
    slug: String(l.slug),
    title: String(l.title ?? l.slug),
    authority: (l.authority as string | null) ?? null,
    place_type: (l.place_type as string | null) ?? null,
    geom_type: String(l.geom_type ?? ""),
    n: Number(l.n ?? 0),
    pmtiles: pmtilesUrl(String(l.slug)),
    attribution: String(l.attribution ?? ""),
    attribution_html: String(l.attribution_html ?? ""),
    license: String(l.license ?? ""),
    license_url: String(l.license_url ?? ""),
    citation: String(l.citation ?? ""),
    bbox: Array.isArray(l.bbox) && l.bbox.length === 4 ? (l.bbox as [number, number, number, number]) : null,
  }));
}

export async function loadLayers(fetchFn: typeof fetch = fetch): Promise<PlaceLayer[]> {
  const r = await fetchFn(LAYERS_URL);
  if (!r.ok) throw new Error(`gazetteer manifest: HTTP ${r.status}`);
  return parseLayers(await r.json());
}

/** the one query that reads the index: flat columns (no attribution, which repeats per row) */
export function indexSql(url: string = INDEX_URL): string {
  return (
    "SELECT place_id, name, authority, place_type, geom_type, collection,\n" +
    "  bbox.xmin AS xmin, bbox.ymin AS ymin, bbox.xmax AS xmax, bbox.ymax AS ymax,\n" +
    "  centroid_lon, centroid_lat\n" +
    `FROM read_parquet(${lit(url)})`
  );
}

/** lowercase, accents removed, curly quotes straightened: "Papahānaumokuākea" ~ "papahanaumokuakea" */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

type RawRow = Record<string, unknown>;

export function toPlaceRow(r: RawRow): PlaceRow {
  const id = String(r.place_id);
  const name = String(r.name ?? id);
  const num = (v: unknown) => (v === null || v === undefined ? NaN : Number(v));
  const lon = num(r.centroid_lon);
  const lat = num(r.centroid_lat);
  const bb = [num(r.xmin), num(r.ymin), num(r.xmax), num(r.ymax)];
  return {
    place_id: id,
    name,
    authority: (r.authority as string | null) ?? null,
    place_type: (r.place_type as string | null) ?? null,
    geom_type: (r.geom_type as string | null) ?? null,
    collection: String(r.collection),
    bbox: (bb.every(Number.isFinite) ? bb : [lon, lat, lon, lat]) as [number, number, number, number],
    lon,
    lat,
    hay: `${fold(name)} ${fold(id)}`,
  };
}

/** every place of the index, from a DuckDB engine */
export async function loadIndex(db: RowSource, url: string = INDEX_URL): Promise<PlaceRow[]> {
  return (await db.rows<RawRow>(indexSql(url))).map(toPlaceRow);
}

let loading: Promise<PlaceData> | null = null;

/** the manifest and the index, fetched once per page (a failure is not cached, so a retry works) */
export function ensurePlaces(db: RowSource): Promise<PlaceData> {
  loading ??= Promise.all([loadLayers(), loadIndex(db)])
    .then(([layers, rows]): PlaceData => ({ layers, rows }))
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

// search ----

const WORD = /[^a-z0-9]+/;

/** 0 exact, 1 prefix, 2 word prefix, 3 substring; -1 when a word does not match at all */
function rankOf(r: PlaceRow, q: string, words: string[]): number {
  if (!words.every((w) => r.hay.includes(w))) return -1;
  const n = fold(r.name);
  const id = fold(r.place_id);
  if (n === q || id === q) return 0;
  if (n.startsWith(q) || id.startsWith(q)) return 1;
  const toks = `${n} ${id}`.split(WORD);
  if (words.every((w) => toks.some((t) => t.startsWith(w)))) return 2;
  return 3;
}

/** every place whose name or id contains every word of `q`, best first: exact, prefix, word prefix,
 * substring; ties by shorter name, then alphabetical */
export function matchPlaces(rows: PlaceRow[], q: string): PlaceRow[] {
  const qf = fold(q).trim().replace(/\s+/g, " ");
  const words = qf.split(" ").filter(Boolean);
  if (!words.length) return [];
  const hits: { r: PlaceRow; k: number }[] = [];
  for (const r of rows) {
    const k = rankOf(r, qf, words);
    if (k >= 0) hits.push({ r, k });
  }
  hits.sort((a, b) => a.k - b.k || a.r.name.length - b.r.name.length || a.r.name.localeCompare(b.r.name));
  return hits.map((h) => h.r);
}

export function searchPlaces(rows: PlaceRow[], q: string, opts: { limit?: number } = {}): PlaceRow[] {
  const all = matchPlaces(rows, q);
  return opts.limit === undefined ? all : all.slice(0, opts.limit);
}

// picker groups ----

/** rows shown per group before "… N more, type to search" */
export const GROUP_CAP = 50;
/** collections left out of the list until the user types (thousands of near-identical rows) */
export const NOISY_COLLECTIONS: readonly string[] = ["boem_wind_planning_rescinded", "noaa_submarine_cables"];

export interface PlaceGroup {
  slug: string;
  title: string;
  /** the rows shown (at most GROUP_CAP) */
  items: PlaceRow[];
  /** matching rows not shown */
  more: number;
}

export const placeKey = (collection: string, place_id: string) => `${collection}\u0001${place_id}`;

/** the picker groups in manifest order. No query: the first GROUP_CAP rows by name of each
 * collection, the noisy ones hidden. A query: only the groups with matches, best matches first.
 * `selected` is kept visible at the top of its group even when it is past the cap. */
export function groupsFor(
  rows: PlaceRow[],
  layers: PlaceLayer[],
  q: string,
  opts: { selected?: { collection: string; place_id: string } | null } = {},
): PlaceGroup[] {
  const query = q.trim();
  const by = new Map<string, PlaceRow[]>();
  for (const r of query ? matchPlaces(rows, query) : rows) {
    const g = by.get(r.collection);
    if (g) g.push(r);
    else by.set(r.collection, [r]);
  }
  const sel = opts.selected;
  const out: PlaceGroup[] = [];
  for (const l of layers) {
    const hidden = !query && NOISY_COLLECTIONS.includes(l.slug);
    let all = by.get(l.slug) ?? [];
    const pick = !query && sel?.collection === l.slug ? all.find((r) => r.place_id === sel.place_id) : undefined;
    if (hidden && !pick) continue;
    if (!query) all = [...all].sort((a, b) => a.name.localeCompare(b.name));
    let items = hidden ? [] : all.slice(0, GROUP_CAP);
    if (pick && !items.includes(pick)) items = [pick, ...items];
    if (!items.length) continue;
    out.push({ slug: l.slug, title: l.title, items, more: all.length - items.length });
  }
  return out;
}

// camera, collection, credit ----

export type Camera = { bounds: [number, number, number, number] } | { center: [number, number]; zoom: number };

/** a camera the bbox cannot give: Papahānaumokuākea's split polygon has bbox -180..180 and a
 * centroid in the wrong ocean */
const CAMERA_OVERRIDES: Record<string, { center: [number, number]; zoom: number }> = {
  [placeKey("places", "NMS:PMNM")]: { center: [-168, 25.5], zoom: 4.8 },
};

/** the deepest zoom of the point collections' tiles: below it the tiles thin the points to one per
 * tile (calcofi_stations at z9 holds one station per tile), so a point is shown from here */
export const POINT_ZOOM = 10;

/** fit the bbox; a polygon split at the antimeridian (bbox -180..180) cannot be fitted and its centroid
 * is only an average of the two halves, so it gets that centroid and a zoom from its latitude span, one
 * step wider than the span needs; a single point gets POINT_ZOOM */
export function cameraFor(row: PlaceRow): Camera {
  const [w, s, e, n] = row.bbox;
  const fixed = CAMERA_OVERRIDES[placeKey(row.collection, row.place_id)];
  if (fixed) return fixed;
  if (w <= -179.9 && e >= 179.9) {
    const span = Math.max(n - s, 0);
    const zoom = Math.min(5, Math.max(1.2, Math.log2(360 / Math.max(span * 1.6, 8)) - 1));
    return { center: [row.lon, row.lat], zoom: Math.round(zoom * 10) / 10 };
  }
  if (w === e && s === n) return { center: [w, s], zoom: POINT_ZOOM };
  return { bounds: [w, s, e, n] };
}

/** how a place is read back from a link: every collection that holds the id, in index order */
const byIdCache = new WeakMap<PlaceRow[], Map<string, PlaceRow[]>>();
function byId(rows: PlaceRow[]): Map<string, PlaceRow[]> {
  let m = byIdCache.get(rows);
  if (!m) {
    m = new Map();
    for (const r of rows) {
      const l = m.get(r.place_id);
      if (l) l.push(r);
      else m.set(r.place_id, [r]);
    }
    byIdCache.set(rows, m);
  }
  return m;
}

/** the places with this id (one, except for ids shared between collections) */
export const placesWithId = (rows: PlaceRow[], place_id: string): PlaceRow[] => byId(rows).get(place_id) ?? [];

/** the id occurs in more than one collection, so a link must say which (`pc=`) */
export const isAmbiguous = (rows: PlaceRow[], place_id: string): boolean => placesWithId(rows, place_id).length > 1;

/** the place a link means: `pc` when it holds the id, else the first collection that does
 * (null when the id is unknown) */
export function resolvePlace(place_id: string, rows: PlaceRow[], coll?: string | null): PlaceRow | null {
  const hits = placesWithId(rows, place_id);
  return hits.find((r) => r.collection === coll) ?? hits[0] ?? null;
}

export function resolveCollection(place_id: string, rows: PlaceRow[], coll?: string | null): string | null {
  return resolvePlace(place_id, rows, coll)?.collection ?? null;
}

/** the credit line for the selected collection: its manifest `attribution_html`, links opening in a
 * new tab, a link already credited elsewhere in `existing` (the basemap, OBIS) kept as plain text.
 * Empty when the collection is not in the manifest. */
export function creditsFor(slug: string | null, layers: PlaceLayer[], existing: string[] = []): string {
  const l = slug ? layers.find((x) => x.slug === slug) : undefined;
  if (!l?.attribution_html) return "";
  const html = l.attribution_html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (_m, href: string, text: string) =>
    existing.some((e) => e.includes(`href="${href}"`))
      ? text
      : `<a href="${href}" target="_blank" rel="noopener">${text}</a>`,
  );
  return `Places: ${html}`;
}

/** the About / Data sources text for the selected collection */
export function citationFor(slug: string | null, layers: PlaceLayer[]): { title: string; citation: string; license: string; license_url: string } | null {
  const l = slug ? layers.find((x) => x.slug === slug) : undefined;
  return l ? { title: l.title, citation: l.citation, license: l.license, license_url: l.license_url } : null;
}
