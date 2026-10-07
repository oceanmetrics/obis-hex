// the colour ramp: viridis between a robust domain (p02–p98), either the release's precomputed
// stats.parquet row for the view or the loaded partition's own quantiles.
import type { StatsRow } from "../release/release";

export type Rgb = [number, number, number];

/** viridis, 9 evenly spaced stops (matplotlib) */
export const VIRIDIS: Rgb[] = [
  [68, 1, 84],
  [71, 44, 122],
  [59, 81, 139],
  [44, 113, 142],
  [33, 144, 141],
  [39, 173, 129],
  [92, 200, 99],
  [170, 220, 50],
  [253, 231, 37],
];

export type Domain = [number, number];

/** colour for v within [lo, hi] (clamped). */
export function rampColor(v: number, [lo, hi]: Domain, stops: Rgb[] = VIRIDIS): Rgb {
  const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** the ramp domain from a stats row: [p02, p98]; falls back to [min, max] when the robust range is
 * degenerate or missing, and to null when there is nothing usable (n_cells = 0). */
export function domainFromStats(row: Pick<StatsRow, "min" | "p02" | "p98" | "max" | "n_cells"> | null | undefined): Domain | null {
  if (!row || !(row.n_cells > 0)) return null;
  const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
  if (ok(row.p02) && ok(row.p98) && row.p98 > row.p02) return [row.p02, row.p98];
  if (ok(row.min) && ok(row.max) && row.max > row.min) return [row.min, row.max];
  if (ok(row.min)) return [row.min, row.min];
  return null;
}

/** continuous quantile on sorted values (type 7, the same as R's default and DuckDB quantile_cont). */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export interface ViewStats {
  cells: number;
  valued: number;
  min: number;
  p02: number;
  p50: number;
  p98: number;
  max: number;
}

/** summary of the values loaded for the view (NaN = NULL, excluded). */
export function viewStats(values: Float64Array): ViewStats {
  const v = values.filter((x) => !Number.isNaN(x)).sort();
  return {
    cells: values.length,
    valued: v.length,
    min: v.length ? v[0] : NaN,
    p02: quantileSorted(v, 0.02),
    p50: quantileSorted(v, 0.5),
    p98: quantileSorted(v, 0.98),
    max: v.length ? v[v.length - 1] : NaN,
  };
}

/** the domain to colour with: the release stats row when asked for and available, else the
 * view's own p02–p98. */
export function chooseDomain(
  mode: "release" | "view",
  release: Domain | null,
  view: ViewStats | null,
): Domain | null {
  if (mode === "release" && release) return release;
  if (!view || view.valued === 0) return release;
  return domainFromStats({
    min: view.min,
    p02: view.p02,
    p98: view.p98,
    max: view.max,
    n_cells: view.valued,
  });
}
