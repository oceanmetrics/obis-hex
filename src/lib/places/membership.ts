// place × H3 membership from the gazetteer (places repo, `scripts/build_h3_membership.py`): for each
// polygon collection and res 1–7, the cells each place covers and `share`, the fraction of the cell's
// area inside the place (kept when ≥ 1% of the cell, or when the cell holds ≥ 1% of the place). Read
// from `<collection>/h3/membership.json` (the manifest row's `h3`): res 1–5 one file each, res 6 and 7
// split by the res-2 / res-3 parent like the release, with `h3/parents.parquet` saying which parents
// hold each place.
//
// The filter keeps the loaded cells a chosen place covers (one, several or every place of a
// collection); the summary pools the loaded cells per place, area-weighted by share. Records (n) add
// up; ES(50), richness, Shannon and Simpson do not, so a place's value for those is a statistic OF THE
// HEXAGONS (their share-weighted mean), never the place's own index. Lazy (the places chunk).
import type { ArrowTableLike, Partition } from "../engine/engine";
import { lit, VALUE_COLUMNS } from "../engine/sql";
import type { Indicator } from "../data/layers";
import { rampColor, type Domain } from "../color/ramp";

export interface MembershipFile {
  res: number;
  /** the res-2 / res-3 parent of a split res; null for res 1–5 */
  parent: string | null;
  /** relative to the collection's directory: `h3/res=7/p=83…/membership.parquet` */
  path: string;
  rows: number;
  places: number;
  bytes: number;
}

export interface MembershipManifest {
  version: string;
  min_share: number;
  res: number[];
  /** split res → parent res, `{"6": 2, "7": 3}` */
  parent_res: Record<string, number>;
  files: MembershipFile[];
  /** relative path of the (place_id, res, parent) index */
  parents: string;
}

/** membership rows, columnar */
export interface Members {
  place: string[];
  h3: string[];
  share: Float64Array;
}

/** a membership.json, checked; throws on anything else */
export function parseManifest(json: unknown): MembershipManifest {
  const m = json as Partial<MembershipManifest> | null;
  if (!m || !Array.isArray(m.res) || !Array.isArray(m.files) || typeof m.parent_res !== "object" || !m.parent_res)
    throw new Error("membership.json: missing res, files or parent_res");
  return {
    version: String(m.version ?? ""),
    min_share: Number(m.min_share ?? 0.01),
    res: m.res.map(Number),
    parent_res: Object.fromEntries(Object.entries(m.parent_res).map(([k, v]) => [k, Number(v)])),
    files: m.files.map((f) => ({
      res: Number(f.res),
      parent: f.parent == null ? null : String(f.parent),
      path: String(f.path),
      rows: Number(f.rows ?? 0),
      places: Number(f.places ?? 0),
      bytes: Number(f.bytes ?? 0),
    })),
    parents: String(m.parents ?? "h3/parents.parquet"),
  };
}

/** the collection directory a membership.json URL lives under (`…/<slug>/`) */
export const collectionDir = (manifestUrl: string) => manifestUrl.replace(/h3\/membership\.json$/, "");

/** the parent resolution of a split res, null when the res is one file */
export const parentResOf = (m: MembershipManifest, res: number): number | null => m.parent_res[String(res)] ?? null;

/**
 * The membership files a view at `res` needs: the one file of res 1–5; for a split res, the parent
 * files that are in view (`viewParents`) and, when places are chosen, hold one of them
 * (`placeParents`); null either set means no restriction from it. null when the collection has no
 * membership at that res.
 */
export function membershipFiles(
  m: MembershipManifest,
  res: number,
  viewParents: Set<string> | null,
  placeParents: Set<string> | null,
): MembershipFile[] | null {
  if (!m.res.includes(res)) return null;
  const files = m.files.filter((f) => f.res === res);
  if (parentResOf(m, res) === null) return files;
  return files.filter((f) => f.parent !== null && (!viewParents || viewParents.has(f.parent)) && (!placeParents || placeParents.has(f.parent)));
}

const inList = (ids: string[]) => `(${ids.map(lit).join(", ")})`;

/** the split-res parents that hold any of the places */
export function parentsSql(url: string, res: number, ids: string[]): string {
  return `SELECT DISTINCT parent FROM read_parquet(${lit(url)}, hive_partitioning = false)\nWHERE res = ${lit(res)} AND place_id IN ${inList(ids)}`;
}

/** read membership files (each tagged with its URL, so they are cached one by one) */
export function membershipSql(urls: string[]): string {
  return `SELECT filename AS url, place_id, h3, share::DOUBLE AS share\nFROM read_parquet([${urls.map(lit).join(", ")}], hive_partitioning = false, filename = true)`;
}

const col = (t: ArrowTableLike, name: string) => Array.from(t.getChild(name)?.toArray() ?? []);

/** membership rows by file URL, from a membershipSql() result */
export function membersByUrl(t: ArrowTableLike, urls: string[]): Map<string, Members> {
  const url = col(t, "url").map(String);
  const place = col(t, "place_id").map(String);
  const h3 = col(t, "h3").map(String);
  const share = col(t, "share").map(Number);
  const idx = new Map<string, number[]>(urls.map((u) => [u, []]));
  url.forEach((u, i) => idx.get(u)?.push(i));
  const out = new Map<string, Members>();
  for (const [u, is] of idx)
    out.set(u, { place: is.map((i) => place[i]), h3: is.map((i) => h3[i]), share: Float64Array.from(is, (i) => share[i]) });
  return out;
}

/** the rows of several files for some places (null = all), concatenated */
export function pickMembers(parts: Members[], ids: string[] | null): Members {
  const want = ids ? new Set(ids) : null;
  const place: string[] = [];
  const h3: string[] = [];
  const share: number[] = [];
  for (const m of parts)
    for (let i = 0; i < m.place.length; i++)
      if (!want || want.has(m.place[i])) {
        place.push(m.place[i]);
        h3.push(m.h3[i]);
        share.push(m.share[i]);
      }
  return { place, h3, share: Float64Array.from(share) };
}

/** each cell's share inside the chosen places together: the sum over places, capped at 1 (places of
 * one collection may overlap) */
export function cellShares(m: Members): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < m.h3.length; i++) out.set(m.h3[i], Math.min(1, (out.get(m.h3[i]) ?? 0) + m.share[i]));
  return out;
}

/** a loaded partition cut to the cells of the chosen places; `share` is each kept cell's share */
export interface FilteredPartition extends Partition {
  share: Float64Array;
}

export function filterPartition(p: Partition, m: Members): FilteredPartition {
  const shares = cellShares(m);
  const keep: number[] = [];
  for (let i = 0; i < p.rows; i++) if (shares.has(p.h3[i])) keep.push(i);
  const values = {} as Record<Indicator, Float64Array>;
  for (const c of VALUE_COLUMNS) values[c] = Float64Array.from(keep, (i) => p.values[c][i]);
  return {
    ...p,
    url: `${p.url}#in`,
    rows: keep.length,
    h3: keep.map((i) => p.h3[i]),
    values,
    share: Float64Array.from(keep, (i) => shares.get(p.h3[i])!),
  };
}

/** one place's numbers over the loaded cells */
export interface PlaceStat {
  place_id: string;
  /** hexagons of the place with data loaded */
  cells: number;
  /** Σ share over those hexagons: the place's area in hexagons with data */
  area: number;
  /** Σ n·share: the records inside, area-weighted (n adds up) */
  records: number;
  /** hexagons with a value of the indicator */
  valued: number;
  /** Σ v·share / Σ share over valued hexagons: the area-weighted mean of the hexagons' values */
  mean: number;
  min: number;
  max: number;
}

/** per-place statistics of the indicator over the partition's cells, area-weighted by share; places
 * with no loaded cell are left out. Sorted by place_id. */
export function placeSummary(p: Partition, m: Members, indicator: Indicator): PlaceStat[] {
  const at = new Map<string, number>();
  for (let i = 0; i < p.rows; i++) at.set(p.h3[i], i);
  const acc = new Map<string, PlaceStat & { w: number; vw: number }>();
  const n = p.values.n;
  const v = p.values[indicator];
  for (let k = 0; k < m.h3.length; k++) {
    const i = at.get(m.h3[k]);
    if (i === undefined) continue;
    const s = m.share[k];
    let a = acc.get(m.place[k]);
    if (!a) {
      a = { place_id: m.place[k], cells: 0, area: 0, records: 0, valued: 0, mean: NaN, min: Infinity, max: -Infinity, w: 0, vw: 0 };
      acc.set(m.place[k], a);
    }
    a.cells++;
    a.area += s;
    if (Number.isFinite(n[i])) a.records += n[i] * s;
    if (Number.isFinite(v[i])) {
      a.valued++;
      a.w += s;
      a.vw += v[i] * s;
      a.min = Math.min(a.min, v[i]);
      a.max = Math.max(a.max, v[i]);
    }
  }
  return [...acc.values()]
    .map(({ w, vw, ...a }) => ({
      ...a,
      mean: w > 0 ? vw / w : NaN,
      min: a.valued ? a.min : NaN,
      max: a.valued ? a.max : NaN,
    }))
    .sort((a, b) => (a.place_id < b.place_id ? -1 : a.place_id > b.place_id ? 1 : 0));
}

/** the value a place is coloured and sorted by: records for `n` (it adds up), else the mean */
export const placeValue = (s: PlaceStat, indicator: Indicator) => (indicator === "n" ? s.records : s.mean);

/** the places' colours, viewing places: the ramp spans the places' own values (min–max), a place
 * without a value is left out (drawn transparent) */
export function placeColors(rows: PlaceStat[], indicator: Indicator): { domain: Domain | null; fill: Record<string, string> } {
  const vals = rows.map((r) => [r.place_id, placeValue(r, indicator)] as const).filter(([, v]) => Number.isFinite(v));
  if (!vals.length) return { domain: null, fill: {} };
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of vals) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const domain: Domain = [lo, hi];
  const fill: Record<string, string> = {};
  for (const [id, v] of vals) fill[id] = `rgb(${rampColor(v, domain).join(",")})`;
  return { domain, fill };
}

const csvCell = (x: string | number) => {
  const t = typeof x === "number" ? (Number.isFinite(x) ? String(Math.round(x * 1e6) / 1e6) : "") : x;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** the summary as CSV, one row per place; `names` maps place_id → name */
export function summaryCsv(rows: PlaceStat[], names: Map<string, string>, indicator: Indicator, coll: string, res: number): string {
  const head = ["collection", "place_id", "name", "res", "hexagons", "area_hexagons", "records_weighted", "hexagons_valued", `${indicator}_mean_of_hexagons`, `${indicator}_min`, `${indicator}_max`];
  const lines = rows.map((r) =>
    [coll, r.place_id, names.get(r.place_id) ?? "", res, r.cells, r.area, r.records, r.valued, r.mean, r.min, r.max].map(csvCell).join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}

/** a cache of membership files by URL (each read once) and of manifests and parent lists */
export class MemberCache {
  #files = new Map<string, Promise<Members>>();
  #json = new Map<string, Promise<MembershipManifest>>();
  #parents = new Map<string, Promise<Set<string>>>();
  constructor(
    private db: { query(sql: string): Promise<ArrowTableLike> },
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  manifest(url: string): Promise<MembershipManifest> {
    let p = this.#json.get(url);
    if (!p) {
      p = this.fetchFn(url)
        .then((r) => {
          if (!r.ok) throw new Error(`membership.json: HTTP ${r.status}`);
          return r.json();
        })
        .then(parseManifest);
      this.#json.set(url, p);
      p.catch(() => this.#json.delete(url));
    }
    return p;
  }

  /** the split-res parents holding any of `ids` */
  parents(url: string, res: number, ids: string[]): Promise<Set<string>> {
    const key = `${url}\n${res}\n${[...ids].sort().join("\n")}`;
    let p = this.#parents.get(key);
    if (!p) {
      p = this.db.query(parentsSql(url, res, ids)).then((t) => new Set(col(t, "parent").map(String)));
      this.#parents.set(key, p);
      p.catch(() => this.#parents.delete(key));
    }
    return p;
  }

  /** the rows of `urls` for the places `ids` (null = all); files not yet read are read in one query */
  async members(urls: string[], ids: string[] | null): Promise<Members> {
    const missing = urls.filter((u) => !this.#files.has(u));
    if (missing.length) {
      const job = this.db.query(membershipSql(missing)).then((t) => membersByUrl(t, missing));
      for (const u of missing) {
        const one = job.then((m) => m.get(u)!);
        this.#files.set(u, one);
        one.catch(() => this.#files.delete(u));
      }
    }
    return pickMembers(await Promise.all(urls.map((u) => this.#files.get(u)!)), ids);
  }
}
