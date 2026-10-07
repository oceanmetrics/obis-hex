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

const valueCols = () =>
  VALUE_COLUMNS.map((c) => `  coalesce(${c}::DOUBLE, 'NaN'::DOUBLE) AS ${c}`).join(",\n");

/** the DuckDB table holding the loaded parent partitions (layout v2), one row per cell, tagged
 * with the URL it came from. */
export const CACHE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS part_cache (
  url VARCHAR, h3 VARCHAR, ${VALUE_COLUMNS.map((c) => `${c} DOUBLE`).join(", ")})`;

/** fetch parent partitions into part_cache in one read (DuckDB's `filename` is the URL given). */
export function cacheInsertSql(urls: string[]): string {
  return `INSERT INTO part_cache
SELECT
  filename AS url,
  h3,
${valueCols()}
FROM read_parquet([${urls.map(lit).join(", ")}], hive_partitioning = false, filename = true)`;
}

/** the union of the cached parent partitions a view needs. */
export function unionSql(urls: string[]): string {
  return `SELECT h3, ${VALUE_COLUMNS.join(", ")}
FROM part_cache
WHERE url IN (${urls.map(lit).join(", ")})`;
}

/** the user-facing SQL for a split view: the same files, read directly. */
export function displayUnionSql(urls: string[], indicator: Indicator): string {
  const list = urls.map((u) => `  ${lit(u)}`).join(",\n");
  return `SELECT h3, ${indicator}\nFROM read_parquet([\n${list}\n], hive_partitioning = false)\nWHERE ${indicator} IS NOT NULL;`;
}
