// SQL literal quoting and the few query builders the app runs. Every user-chosen value reaches SQL
// only through lit(); identifiers are fixed strings from this module.
import type { Indicator } from "../data/layers";

export type LiteralValue = string | number | null;

/** a SQL literal: strings single-quoted with quotes doubled, finite numbers bare, else NULL. */
export function lit(v: LiteralValue): string {
  if (v === null) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`lit(): non-finite number ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

/** the indicator columns loaded for every partition (one fetch serves all five indicators). BIGINT
 * columns are cast to DOUBLE and NULLs become NaN so each column arrives as a Float64Array. */
export const VALUE_COLUMNS: Indicator[] = ["n", "sp", "shannon", "simpson", "es"];

/** the one query that reads a partition: one Parquet file, read over HTTP by DuckDB-WASM. */
export function partitionSql(url: string): string {
  const cols = VALUE_COLUMNS.map((c) => `  coalesce(${c}::DOUBLE, 'NaN'::DOUBLE) AS ${c}`).join(
    ",\n",
  );
  return `SELECT\n  h3,\n${cols}\nFROM read_parquet(${lit(url)}, hive_partitioning = false)`;
}

/** the user-facing version of the partition query for the SQL panel: the selected indicator only,
 * runnable as-is in DuckDB (CLI, R, Python) against the same URL. */
export function displaySql(url: string, indicator: Indicator): string {
  return `SELECT h3, ${indicator}\nFROM read_parquet(${lit(url)}, hive_partitioning = false)\nWHERE ${indicator} IS NOT NULL;`;
}
