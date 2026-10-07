// files.parquet is the release's manifest: HTTP cannot glob, so every partition is resolved
// through it rather than by building a URL from a template.
//
// Percent-encoding: DuckDB writes hive partition values percent-encoded on disk (a taxon
// "Apicomplexa incertae sedis" is stored under `taxon=Apicomplexa%20incertae%20sedis`), so the
// S3 object key itself contains "%20". Fetching it over HTTP needs that "%" encoded again
// (`%2520`), which is what the manifest's `url_path` column holds. This module never re-implements
// either encoding: it indexes each row by its DECODED partition values, so a lookup by
// (layer, key, rank, decade, res) with plain names finds the row, and the caller fetches the row's
// `url_path` verbatim.
//
// Layout v2 (obisindicators 0.7.1): the fine resolutions of big layers are split one file per
// parent cell, `.../res=7/p=<parent h3>/data_0.parquet`. Such a view resolves to a ViewFiles with
// `parents` (parent cell → row) instead of one `whole` row; the parent resolution is read off the
// parent cells themselves, so the app needs no layout constants and a release may mix both forms.
import { getResolution } from "h3-js";
import { manifestLayer, type LayerSel } from "../data/layers";

export interface FileRow {
  layer: string;
  path: string;
  url_path: string;
  rows: number;
  bytes: number;
  /** the parent cell of a split partition (files.parquet `parent`, or `p=` in the path), else null */
  parent?: string | null;
}

/** the files serving one view (layer × key × decade × res): one whole file, or parent partitions. */
export interface ViewFiles {
  whole: FileRow | null;
  /** parent cell → file, for a split resolution */
  parents: Map<string, FileRow> | null;
  /** the H3 resolution of the parent cells (null when whole) */
  parentRes: number | null;
  rows: number;
  bytes: number;
}

/** partition values from a stored path, decoded: `taxon/rank=class/taxon=A%20b/res=3/data_0.parquet`
 * → { rank: "class", taxon: "A b", res: "3" }. */
export function partitionValues(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of path.split("/")) {
    const i = seg.indexOf("=");
    if (i <= 0) continue;
    const raw = seg.slice(i + 1);
    let v = raw;
    try {
      v = decodeURIComponent(raw);
    } catch {
      v = raw;
    }
    out[seg.slice(0, i)] = v;
  }
  return out;
}

function indexKey(
  layer: string,
  v: { eov?: string; rank?: string; taxon?: string; decade?: string | number; res?: string | number },
): string {
  return [layer, v.eov ?? "", v.rank ?? "", v.taxon ?? "", v.decade ?? "", v.res ?? ""].join("\u0001");
}

export class Manifest {
  readonly rows: FileRow[];
  readonly layers: Set<string>;
  #index = new Map<string, ViewFiles>();

  constructor(rows: FileRow[]) {
    this.rows = rows;
    this.layers = new Set(rows.map((r) => r.layer));
    for (const r of rows) {
      const v = partitionValues(r.path);
      if (v.res === undefined) continue; // meta files (stats/taxon_groups)
      const k = indexKey(r.layer, v);
      const parent = r.parent || v.p || null;
      let vf = this.#index.get(k);
      if (!vf) {
        vf = { whole: null, parents: null, parentRes: null, rows: 0, bytes: 0 };
        this.#index.set(k, vf);
      }
      vf.rows += r.rows;
      vf.bytes += r.bytes;
      if (parent) {
        vf.parents ??= new Map();
        vf.parents.set(parent, r);
        if (vf.parentRes === null) {
          try {
            vf.parentRes = getResolution(parent);
          } catch {
            vf.parentRes = null;
          }
        }
      } else vf.whole = r;
    }
  }

  hasLayer(layer: string): boolean {
    return this.layers.has(layer);
  }

  /** the files serving (selection, decade, res), or null when the release has none. */
  view(sel: LayerSel, decade: number | null, res: number): ViewFiles | null {
    const layer = manifestLayer(sel, decade);
    if (!layer) return null;
    const v: Record<string, string | number> = { res };
    if (decade !== null) v.decade = decade;
    if (sel.kind === "eov") v.eov = sel.eov;
    if (sel.kind === "taxon") {
      v.rank = sel.rank;
      v.taxon = sel.taxon;
    }
    return this.#index.get(indexKey(layer, v)) ?? null;
  }

  /** the one whole file serving (selection, decade, res); null when there is none or the
   * resolution is split by parent cell (use view()). */
  lookup(sel: LayerSel, decade: number | null, res: number): FileRow | null {
    return this.view(sel, decade, res)?.whole ?? null;
  }

  /** the resolutions available for a selection and period, ascending. */
  resolutions(sel: LayerSel, decade: number | null): number[] {
    const out: number[] = [];
    for (let r = 1; r <= 7; r++) if (this.view(sel, decade, r)) out.push(r);
    return out;
  }
}

/** absolute URL of a manifest row under a release base (which ends in "/"). */
export function fileUrl(base: string, row: FileRow): string {
  return base + row.url_path;
}
