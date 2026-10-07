// viewport loading for split resolutions (layout v2): which parent partitions cover the map view,
// and the view plan (the resolution actually served, its files, and a notice when the requested
// resolution would need too many partitions and a coarser one is served instead).
import {
  getHexagonAreaAvg,
  gridDisk,
  latLngToCell,
  polygonToCells,
  polygonToCellsExperimental,
  POLYGON_TO_CELLS_FLAGS,
} from "h3-js";
import type { LayerSel } from "../data/layers";
import type { FileRow, Manifest } from "../release/manifest";

/** [west, south, east, north] in degrees; west/east may run past ±180 (MapLibre world copies). */
export type Bounds = [number, number, number, number];

/** the most parent partitions one view may load before falling back to a coarser resolution. */
export const MAX_PARENTS = 64;

const EARTH_KM2 = 4 * Math.PI * 6371.0088 ** 2;

/** the view bounds as [lat, lng] rings within [-180, 180], each at most 90° wide (H3 polygon
 * edges must stay well under 180°); a view 360° wide or more is the whole world. */
export function boundsRings(b: Bounds): [number, number][][] {
  let [w, s, e, n] = b;
  s = Math.max(-89.9, Math.min(89.9, s));
  n = Math.max(-89.9, Math.min(89.9, n));
  if (!(n > s) || !(e > w)) return [];
  const spans: [number, number][] = [];
  if (e - w >= 360) spans.push([-180, 180]);
  else {
    const k = Math.floor((w + 180) / 360);
    w -= k * 360;
    e -= k * 360;
    if (e <= 180) spans.push([w, e]);
    else spans.push([w, 180], [-180, e - 360]);
  }
  const rings: [number, number][][] = [];
  for (const [a, z] of spans) {
    for (let x = a; x < z; x += 90) {
      const x2 = Math.min(z, x + 90);
      rings.push([
        [s, x],
        [n, x],
        [n, x2],
        [s, x2],
      ]);
    }
  }
  return rings;
}

/** a rough count of cells at `res` inside the bounds (spherical box area / mean cell area). */
export function estimateCells(b: Bounds, res: number): number {
  const s = Math.max(-90, b[1]) * (Math.PI / 180);
  const n = Math.min(90, b[3]) * (Math.PI / 180);
  const dLon = Math.min(360, b[2] - b[0]) * (Math.PI / 180);
  const frac = (dLon * Math.abs(Math.sin(n) - Math.sin(s))) / (4 * Math.PI);
  return (frac * EARTH_KM2) / getHexagonAreaAvg(res, "km2");
}

/** the ring added around the centre-cover: 1 for parents at res >= 2; none for the huge base
 * (res 0) and res-1 parents of the taxon layer, where a ring would load up to 7 continent-sized
 * partitions for a small view; those use H3's "overlapping" containment instead. */
export const coverRing = (res: number) => (res >= 2 ? 1 : 0);

/**
 * The cells at `res` covering the bounds: polygonToCells (cell centres inside the view) plus a
 * ring of `ring` cells, so a cell that only clips the view edge is included; with `ring` 0, the
 * cells overlapping the view (polygonToCellsExperimental, containmentOverlapping). Returns null
 * when the view clearly holds more than `limit` cells (checked before any cell is computed).
 */
export function coverCells(
  b: Bounds,
  res: number,
  limit: number,
  ring = coverRing(res),
): string[] | null {
  if (estimateCells(b, res) > limit * 4) return null;
  const core = new Set<string>();
  for (const r of boundsRings(b)) {
    const cells =
      ring > 0
        ? polygonToCells(r, res)
        : polygonToCellsExperimental(r, res, POLYGON_TO_CELLS_FLAGS.containmentOverlapping);
    for (const c of cells) core.add(c);
  }
  if (core.size > limit * 4) return null;
  // a view smaller than one cell may hold no cell centre: seed with the cell at its centre
  if (!core.size) {
    const rings = boundsRings(b);
    if (rings.length) {
      const [[s, w], , [n, e]] = rings[0];
      core.add(latLngToCell((s + n) / 2, (w + e) / 2, res));
    }
  }
  const out = new Set<string>(core);
  if (ring > 0) for (const c of core) for (const d of gridDisk(c, ring)) out.add(d);
  return [...out];
}

export interface ViewPlan {
  /** the resolution served */
  res: number;
  /** the files to load: one whole file, or the parent partitions covering the view */
  files: FileRow[];
  /** true when `files` are parent partitions of a split resolution */
  split: boolean;
  /** parent partitions available for this res in the release (0 when whole) */
  parentsTotal: number;
  /** a one-line explanation when the served res differs from the requested one */
  notice: string;
}

/**
 * Resolve a view to files. A whole resolution is one file. A split resolution loads the parent
 * partitions covering the bounds that exist in the release; when that is more than `cap`, step
 * down one resolution at a time (a whole file always ends the search).
 */
export function planView(
  manifest: Manifest,
  sel: LayerSel,
  decade: number | null,
  res: number,
  bounds: Bounds | null,
  cap: number = MAX_PARENTS,
): ViewPlan | null {
  const notice = (r: number) =>
    r === res
      ? ""
      : `Res ${res} needs more than ${cap} partitions for this view: showing res ${r}. Zoom in for res ${res}.`;
  for (let r = res; r >= 1; r--) {
    const vf = manifest.view(sel, decade, r);
    if (!vf) {
      if (r === res) return null;
      continue;
    }
    if (vf.whole && !vf.parents)
      return { res: r, files: [vf.whole], split: false, parentsTotal: 0, notice: notice(r) };
    if (!vf.parents || vf.parentRes === null || !bounds) continue;
    const cover = coverCells(bounds, vf.parentRes, cap);
    if (cover) {
      const files = cover.flatMap((c) => vf.parents!.get(c) ?? []);
      if (files.length <= cap) {
        files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        return { res: r, files, split: true, parentsTotal: vf.parents.size, notice: notice(r) };
      }
    }
  }
  return null;
}
