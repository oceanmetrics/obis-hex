// records per decade for the Time strip: the sum of `n` over the res-1 cells of each decade
// partition (a record falls in exactly one cell, so the sum is the record count). DuckDB reads only
// the `n` column chunk and the footer of each small file, and the result is cached per layer, so
// the strip costs one cheap query when the layer changes and nothing when the view moves.
import { fileUrl, type FileRow, type Manifest } from "./manifest";
import { lit } from "../engine/sql";
import { DECADES } from "../state/url";
import type { LayerSel } from "../data/layers";

export interface DecadeCount {
  /** null = all years (records with no year included) */
  decade: number | null;
  n: number;
}

/** the res-1 files to sum for a selection: one per decade, plus the all-years file when
 * `withTotal`; empty when the release has no decade layer for it (taxon groups, live layers). */
export function decadeFiles(
  manifest: Manifest,
  sel: LayerSel,
  withTotal = false,
): { decade: number | null; file: FileRow }[] {
  if (sel.kind !== "all" && sel.kind !== "eov") return [];
  const out: { decade: number | null; file: FileRow }[] = [];
  for (const d of DECADES) {
    const f = manifest.lookup(sel, d, 1);
    if (f) out.push({ decade: d, file: f });
  }
  if (withTotal) {
    const f = manifest.lookup(sel, null, 1);
    if (f) out.push({ decade: null, file: f });
  }
  return out;
}

/** one query for the counts: a UNION ALL of `sum(n)` per file, keyed by its decade */
export function decadeCountsSql(base: string, files: { decade: number | null; file: FileRow }[]): string {
  return files
    .map(
      ({ decade, file }) =>
        `SELECT ${decade === null ? "NULL::INTEGER" : lit(decade)} AS decade, coalesce(sum(n), 0)::DOUBLE AS n FROM read_parquet(${lit(fileUrl(base, file))}, hive_partitioning = false)`,
    )
    .join("\nUNION ALL\n");
}

/** the rows in decade order, each decade present (0 where the release has no partition) */
export function normalizeCounts(rows: { decade: number | null; n: number }[]): {
  decades: DecadeCount[];
  total: number | null;
} {
  const by = new Map(rows.filter((r) => r.decade !== null).map((r) => [Number(r.decade), Number(r.n)]));
  const tot = rows.find((r) => r.decade === null);
  return {
    decades: DECADES.map((d) => ({ decade: d, n: by.get(d) ?? 0 })),
    total: tot ? Number(tot.n) : null,
  };
}

/** the decade under a brush: the decade holding the brush's midpoint, on a domain of
 * [first decade, last decade + 10) */
export function decadeAt(v0: number, v1: number): number {
  const mid = (v0 + v1) / 2;
  const first = DECADES[0];
  const last = DECADES[DECADES.length - 1];
  const d = Math.floor(mid / 10) * 10;
  return Math.max(first, Math.min(last, d));
}

/** the brush span [f0, f1] (fractions of the strip) for a decade */
export function decadeSpan(decade: number): [number, number] {
  const first = DECADES[0];
  const span = DECADES.length * 10;
  return [(decade - first) / span, (decade - first + 10) / span];
}

export const DECADE_DOMAIN: [number, number] = [DECADES[0], DECADES[DECADES.length - 1] + 10];
