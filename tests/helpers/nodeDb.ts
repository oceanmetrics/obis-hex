// a Node DuckDB-WASM (the same 1.32.0 package, its node-blocking bundle) shaped as the engine's
// DbLike, so engine tests run the exact SQL the browser runs, on local files.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ArrowTableLike, DbLike } from "../../src/lib/engine/engine";

const require = createRequire(import.meta.url);

export async function createNodeDb(): Promise<DbLike> {
  const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
  const dist = dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs"));
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: join(dist, "duckdb-mvp.wasm"), mainWorker: "" },
      eh: { mainModule: join(dist, "duckdb-eh.wasm"), mainWorker: "" },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  const conn = db.connect();
  return {
    query: (sql: string) => conn.query(sql) as ArrowTableLike,
    close: async () => {
      conn.close();
    },
  };
}
