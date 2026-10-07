import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "./package.json" with { type: "json" };

// local release for development: `npm run dev:local` serves this directory at /local-data/ (with
// HTTP Range, which DuckDB-WASM's read_parquet uses), laid out exactly like the S3 release.
const LOCAL_DATA_DIR = resolve(
  process.env.OBIS_H3_LOCAL ?? join(homedir(), "data", "obis-h3-demo", "demo"),
);

function localData(): Plugin {
  return {
    name: "obis-hex-local-data",
    configureServer(server) {
      server.middlewares.use("/obis-hex/local-data", (req, res, next) => {
        // the stored names are percent-encoded on disk (taxon=Foo%20bar), so decode the URL once
        const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(
          /^(\.\.[/\\])+/,
          "",
        );
        const file = join(LOCAL_DATA_DIR, rel);
        if (!file.startsWith(LOCAL_DATA_DIR) || !existsSync(file) || statSync(file).isDirectory())
          return next();
        const size = statSync(file).size;
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
        res.setHeader(
          "Content-Type",
          file.endsWith(".json") ? "application/json" : "application/octet-stream",
        );
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
        if (m) {
          const start = m[1] ? Number(m[1]) : size - Number(m[2]);
          const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          res.setHeader("Content-Length", String(end - start + 1));
          if (req.method === "HEAD") return res.end();
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader("Content-Length", String(size));
          if (req.method === "HEAD") return res.end();
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

// GitHub Pages project page: https://oceanmetrics.io/obis-hex/
export default defineConfig({
  base: "/obis-hex/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [svelte(), localData()],
  optimizeDeps: {
    // duckdb-wasm ships its own worker + wasm and the dep optimizer breaks it (atlas, CalCOFI explore)
    exclude: ["@duckdb/duckdb-wasm"],
  },
  build: {
    target: "es2022",
    manifest: true, // scripts/size-budget.mjs reads dist/.vite/manifest.json
    chunkSizeWarningLimit: 2000,
  },
});
