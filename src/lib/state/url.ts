// the whole view lives in the URL hash (like the atlas: the URL is the view, so any link reproduces
// it). Parsing never throws: an unknown or malformed value falls back to its default.
//
//   #i=es&l=eov:fish&p=1990&r=auto&o=0.85&t=dark&d=release&g=flat&c=-20.00,5.00,1.40
//
// The eight keys other than `g` are always written, in that order. `g` (projection) is written only
// when it is not the default, the globe (0.5.1); a link without `g` opens the globe, a link with
// `g=flat` still opens the flat map. The layout keys added in 0.4.0 are written only when they
// differ from their default (see LAYOUT_KEYS):
//   k=indicator|place|share   Controls tab (default taxon): taxon and indicator are the two sub-tabs of
//                             ① Metric (0.8.0), place and share are ② Place and ③ Share
//   cc=1                      Controls pane folded to its pill
//   tc=1                      Time strip folded
//   x=<h3>                    the selected cell (lights the Cell pill)
//   xo=1                      the Cell pane open
//   b=0                       basemap labels off
//   pl=<place_id>             the outlined gazetteer place (0.5.2), e.g. pl=NMS:MBNMS; since 0.7.0 any id of
//                             the gazetteer index, percent-encoded (`pl=BOEM:OCS-P%200561`)
//   pc=<collection>           the gazetteer collection of `pl`, written only when the id occurs in more than
//                             one collection (0.7.0); `pl` alone opens the first collection that has it
// and the place filter and view (0.10.0), each written only when set, after the layout keys:
//   f=<coll>                  only the hexagons inside the places of a gazetteer collection: all of them,
//   f=<coll>|<id>             one place,
//   f=<coll>|<id>,<id>,…      or a set (ids sorted, so a set has one spelling); `|` and `,` are not in
//                             the id alphabet, so nothing is escaped (CalCOFI explore's `area=in:`/`ins:`)
//   v=places                  view as places: one row and one colour per place of the filter (0.10.0)
import { isIndicator, parseLayerKey, layerKey, type Indicator } from "../data/layers";
import { RES_MAX } from "./resolution";

export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;

/** every view of the Controls (`k=`): the two Metric sub-tabs, then Place and Share */
export const TABS = ["taxon", "indicator", "place", "share"] as const;
export type Tab = (typeof TABS)[number];

/** the Controls tabs, in pipeline order (0.8.0): ① Metric, the dataset step (taxon and indicator,
 * which only mean something together, as an ERDDAP dataset and its variable) → ② Place (where, the
 * hexagon size, the period, the projection) → ③ Share (delivery) */
export const CONTROL_TABS = ["metric", "place", "share"] as const;
export type ControlTab = (typeof CONTROL_TABS)[number];
/** the sub-tabs of ① Metric */
export const METRIC_TABS = ["taxon", "indicator"] as const;
export type MetricTab = (typeof METRIC_TABS)[number];

export const isMetricTab = (t: string): t is MetricTab => (METRIC_TABS as readonly string[]).includes(t);
/** the Controls tab that shows a view */
export const controlTab = (t: Tab): ControlTab => (isMetricTab(t) ? "metric" : t);
/** the view a Controls tab opens: Metric opens its last sub-tab (`last`), the others themselves */
export const tabFor = (c: ControlTab, last: MetricTab): Tab => (c === "metric" ? last : c);

/** the hash keys of the layout state, written only when not at their default */
export const LAYOUT_KEYS = ["k", "cc", "tc", "x", "xo", "b", "pl", "pc"] as const;

const H3_RE = /^[0-9a-f]{15}$/;
/** an Ocean Metrics gazetteer place id, the alphabet of the whole index: `NMS:MBNMS`, `MRGID:8439`,
 * `GEBCO:1001`, `BOEM:OCS-P 0561`, `ONMS:channel-islands-national-marine-sanctuary:northern-section`
 * (letters, digits and `: _ - .` and spaces; 1-80 characters). It goes into map filters and, for the
 * place filter's membership (0.10.0), into SQL through `lit()` only; anything else in a link is dropped. */
export const PLACE_ID_RE = /^[A-Za-z0-9:_. -]{1,80}$/;
/** a gazetteer collection slug (`boem_wind_leases`), the `pc=` value */
export const PLACE_COLL_RE = /^[a-z][a-z0-9_]{0,63}$/;
/** the most places one filter link may name */
export const FILTER_MAX_IDS = 500;

/** the place filter: a collection, and some of its places (null = every place of it) */
export interface PlaceFilter {
  coll: string;
  ids: string[] | null;
}

/** `f=` → a filter; null for anything malformed (an id outside the alphabet drops the whole filter,
 * so a link never filters by fewer places than it names) */
export function parseFilter(v: string | null | undefined): PlaceFilter | null {
  if (!v) return null;
  const at = v.indexOf("|");
  const coll = at < 0 ? v : v.slice(0, at);
  if (!PLACE_COLL_RE.test(coll)) return null;
  if (at < 0) return { coll, ids: null };
  const ids = [...new Set(v.slice(at + 1).split(","))].sort();
  if (!ids.length || ids.length > FILTER_MAX_IDS || !ids.every((id) => PLACE_ID_RE.test(id))) return null;
  return { coll, ids };
}

/** a filter → its `f=` value (unencoded) */
export function formatFilter(f: PlaceFilter): string {
  return f.ids ? `${f.coll}|${[...new Set(f.ids)].sort().join(",")}` : f.coll;
}

export interface AppState {
  indicator: Indicator;
  /** layerKey(): `all`, `eov:<eov>`, `taxon:<rank>:<taxon>` */
  layer: string;
  /** null = all years */
  decade: number | null;
  resMode: "auto" | "manual";
  /** the manual resolution (ignored in auto mode) */
  res: number;
  opacity: number;
  theme: "dark" | "light";
  /** colour ramp domain: the release's p02–p98 for this view, or the loaded partition's own */
  domain: "release" | "view";
  /** map projection: MapLibre globe or flat web mercator */
  proj: "globe" | "flat";
  lon: number;
  lat: number;
  zoom: number;
  /** the open Controls tab */
  tab: Tab;
  /** the Controls pane folded to its pill */
  ctlFolded: boolean;
  /** the Time strip folded */
  timeFolded: boolean;
  /** the selected (clicked) cell, an H3 index; null = none */
  cell: string | null;
  /** the Cell pane open (else a pill on the right edge, lit while a cell is selected) */
  cellOpen: boolean;
  /** basemap labels (place names) drawn over the hexagons */
  labels: boolean;
  /** the gazetteer place whose geometry is outlined on the map; null = none */
  place: string | null;
  /** its collection, set only when `place` occurs in more than one collection; null otherwise */
  placeColl: string | null;
  /** only the hexagons inside these places; null = everywhere */
  filter: PlaceFilter | null;
  /** hexagons, or one row and colour per place of the filter */
  view: "hex" | "places";
}

export const DEFAULT_STATE: AppState = {
  indicator: "es",
  layer: "all",
  decade: null,
  resMode: "auto",
  res: 3,
  opacity: 0.85,
  theme: "dark",
  domain: "release",
  proj: "globe",
  // the opening view: North America and its coasts (0.7.5; was the whole world, -20, 5, 1.4, which is
  // still the "Whole world" preset in regions.ts)
  lon: -103.7,
  lat: 33.2,
  zoom: 2.57,
  tab: "taxon",
  ctlFolded: false,
  timeFolded: false,
  cell: null,
  cellOpen: false,
  labels: true,
  place: null,
  placeColl: null,
  filter: null,
  view: "hex",
};

const round = (x: number, d: number) => Number(x.toFixed(d));

/** hash params are written by hand, not with URLSearchParams: the layer key is already
 * percent-encoded by layerKey() (a taxon "A b" is `taxon:class:A%20b`) and must not be encoded a
 * second time; ":" and "," stay literal (both are safe in a fragment). */
export function formatHash(s: AppState): string {
  const p: [string, string][] = [
    ["i", s.indicator],
    ["l", s.layer],
    ["p", s.decade === null ? "all" : String(s.decade)],
    ["r", s.resMode === "auto" ? "auto" : String(s.res)],
    ["o", String(round(s.opacity, 2))],
    ["t", s.theme],
    ["d", s.domain],
    ...(s.proj !== DEFAULT_STATE.proj ? [["g", s.proj] as [string, string]] : []),
    ["c", [round(s.lon, 3), round(s.lat, 3), round(s.zoom, 2)].join(",")],
  ];
  if (s.tab !== DEFAULT_STATE.tab) p.push(["k", s.tab]);
  if (s.ctlFolded) p.push(["cc", "1"]);
  if (s.timeFolded) p.push(["tc", "1"]);
  if (s.cell) p.push(["x", s.cell]);
  if (s.cellOpen) p.push(["xo", "1"]);
  if (!s.labels) p.push(["b", "0"]);
  if (s.place) p.push(["pl", s.place]);
  if (s.place && s.placeColl) p.push(["pc", s.placeColl]);
  if (s.filter) p.push(["f", formatFilter(s.filter)]);
  if (s.view !== DEFAULT_STATE.view) p.push(["v", s.view]);
  return `#${p.map(([k, v]) => `${k}=${k === "l" ? v : encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%7C/g, "|")}`).join("&")}`;
}

/** raw (undecoded) hash params; `l` is decoded by parseLayerKey, the rest here. */
function hashParams(hash: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const kv of hash.replace(/^#/, "").split("&")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    const k = kv.slice(0, i);
    const raw = kv.slice(i + 1);
    let v = raw;
    if (k !== "l") {
      try {
        v = decodeURIComponent(raw.replace(/\+/g, " "));
      } catch {
        continue;
      }
    }
    out.set(k, v);
  }
  return out;
}

export function parseHash(hash: string): AppState {
  const s: AppState = { ...DEFAULT_STATE };
  const p = hashParams(hash);
  const i = p.get("i");
  if (isIndicator(i)) s.indicator = i;
  const l = p.get("l");
  const sel = parseLayerKey(l);
  if (sel) s.layer = layerKey(sel);
  const per = p.get("p");
  if (per && per !== "all" && (DECADES as readonly number[]).includes(Number(per)))
    s.decade = Number(per);
  const r = p.get("r");
  if (r && r !== "auto") {
    const n = Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= RES_MAX) {
      s.resMode = "manual";
      s.res = n;
    }
  }
  const o = Number(p.get("o"));
  if (p.has("o") && Number.isFinite(o) && o >= 0 && o <= 1) s.opacity = o;
  const t = p.get("t");
  if (t === "dark" || t === "light") s.theme = t;
  const d = p.get("d");
  if (d === "release" || d === "view") s.domain = d;
  const g = p.get("g");
  if (g === "globe" || g === "flat") s.proj = g;
  const c = (p.get("c") ?? "").split(",").map(Number);
  if (c.length === 3 && c.every(Number.isFinite)) {
    const [lon, lat, zoom] = c;
    if (lon >= -540 && lon <= 540 && lat >= -90 && lat <= 90 && zoom >= 0 && zoom <= 22) {
      s.lon = lon;
      s.lat = lat;
      s.zoom = zoom;
    }
  }
  const k = p.get("k");
  if ((TABS as readonly string[]).includes(k ?? "")) s.tab = k as Tab;
  s.ctlFolded = p.get("cc") === "1";
  s.timeFolded = p.get("tc") === "1";
  const x = (p.get("x") ?? "").toLowerCase();
  if (H3_RE.test(x)) s.cell = x;
  s.cellOpen = p.get("xo") === "1";
  if (p.get("b") === "0") s.labels = false;
  const pl = p.get("pl") ?? "";
  if (PLACE_ID_RE.test(pl)) s.place = pl;
  const pc = p.get("pc") ?? "";
  if (s.place && PLACE_COLL_RE.test(pc)) s.placeColl = pc;
  s.filter = parseFilter(p.get("f"));
  if (p.get("v") === "places") s.view = "places";
  return s;
}

/** true when the hash sets key `k` (e.g. whether a link chose the theme with `t=`) */
export function hashHas(hash: string, k: string): boolean {
  return hash
    .replace(/^#/, "")
    .split("&")
    .some((kv) => kv.split("=")[0] === k);
}
