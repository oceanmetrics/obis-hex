// the live "children of a WoRMS AphiaID" layer: the h3t subtree endpoint (MarineSensitivity/server
// h3t, app/subtree.py) computes the indicators per H3 cell for any AphiaID and all its descendants,
// which no static release can precompute. This module builds its URLs, parses its taxon search,
// fetches the Parquet (status, X-Rows, X-Query-Ms, timeout) and serves a view with a fallback to a
// coarser res when the endpoint answers 413 (over 200,000 cells). The bytes go into the engine's
// part_cache like any parent partition, so indicators, ramp, hover and stats work unchanged.
//
//   GET <base>taxon?q=<prefix>&limit=20          search (accepted names first)
//   GET <base>taxon/<id>                         name, rank, parent, children
//   GET <base>subtree?aphiaid=&res=1..7[&decade=][&bbox=w,s,e,n][&format=parquet|json]
//   GET <base>health                             liveness
import type { Bounds } from "../view/viewport";
import type { Engine, Partition } from "../engine/engine";

/** the Varnish cache in front of h3t.marinesensitivity.org (the service README's advice for
 * this app); override with `?h3t=https://…/h3t/` or VITE_H3T_BASE. Ends in "/". */
export const H3T_BASE = "https://h3tcache.marinesensitivity.org/h3t/";

/** below this res the endpoint serves the whole globe; from it on a bbox is required (400). */
export const BBOX_MIN_RES = 6;
/** the endpoint's cell cap (413 above it); shown in notices */
export const MAX_CELLS = 200_000;
/** client timeout: the server's own is 60 s (504), plus the round trip */
export const FETCH_TIMEOUT_MS = 65_000;
/** bbox margin (fraction of the view's width / height on each side) and rounding step (degrees),
 * so small pans reuse the same request and its cached response */
export const BBOX_MARGIN = 0.25;
export const BBOX_STEP = 0.5;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** the service base from the page URL (`?h3t=`, https or same-origin path) or the build env. */
export function resolveH3tBase(search: string, envBase: string | undefined, href: string): string {
  const fix = (u: string) => (u.endsWith("/") ? u : `${u}/`);
  const q = new URLSearchParams(search).get("h3t");
  if (q) {
    try {
      const u = new URL(q, href);
      if (u.protocol === "https:" || u.origin === new URL(href).origin) return fix(u.href);
    } catch {
      /* fall through */
    }
  }
  return fix(envBase || H3T_BASE);
}

// taxon search ----

export interface TaxonHit {
  id: number;
  scientificName: string;
  rank: string;
  status: string;
  /** the accepted AphiaID; equals `id` for an accepted name */
  accepted_id: number;
  /** occurrence records in the whole subtree (null for synonyms, which hold none themselves) */
  records: number | null;
}

export interface TaxonInfo extends TaxonHit {
  parent_id: number | null;
  children: number | null;
  children_accepted: number | null;
}

const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toHit(r: unknown): TaxonHit | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const id = int(o.id);
  if (id === null || !text(o.scientificName)) return null;
  return {
    id,
    scientificName: text(o.scientificName),
    rank: text(o.rank),
    status: text(o.status),
    accepted_id: int(o.accepted_id) ?? id,
    records: int(o.records),
  };
}

/** `{q, taxa: [...]}` → the hits, skipping malformed rows; never throws. */
export function parseTaxonSearch(json: unknown): TaxonHit[] {
  const taxa = (json as { taxa?: unknown } | null)?.taxa;
  if (!Array.isArray(taxa)) return [];
  return taxa.map(toHit).filter((t): t is TaxonHit => t !== null);
}

/** `/taxon/<id>` → TaxonInfo, or null when malformed. */
export function parseTaxonInfo(json: unknown): TaxonInfo | null {
  const h = toHit(json);
  if (!h) return null;
  const o = json as Record<string, unknown>;
  return { ...h, parent_id: int(o.parent_id), children: int(o.children), children_accepted: int(o.children_accepted) };
}

export const isSynonym = (t: Pick<TaxonHit, "id" | "accepted_id">) => t.accepted_id !== t.id;

/** search needs at least this many characters */
export const SEARCH_MIN = 2;

export function searchUrl(base: string, q: string, limit = 20): string {
  return `${base}taxon?q=${encodeURIComponent(q.trim())}&limit=${limit}`;
}

export function taxonUrl(base: string, id: number): string {
  return `${base}taxon/${id}`;
}

export function wormsUrl(id: number): string {
  return `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${id}`;
}

// subtree request ----

/** [west, south, east, north]; west > east crosses the antimeridian (the endpoint accepts it) */
export type Bbox = [number, number, number, number];

/** the view bounds plus a margin, rounded outward to `step` degrees, longitudes wrapped to
 * [-180, 180] (MapLibre world copies run past ±180). A view 360° wide or more is the globe. */
export function subtreeBbox(b: Bounds, margin = BBOX_MARGIN, step = BBOX_STEP): Bbox | null {
  const [w0, s0, e0, n0] = b;
  if (![w0, s0, e0, n0].every(Number.isFinite) || !(e0 > w0) || !(n0 > s0)) return null;
  const dx = (e0 - w0) * margin;
  const dy = (n0 - s0) * margin;
  const down = (x: number) => Math.floor(x / step) * step;
  const up = (x: number) => Math.ceil(x / step) * step;
  const s = Math.max(-90, down(s0 - dy));
  const n = Math.min(90, up(n0 + dy));
  let w = down(w0 - dx);
  let e = up(e0 + dx);
  if (e - w >= 360) return [-180, s, 180, n];
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180; // [-180, 180)
  w = wrap(w);
  e = wrap(e);
  if (e === -180) e = 180;
  return [w, s, e, n];
}

export interface SubtreeReq {
  aphiaid: number;
  res: number;
  decade?: number | null;
  bbox?: Bbox | null;
  format?: "parquet" | "json";
}

/** the request URL; parameters in a fixed order so equal requests share a cache entry. */
export function subtreeUrl(base: string, r: SubtreeReq): string {
  const p = [`aphiaid=${r.aphiaid}`, `res=${r.res}`];
  if (r.decade !== null && r.decade !== undefined) p.push(`decade=${r.decade}`);
  if (r.bbox) p.push(`bbox=${r.bbox.map((x) => Number(x.toFixed(4))).join(",")}`);
  if (r.format === "json") p.push("format=json");
  return `${base}subtree?${p.join("&")}`;
}

// fetch ----

export class H3tError extends Error {
  /** HTTP status, or 0 for a network failure / timeout */
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "H3tError";
    this.status = status;
  }
}

export interface SubtreeMeta {
  url: string;
  bytes: number;
  /** X-Rows (cells) */
  rows: number | null;
  /** X-Query-Ms: the server's query time */
  queryMs: number | null;
  /** the browser's round trip (request to last byte) */
  fetchMs: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** GET a subtree Parquet. Non-2xx and timeouts throw H3tError with the server's `reason`. */
export async function fetchSubtree(
  url: string,
  fetchFn: FetchLike = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ bytes: Uint8Array; meta: SubtreeMeta }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = now();
  try {
    let res: Response;
    try {
      res = await fetchFn(url, { signal: ctl.signal });
    } catch (err) {
      if (ctl.signal.aborted) throw new H3tError(0, `subtree service timed out after ${Math.round(timeoutMs / 1000)} s`);
      throw new H3tError(0, `subtree service unreachable${err instanceof Error ? `: ${err.message}` : ""}`);
    }
    if (!res.ok) {
      let reason = "";
      try {
        const j = (await res.json()) as { reason?: unknown; detail?: unknown };
        reason = text(j.reason) || text(j.detail);
      } catch {
        /* not JSON */
      }
      throw new H3tError(res.status, reason || `HTTP ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hdr = (k: string) => {
      const v = res.headers.get(k);
      return v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
    };
    return {
      bytes,
      meta: { url, bytes: bytes.byteLength, rows: hdr("x-rows"), queryMs: hdr("x-query-ms"), fetchMs: now() - t0 },
    };
  } catch (err) {
    if (err instanceof H3tError) throw err;
    if (ctl.signal.aborted) throw new H3tError(0, `subtree service timed out after ${Math.round(timeoutMs / 1000)} s`);
    throw new H3tError(0, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** is the service up? `/health` with a cache-busting parameter (so the Varnish cache cannot
 * answer for a dead origin), 8 s timeout. */
export async function probeH3t(base: string, fetchFn: FetchLike = fetch, timeoutMs = 8000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}health?t=${Date.now()}`, { signal: ctl.signal });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: unknown };
    return j.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// a view ----

export interface AphiaView {
  partition: Partition;
  /** the res served (lower than asked after a 413) */
  res: number;
  url: string;
  meta: SubtreeMeta;
  /** this call fetched the response (false: it came from the DuckDB cache) */
  fetched: boolean;
  /** one line when the served res differs from the requested one */
  notice: string;
}

/** response stats per request URL (the bytes live in DuckDB's part_cache, not here) */
const metaByUrl = new Map<string, SubtreeMeta>();
/** request URLs the endpoint refused with 413 (Varnish caches 4xx for 60 s; so do we) */
const tooBig = new Map<string, number>();

/**
 * Serve an AphiaID view at `res`: one global request for res < 6, the viewport bbox for res >= 6.
 * On 413 step down one res at a time (a global request again below 6) and say so; any other error
 * propagates as an H3tError.
 */
export async function loadAphiaView(
  engine: Engine,
  base: string,
  req: { aphiaid: number; res: number; decade: number | null; bounds: Bounds | null },
  fetchFn: FetchLike = fetch,
): Promise<AphiaView> {
  let last: H3tError | null = null;
  for (let r = req.res; r >= 1; r--) {
    const bbox = r >= BBOX_MIN_RES ? (req.bounds ? subtreeBbox(req.bounds) : null) : null;
    if (r >= BBOX_MIN_RES && !bbox) continue;
    const url = subtreeUrl(base, { aphiaid: req.aphiaid, res: r, decade: req.decade, bbox });
    const refused = tooBig.get(url);
    if (refused !== undefined && Date.now() - refused < 60_000) continue;
    try {
      let meta = metaByUrl.get(url);
      const p = await engine.loadRemote(url, async () => {
        const got = await fetchSubtree(url, fetchFn);
        metaByUrl.set(url, got.meta);
        meta = got.meta;
        return got.bytes;
      });
      meta ??= metaByUrl.get(url) ?? { url, bytes: 0, rows: p.rows, queryMs: null, fetchMs: 0 };
      const notice =
        r === req.res
          ? ""
          : req.res >= BBOX_MIN_RES
            ? `Over ${MAX_CELLS.toLocaleString("en-US")} cells at res ${req.res} in this view: showing res ${r}. Zoom in for res ${req.res}.`
            : `Over ${MAX_CELLS.toLocaleString("en-US")} cells at res ${req.res} (the service's cap): showing res ${r}.`;
      return { partition: p, res: r, url, meta, fetched: p.fetched, notice };
    } catch (err) {
      if (err instanceof H3tError && err.status === 413) {
        tooBig.set(url, Date.now());
        last = err;
        continue;
      }
      throw err;
    }
  }
  throw last ?? new H3tError(0, "no request possible for this view");
}

/** a one-line message for an error from the subtree service */
export function errorLine(err: unknown): string {
  if (err instanceof H3tError) {
    if (err.status === 413) return `Too many cells (over ${MAX_CELLS.toLocaleString("en-US")}): zoom in or choose a coarser resolution.`;
    if (err.status === 400) return `Subtree request refused: ${err.message}`;
    if (err.status === 504) return "Subtree query timed out on the server (60 s): zoom in or choose a coarser resolution.";
    return `Subtree service: ${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}
