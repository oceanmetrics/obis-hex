import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";
import { build, defineConfig, type Plugin } from "vite";
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

// the redirect page's codec (2026-10-23): public/redirect/ holds the page template, and this bundles src/lib/redirect.ts
// into dist/redirect/codec.js beside it, so the page can ask the app where a link lives in Ocean Metrics. The page ships
// at /obis-hex/redirect/redirect.html and nothing forwards to it until index.html does (docs/redirects.md, "Activation").
// tests/redirectPage.test.ts builds the same bundle and drives the page's decide() with it.
function redirectCodec(): Plugin {
  let outDir = "dist";
  return {
    name: "redirect-codec",
    apply: "build",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: "warn",
        publicDir: false,
        build: {
          target: "es2022",
          emptyOutDir: false,
          outDir: join(outDir, "redirect"),
          lib: {
            entry: resolve(import.meta.dirname, "src/lib/redirect.ts"),
            formats: ["es"],
            fileName: () => "codec.js",
          },
        },
      });
    },
  };
}

// GitHub Pages project page: https://oceanmetrics.io/obis-hex/
export default defineConfig({
  base: "/obis-hex/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [svelte(), localData(), redirectCodec()],
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
