// the release loader: where the data lives, the release.json health probe, and the metadata
// tables (files.parquet manifest, stats.parquet, taxon_groups.parquet) read through the engine.
import type { Engine } from "../engine/engine";
import { lit } from "../engine/sql";
import { statsKey, type Indicator, type LayerSel } from "../data/layers";
import { Manifest, type FileRow } from "./manifest";

/** the published release (path-style S3 URL: the bucket answers CORS with Range this way). */
export const PUBLIC_DATA_BASE =
  "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20260728/";

export interface ReleaseJson {
  release: string;
  obis_snapshot?: string;
  /** ISO UTC time the release was built (written by the exporter) */
  built_at?: string;
  res?: number[];
  res_decade?: number[];
  decades?: number[];
  layers: Record<string, { path: string; rows: number; files: number; bytes: number }>;
  [k: string]: unknown;
}

/**
 * The data base URL, normalized to end in "/": `?data=` on the page URL wins (an https URL, or a
 * same-origin path starting with "/"), then the build-time `VITE_DATA_BASE`, then the public
 * release. A relative value is resolved against `pageHref` because DuckDB-WASM needs absolute URLs.
 */
export function resolveDataBase(
  search: string,
  envBase: string | undefined,
  pageHref: string,
): string {
  const fromQuery = new URLSearchParams(search).get("data");
  for (const cand of [fromQuery, envBase]) {
    if (!cand) continue;
    if (!/^https:\/\//.test(cand) && !cand.startsWith("/")) continue;
    let url: URL;
    try {
      url = new URL(cand, pageHref);
    } catch {
      continue;
    }
    if (url.username || url.password || url.search || url.hash) continue;
    const href = url.href;
    return href.endsWith("/") ? href : `${href}/`;
  }
  return PUBLIC_DATA_BASE;
}

/** the health probe and release loader in one: GET release.json with a timeout. Never throws;
 * returns `{ ok: false, error }` for a network failure, a non-2xx or unparsable JSON. */
export async function probeRelease(
  base: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; release: ReleaseJson } | { ok: false; error: string }> {
  const f = opts.fetchImpl ?? fetch.bind(globalThis);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await f(`${base}release.json`, { signal: ctl.signal, cache: "no-cache" });
    if (!res.ok) return { ok: false, error: `release.json: HTTP ${res.status}` };
    const json = (await res.json()) as ReleaseJson;
    if (!json || typeof json.release !== "string" || typeof json.layers !== "object")
      return { ok: false, error: "release.json: unexpected shape" };
    return { ok: true, release: json };
  } catch (err) {
    return { ok: false, error: `release.json: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

export interface TaxonGroup {
  kind: string;
  rank: string;
  taxon: string;
  label: string;
  n: number;
}

export interface StatsRow {
  variable: string;
  min: number | null;
  p02: number | null;
  p50: number | null;
  p98: number | null;
  max: number | null;
  n_cells: number;
}

/** files.parquet → rows (int64 cast to DOUBLE so they arrive as JS numbers). */
export function filesSql(base: string): string {
  // `parent` is new in layout v2; the Manifest also reads it from the `p=` path segment, so a
  // release without the column (v1) loads the same way
  return `SELECT * EXCLUDE (rows, bytes), rows::DOUBLE AS rows, bytes::DOUBLE AS bytes
FROM read_parquet(${lit(`${base}files.parquet`)}, hive_partitioning = false)`;
}

export function statsTableSql(base: string): string {
  return `CREATE OR REPLACE TABLE stats AS
SELECT * FROM read_parquet(${lit(`${base}stats.parquet`)}, hive_partitioning = false)`;
}

export function taxonGroupsSql(base: string): string {
  return `SELECT kind, rank, taxon, label, n::DOUBLE AS n
FROM read_parquet(${lit(`${base}taxon_groups.parquet`)}, hive_partitioning = false)
WHERE kind IN ('taxon', 'eov')
ORDER BY kind DESC, rank, taxon`;
}

/** the release-wide stats row for one view (selection × decade × res × indicator). */
export function statsSql(
  layer: string,
  sel: LayerSel,
  decade: number | null,
  res: number,
  indicator: Indicator,
): string {
  const { key, rank } = statsKey(sel);
  return `SELECT variable, min, p02, p50, p98, max, n_cells::DOUBLE AS n_cells
FROM stats
WHERE layer = ${lit(layer)} AND coalesce(key, '') = ${lit(key)} AND coalesce(rank, '') = ${lit(rank)}
  AND ${decade === null ? "decade IS NULL" : `decade = ${lit(decade)}`}
  AND res = ${lit(res)} AND variable = ${lit(indicator)}`;
}

export interface ReleaseMeta {
  manifest: Manifest;
  /** the taxon groups (kind = 'taxon') */
  taxonGroups: TaxonGroup[];
  /** records per EOV (taxon_groups.parquet kind = 'eov'), keyed by EOV id */
  eovCounts: Record<string, number>;
  statsLoaded: boolean;
}

/** load the manifest (required), stats table and taxon groups (each optional: a release or a demo
 * store may lack them, and the app still maps the layers it has). */
export async function loadMeta(engine: Engine, base: string): Promise<ReleaseMeta> {
  const files = await engine.rows<FileRow>(filesSql(base));
  const manifest = new Manifest(files);
  let statsLoaded = false;
  try {
    await engine.query(statsTableSql(base));
    statsLoaded = true;
  } catch {
    statsLoaded = false;
  }
  let groups: TaxonGroup[] = [];
  if (manifest.hasLayer("taxon") || manifest.hasLayer("eov")) {
    groups = await engine.rows<TaxonGroup>(taxonGroupsSql(base)).catch(() => []);
  }
  const taxonGroups = groups.filter((g) => g.kind === "taxon");
  const eovCounts = Object.fromEntries(
    groups.filter((g) => g.kind === "eov").map((g) => [g.taxon, Number(g.n)]),
  );
  return { manifest, taxonGroups, eovCounts, statsLoaded };
}
