// the species in one hexagon (the Cell pane): the h3t cell endpoint (MarineSensitivity/server h3t,
// app/cell.py) lists the species behind a cell's n and sp, with records and first / last year, filtered
// as the layer is (all taxa, an EOV, a taxon group, a WoRMS subtree) and by decade. It reads the store
// the release is exported from, so the list sums to the cell's n and counts to its sp unless the
// service runs another release (`store` names its file; see `totalsNote`).
//
//   GET <h3t base>cell?h3=<hex>[&aphiaid=|&eov=|&rank=&taxon=][&decade=][&release=]
import { cellToBoundary } from "h3-js";
import { FETCH_TIMEOUT_MS, H3tError, type FetchLike } from "../aphia/h3t";
import type { LayerSel } from "../data/layers";
import { fmt } from "../format";

export interface CellSpecies {
  species: string;
  /** the WoRMS species-rank AphiaID of the name (null if the service had none) */
  aphiaid: number | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  records: number;
  /** first and last year with a record; null when no record of the species has a year */
  year_min: number | null;
  year_max: number | null;
}

export interface CellSpeciesList {
  h3: string;
  res: number;
  /** the store file the service read, e.g. `obis_h3_global_v20260728.duckdb` */
  store: string;
  /** records and species in the list */
  n: number;
  sp: number;
  /** most records first */
  species: CellSpecies[];
}

/** what the Cell pane shows below the indicators */
export type SpeciesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; list: CellSpeciesList; note: string }
  | { status: "error"; message: string }
  | { status: "down" };

/** rows in the pane before it is expanded */
export const TOP_SPECIES = 10;
/** rows the expanded table draws at once (search narrows; the CSV has all) */
export const MAX_ROWS = 500;

// request ----

/** the request URL; parameters in a fixed order so equal requests share a cache entry. */
export function cellSpeciesUrl(
  base: string,
  r: { h3: string; sel: LayerSel; decade: number | null; release: string | null },
): string {
  const p = [`h3=${r.h3.toLowerCase()}`];
  const s = r.sel;
  if (s.kind === "aphia") p.push(`aphiaid=${s.id}`);
  else if (s.kind === "eov") p.push(`eov=${encodeURIComponent(s.eov)}`);
  else if (s.kind === "taxon") p.push(`rank=${encodeURIComponent(s.rank)}`, `taxon=${encodeURIComponent(s.taxon)}`);
  if (r.decade !== null) p.push(`decade=${r.decade}`);
  if (r.release) p.push(`release=${encodeURIComponent(r.release)}`);
  return `${base}cell?${p.join("&")}`;
}

// response ----

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function toSpecies(r: unknown): CellSpecies | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const species = str(o.species);
  const records = num(o.records);
  if (!species || records === null) return null;
  return {
    species,
    aphiaid: num(o.aphiaid),
    phylum: str(o.phylum),
    class: str(o.class),
    order: str(o.order),
    family: str(o.family),
    records,
    year_min: num(o.year_min),
    year_max: num(o.year_max),
  };
}

/** the endpoint's JSON → the list, skipping malformed rows (n and sp recounted from the rows kept);
 * null when it is not a cell response. Never throws. */
export function parseCellSpecies(json: unknown): CellSpeciesList | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const h3 = str(o.h3);
  const res = num(o.res);
  if (!h3 || res === null || !Array.isArray(o.species)) return null;
  const species = o.species.map(toSpecies).filter((s): s is CellSpecies => s !== null);
  return {
    h3,
    res,
    store: str(o.store) ?? "",
    n: species.reduce((a, s) => a + s.records, 0),
    sp: species.length,
    species,
  };
}

/** `obis_h3_global_v20260728.duckdb` → `v20260728` */
export function storeRelease(store: string): string | null {
  return /v\d{8}/.exec(store)?.[0] ?? null;
}

/** "" when the list adds up to the hexagon's records and species; else one line saying why not. */
export function totalsNote(list: CellSpeciesList, cell: { n: number; sp: number }, release: string | null): string {
  if (list.n === cell.n && list.sp === cell.sp) return "";
  const svc = storeRelease(list.store);
  if (svc && release && svc !== release)
    return `Species from release ${svc}, the map from ${release}: their totals differ.`;
  return `These ${fmt(list.sp)} species and ${fmt(list.n)} records do not match the hexagon's values.`;
}

// fetch ----

/** recent lists by request URL */
const cache = new Map<string, CellSpeciesList>();
const CACHE_MAX = 32;

/** GET a cell's species, from the cache when this URL was fetched before. Non-2xx, timeouts and a
 * malformed body throw H3tError (status 0 for the last two); an abort rethrows the AbortError. */
export async function loadCellSpecies(
  url: string,
  fetchFn: FetchLike = fetch,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<CellSpeciesList> {
  const hit = cache.get(url);
  if (hit) return hit;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const relay = () => ctl.abort();
  signal?.addEventListener("abort", relay);
  try {
    let res: Response;
    try {
      res = await fetchFn(url, { signal: ctl.signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (ctl.signal.aborted) throw new H3tError(0, `timed out after ${Math.round(timeoutMs / 1000)} s`);
      throw new H3tError(0, `unreachable${err instanceof Error ? `: ${err.message}` : ""}`);
    }
    if (!res.ok) {
      let reason = "";
      try {
        const j = (await res.json()) as { reason?: unknown; detail?: unknown };
        reason = str(j.reason) ?? str(j.detail) ?? "";
      } catch {
        /* not JSON */
      }
      throw new H3tError(res.status, reason || `HTTP ${res.status}`);
    }
    const list = parseCellSpecies(await res.json().catch(() => null));
    if (!list) throw new H3tError(0, "the response is not a species list");
    cache.set(url, list);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return list;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

/** a one-line message for a failed species request */
export function speciesErrorLine(err: unknown): string {
  if (err instanceof H3tError) {
    if (err.status === 400) return `Species list request refused: ${err.message}`;
    if (err.status === 503) return `Species list unavailable: ${err.message}`;
    return `Species list: ${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`;
  }
  return `Species list: ${err instanceof Error ? err.message : String(err)}`;
}

// table ----

export type SpeciesSortKey = "species" | "class" | "family" | "records" | "year_min" | "year_max";

/** a sorted copy; empty values (null) last in either direction, ties by name */
export function sortSpecies(rows: CellSpecies[], key: SpeciesSortKey, desc: boolean): CellSpecies[] {
  const dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      if (c !== 0) return c * dir;
    }
    return a.species.localeCompare(b.species);
  });
}

/** the rows whose name or taxonomy contains every word of `q` (case-insensitive) */
export function filterSpecies(rows: CellSpecies[], q: string): CellSpecies[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = [r.species, r.phylum, r.class, r.order, r.family].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** "1950–2026", "1995" or "—" */
export function yearsText(min: number | null, max: number | null): string {
  if (min === null || max === null) return "—";
  return min === max ? String(min) : `${min}–${max}`;
}

/** share of the cell's records, 0..1 */
export const share = (r: CellSpecies, n: number) => (n > 0 ? r.records / n : 0);

const csvCell = (x: string | number | null) => {
  if (x === null) return "";
  const t = typeof x === "number" ? String(Math.round(x * 1e6) / 1e6) : x;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** the list as CSV, one row per species, most records first */
export function speciesCsv(list: CellSpeciesList): string {
  const head = ["h3", "res", "species", "aphiaid", "phylum", "class", "order", "family", "records", "share_of_records", "year_min", "year_max"];
  const lines = list.species.map((r) =>
    [list.h3, list.res, r.species, r.aphiaid, r.phylum, r.class, r.order, r.family, r.records, share(r, list.n), r.year_min, r.year_max]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}

/** `obis-hex_species_<h3>_<layer>_<period>_<release>.csv`, safe for any file system */
export function speciesCsvName(h3: string, layerKey: string, decade: number | null, release: string | null): string {
  const safe = (s: string) => decodeURIComponent(s).replace(/[^A-Za-z0-9_-]+/g, "-");
  const parts = ["obis-hex_species", h3, safe(layerKey), decade === null ? "all-years" : `${decade}s`];
  if (release) parts.push(safe(release));
  return `${parts.join("_")}.csv`;
}

// fallback ----

/** the OBIS API checklist for the hexagon's polygon (live OBIS, so its counts differ from the
 * release's): the link offered when the species service cannot answer. */
export function obisChecklistUrl(h3: string, decade: number | null): string {
  const ring = cellToBoundary(h3, true).map(([lng, lat]) => `${+lng.toFixed(6)} ${+lat.toFixed(6)}`);
  const p = new URLSearchParams({ geometry: `POLYGON((${ring.join(", ")}))` });
  if (decade !== null) {
    p.set("startdate", `${decade}-01-01`);
    p.set("enddate", `${decade + 9}-12-31`);
  }
  return `https://api.obis.org/v3/checklist?${p}`;
}
