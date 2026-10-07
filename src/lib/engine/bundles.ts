// self-hosted DuckDB-WASM bundles, copied from MarineSensitivity/atlas (src/lib/engine/bundles.ts).
// Pinned to exactly 1.32.0 (atlas spike S1: 1.33.x dev builds break OPFS persistence; a caret
// would admit them). `mvp` and `eh` wasm/worker files are self-hosted via `?url` imports, no CDN,
// and this module is only ever reached through a dynamic import() so it stays off the critical
// path (scripts/size-budget.mjs checks that). The worker is constructed by hand from the
// same-origin URL: never a blob worker (instantiate() hangs) and never the cross-origin-isolated
// bundle (GitHub Pages cannot send COOP/COEP).
import * as duckdb from "@duckdb/duckdb-wasm";
import mvpWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvpWasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import ehWasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import type { DbLike } from "./engine";

export const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasmUrl, mainWorker: mvpWorkerUrl },
  eh: { mainModule: ehWasmUrl, mainWorker: ehWorkerUrl },
};

/** boot an AsyncDuckDB in its own Web Worker and return the one connection the engine uses. */
export async function createBrowserDb(): Promise<DbLike> {
  const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
  if (!bundle.mainWorker) throw new Error("selectBundle(): selected bundle has no mainWorker");
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  return {
    query: (sql: string) => conn.query(sql),
    close: async () => {
      await conn.close();
      await db.terminate();
      worker.terminate();
    },
  };
}
