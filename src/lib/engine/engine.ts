// the data engine: one DuckDB-WASM connection (in its own Web Worker in the browser), every query
// serialized on one promise chain (the atlas/CalCOFI explore lesson: a query issued before an
// earlier async step finished was a real shipped bug), and an in-memory cache of loaded
// partitions keyed by URL so revisiting a view never refetches.
//
// Dependency-injectable: `createDb` defaults to the browser boot (bundles.ts, reached only through
// a dynamic import so DuckDB stays off the critical path); tests pass a Node DuckDB-WASM instead.
import { cacheInsertSql, partitionSql, unionSql, VALUE_COLUMNS, CACHE_TABLE_SQL } from "./sql";
import { lit } from "./sql";
import type { Indicator } from "../data/layers";

/** the slice of an Arrow vector/table this module reads (structural, so no arrow import). */
export interface ArrowVectorLike {
  toArray(): ArrayLike<unknown>;
}
export interface ArrowTableLike {
  numRows: number;
  getChild(name: string): ArrowVectorLike | null;
  toArray(): ArrayLike<{ toJSON(): Record<string, unknown> } | Record<string, unknown>>;
}
export interface DbLike {
  query(sql: string): Promise<ArrowTableLike> | ArrowTableLike;
  close(): Promise<void>;
}

/** one loaded partition (or the union of several), columnar, ready for deck.gl. */
export interface Partition {
  /** identity: the file URL, or for a union a key over its sorted URLs */
  url: string;
  sql: string;
  rows: number;
  h3: string[];
  values: Record<Indicator, Float64Array>;
  /** wall time of the read (ms), measured once when the partition was first loaded. */
  ms: number;
}

export class EngineError extends Error {
  constructor(message: string, cause?: unknown) {
    super(cause instanceof Error ? `${message}: ${cause.message}` : message);
    this.name = "EngineError";
  }
}

function toPartition(url: string, sql: string, t: ArrowTableLike, ms: number): Partition {
  const h3 = Array.from(t.getChild("h3")?.toArray() ?? [], String);
  const values = {} as Record<Indicator, Float64Array>;
  for (const c of VALUE_COLUMNS) {
    const v = t.getChild(c)?.toArray();
    values[c] = v instanceof Float64Array ? v : Float64Array.from(v ?? [], Number);
  }
  return { url, sql, rows: t.numRows, h3, values, ms };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Engine {
  #createDb: () => Promise<DbLike>;
  #db: Promise<DbLike> | null = null;
  #chain: Promise<unknown> = Promise.resolve();
  #cache = new Map<string, Promise<Partition>>();
  /** parent partitions held in the DuckDB `part_cache` table, URL → last use (LRU) */
  #parts = new Map<string, number>();
  #useClock = 0;
  #cacheTable: Promise<unknown> | null = null;
  /** max parent partitions kept in DuckDB before the least recently used are deleted */
  maxCachedParts = 512;

  constructor(opts: { createDb?: () => Promise<DbLike> } = {}) {
    this.#createDb =
      opts.createDb ?? (async () => (await import("./bundles")).createBrowserDb());
  }

  /** idempotent boot; a failed boot is not cached, so the next call retries. */
  boot(): Promise<DbLike> {
    if (!this.#db) {
      this.#db = this.#createDb().catch((err) => {
        this.#db = null;
        throw new EngineError("data engine unavailable", err);
      });
    }
    return this.#db;
  }

  /** run one query (after every earlier one has settled) and return the Arrow table. */
  query(sql: string): Promise<ArrowTableLike> {
    return this.#enqueue(async () => {
      const db = await this.boot();
      try {
        return await db.query(sql);
      } catch (err) {
        throw new EngineError("query failed", err);
      }
    });
  }

  /** run one query and return plain row objects (for the small metadata tables). */
  async rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const t = await this.query(sql);
    return Array.from(t.toArray(), (r) =>
      typeof (r as { toJSON?: unknown }).toJSON === "function"
        ? ((r as { toJSON(): Record<string, unknown> }).toJSON() as T)
        : (r as T),
    );
  }

  /** is this partition already loaded (or loading)? */
  has(url: string): boolean {
    return this.#cache.has(url);
  }

  get cacheSize(): number {
    return this.#cache.size;
  }

  /** load one partition by URL, cached by that URL. A failed load is evicted so it can be retried. */
  loadPartition(url: string): Promise<Partition> {
    const hit = this.#cache.get(url);
    if (hit) return hit;
    const p = (async (): Promise<Partition> => {
      const sql = partitionSql(url);
      const t0 = now();
      const t = await this.query(sql);
      return toPartition(url, sql, t, now() - t0);
    })();
    this.#cache.set(url, p);
    p.catch(() => this.#cache.delete(url));
    return p;
  }

  /** how many parent partitions are held in DuckDB */
  get partsCached(): number {
    return this.#parts.size;
  }

  /**
   * Load a set of parent partitions and return their UNION ALL as one Partition. Each file is
   * fetched once and kept in the DuckDB table `part_cache` (keyed by URL), so panning fetches
   * only the partitions new to the view; the union itself is a local query. `fetched` lists the
   * URLs this call had to read.
   */
  async loadUnion(urls: string[]): Promise<Partition & { fetched: string[] }> {
    const sorted = [...new Set(urls)].sort();
    const t0 = now();
    this.#cacheTable ??= this.query(CACHE_TABLE_SQL).catch((err) => {
      this.#cacheTable = null;
      throw err;
    });
    await this.#cacheTable;
    const missing = sorted.filter((u) => !this.#parts.has(u));
    if (missing.length) {
      await this.query(cacheInsertSql(missing));
      for (const u of missing) this.#parts.set(u, 0);
    }
    const tick = ++this.#useClock;
    for (const u of sorted) this.#parts.set(u, tick);
    await this.#evict(new Set(sorted));
    const sql = unionSql(sorted);
    const t = await this.query(sql);
    return { ...toPartition(`union:${sorted.join("|")}`, sql, t, now() - t0), fetched: missing };
  }

  async #evict(keep: Set<string>): Promise<void> {
    if (this.#parts.size <= this.maxCachedParts) return;
    const old = [...this.#parts.entries()]
      .filter(([u]) => !keep.has(u))
      .sort((a, b) => a[1] - b[1])
      .slice(0, this.#parts.size - this.maxCachedParts)
      .map(([u]) => u);
    if (!old.length) return;
    await this.query(`DELETE FROM part_cache WHERE url IN (${old.map(lit).join(", ")})`);
    for (const u of old) this.#parts.delete(u);
  }

  async dispose(): Promise<void> {
    await this.#chain.catch(() => {});
    const db = await this.#db?.catch(() => null);
    await db?.close().catch(() => {});
    this.#db = null;
    this.#cache.clear();
    this.#parts.clear();
    this.#cacheTable = null;
  }

  #enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#chain.then(fn, fn);
    this.#chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
