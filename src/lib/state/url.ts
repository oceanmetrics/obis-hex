// the whole view lives in the URL hash (like the atlas: the URL is the view, so any link reproduces
// it). Parsing never throws: an unknown or malformed value falls back to its default.
//
//   #i=es&l=eov:fish&p=1990&r=auto&o=0.85&t=dark&d=release&c=-20.00,5.00,1.40
import { isIndicator, parseLayerKey, layerKey, type Indicator } from "../data/layers";
import { RES_MAX } from "./resolution";

export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;

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
  lon: number;
  lat: number;
  zoom: number;
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
  lon: -20,
  lat: 5,
  zoom: 1.4,
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
    ["c", [round(s.lon, 3), round(s.lat, 3), round(s.zoom, 2)].join(",")],
  ];
  return `#${p.map(([k, v]) => `${k}=${k === "l" ? v : encodeURIComponent(v).replace(/%2C/g, ",")}`).join("&")}`;
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
  const c = (p.get("c") ?? "").split(",").map(Number);
  if (c.length === 3 && c.every(Number.isFinite)) {
    const [lon, lat, zoom] = c;
    if (lon >= -540 && lon <= 540 && lat >= -90 && lat <= 90 && zoom >= 0 && zoom <= 22) {
      s.lon = lon;
      s.lat = lat;
      s.zoom = zoom;
    }
  }
  return s;
}
