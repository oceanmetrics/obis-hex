// size-budget core, copied from MarineSensitivity/atlas (scripts/size-budget-core.mjs) with this
// app's own numbers. Dependency-free and disk-free so tests/sizeBudget.test.ts can exercise it with a
// synthetic manifest; scripts/size-budget.mjs is the CLI run against a real `vite build` in CI.
//
// It fails when the critical path (everything index.html loads through STATIC imports, before
// first interaction) exceeds the static budget, when the runtime workers referenced from it exceed
// theirs, or when a chunk that must stay lazy (DuckDB-WASM: its JS, workers and ~8 MB gzip wasm)
// shows up in the static graph. `dynamicImports` are never walked: that is the escape hatch that
// keeps DuckDB lazy.
import { gzipSync } from "node:zlib";
import { posix } from "node:path";

// measured 2026-10-07 (0.1.0): MapLibre GL 6.10 + deck.gl 9.4 (core, layers, geo-layers H3, mapbox
// overlay) + h3-js + Svelte 5 + the app = 593 KB gzip; MapLibre alone is ~290 KB of that (atlas
// S2.md), deck.gl + h3-js most of the rest. 650 KB leaves ~75 KB headroom for the app to grow.
export const CRITICAL_BUDGET_BYTES = 650 * 1024;
// fonts and images in the static graph (0.4.0, @marinebon/ui): the kit's self-hosted woff2 (IBM Plex
// Sans/Mono, Space Grotesk; ~525 KB for all nine faces, of which a browser fetches only the faces the
// page uses) and the MBON wordmark PNGs (~24 KB). They are already compressed, never parsed as script,
// and load in parallel with the JS, so they get their own budget instead of eating the code's.
export const FONT_IMAGE_BUDGET_BYTES = 600 * 1024;
export const FONT_IMAGE_RE = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg)$/i;
// maplibre-gl's own worker, ~144 KB gzip (atlas S2.md); DuckDB's workers are lazy and never counted.
export const RUNTIME_WORKER_BUDGET_BYTES = 150 * 1024;

// substrings that must never appear in the static graph: the duckdb-wasm bundle's own module and
// asset names (found in its JS chunk). Not plain "duckdb": the footer names "DuckDB-WASM" as prose.
// "fontEmbedCSS" is html-to-image's (the feedback screenshot, 0.5.0): an option name that survives
// minification and appears in no other dependency, so a static import of it fails the build.
export const FORBIDDEN_LAZY_MARKERS = ["duckdb-browser", "duckdb-mvp", "duckdb-eh", "fontEmbedCSS"];

/**
 * Walk a Vite manifest from `entryKey`, following only STATIC `imports` (never `dynamicImports`),
 * collecting every JS/CSS/asset file reachable that way.
 * @param {Record<string, any>} manifest
 * @param {string} entryKey
 */
export function collectStaticGraph(manifest, entryKey) {
  const visitedKeys = new Set();
  const files = new Set();
  const stack = [entryKey];

  while (stack.length) {
    const key = stack.pop();
    if (visitedKeys.has(key)) continue;
    visitedKeys.add(key);

    const rec = manifest[key];
    if (!rec) continue;

    if (rec.file) files.add(rec.file);
    for (const c of rec.css ?? []) files.add(c);
    for (const a of rec.assets ?? []) files.add(a);
    for (const imp of rec.imports ?? []) stack.push(imp); // static only — dynamicImports excluded on purpose
  }

  return { visitedKeys, files };
}

// A marker must start a TOKEN, not merely appear inside one (atlas-map, 2026-09-22). Found the
// moment maplibre-gl first entered the static graph: minified maplibre contains `dashPositions`,
// whose lowercased form is `da-shp-ositions`, so the three-letter `shp` marker matched it and the
// budget FAILED on a dependency that has nothing to do with shpjs. The lookbehind keeps every real
// case (`shpjs`, `shp.js`, `"shp"`, `@duckdb/duckdb-wasm`, `Treemap-abc.js`) and drops the
// substring-inside-a-word class of false positive. Regression test:
// tests/size-budget.test.ts, "dashPositions does not trip the shp marker".
const markerRe = (marker) =>
  new RegExp(`(?<![a-z0-9])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

/**
 * @param {Map<string, string>} fileContents relative path -> utf8 text
 * @param {Iterable<string>} [markers] defaults to {@link FORBIDDEN_LAZY_MARKERS}. atlas-7: report.html's
 *   provenance section legitimately NAMES the (still dynamically-imported) `@duckdb/duckdb-wasm`
 *   engine's version as PROSE ("DuckDB-WASM 1.32.0") and `buildReport()`'s own `duckdbWasm` field
 *   (src/lib/report/{model,provenance}.ts, atlas-7 step 1) is a plain object property, not a bundled
 *   package -- text this checker cannot tell apart from an actually-inlined dependency by a substring
 *   scan alone. `size-budget.mjs`'s `--allow-marker` lets ONE entry's invocation drop specific
 *   markers from this scan; the entry-specific wiring test
 *   (`tests/report-lazy-import-duckdb.wiring.test.ts`) is what still proves the REAL package/chunk
 *   never enters report.html's static graph, so dropping the marker here does not remove the
 *   invariant, only the blunt heuristic for it.
 */
export function findForbiddenMarkers(fileContents, markers = FORBIDDEN_LAZY_MARKERS) {
  const hits = [];
  for (const [path, content] of fileContents) {
    const lower = content.toLowerCase();
    for (const marker of markers) {
      if (markerRe(marker).test(lower)) hits.push({ path, marker });
    }
  }
  return hits;
}

export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

// the compiled form of a Vite/Rolldown `?worker&url` import (also what a hand-written
// `new Worker(new URL("./w.ts", import.meta.url))` compiles to): `new URL("<file>.js", import.meta.url)`
// with the file name as a sibling of the referencing chunk. Confirmed against a real
// `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` build (backticked in Rolldown's output, e.g.
// `` new URL(`maplibre-gl-worker-CNLXcz58.js`,import.meta.url) ``) and against
// tests/fixtures/size-budget-worker/. Requiring the `.js`/`.mjs` extension keeps this from matching an
// unrelated `new URL(...)` (a sourcemap comment, a non-JS asset URL, ...). Group 1 is the quote
// character (used to tell a template literal from a plain string, below); group 2 is the raw text
// between the quotes.
export const WORKER_URL_REF =
  /new\s+URL\(\s*([`'"])([^`'"()]+\.m?js)\1\s*,\s*import\.meta\.url\s*\)/g;

function tryReadFile(readFile, path) {
  try {
    return readFile(path) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find every worker JS asset referenced — directly, or transitively (a worker referencing a worker of
 * its own) — from `fileContents`' text. This does NOT consult the manifest's `assets`/`imports` fields
 * at all — see the file header (F3) for why.
 *
 * atlas-0 review round 2, N1: a matched reference is never silently dropped. Resolution is three
 * tiers, in order: (1) sibling-relative to the referencing file, as the compiled output normally is;
 * (2) if that can't be read, a basename lookup among `emittedFiles` (a full listing of what the build
 * actually produced) — covers a Vite bump that prefixes the base path or nests output differently;
 * (3) if basename lookup finds zero or more-than-one candidate, or the reference isn't a literal
 * string at all (a template literal with an unresolved `${...}`), that is a hard FAIL with a reason
 * naming the reference and the file that made it — never a guess, never a silent skip.
 * @param {Map<string, string>} fileContents relPath -> utf8 text; the seed set to scan (typically the
 *   static-critical-path files already collected by `collectStaticGraph`)
 * @param {(relPath: string) => Buffer} readFile reads a dist-relative file as a Buffer; may throw or
 *   return a falsy value for a path that does not exist
 * @param {string[]} [emittedFiles] every dist-relative file path the build actually emitted (e.g. a
 *   recursive listing of `dist`), used only as the basename-lookup fallback above
 * @returns {{workers: Map<string, Buffer>, reasons: string[]}} workerRelPath -> raw bytes (deduped),
 *   plus any reasons a matched reference could not be resolved (empty means every match resolved)
 */
export function findWorkerAssets(fileContents, readFile, emittedFiles = []) {
  const workers = new Map();
  const reasons = [];
  const scanned = new Set(fileContents.keys()); // guards the BFS below against re-scanning the same
  // file's text twice — it does NOT prevent a file already in `fileContents` from also being classified
  // as a worker (a file can be both statically imported AND worker-referenced; worker classification
  // wins so its bytes count against the worker budget, not the static one — see `evaluateBudget`).
  const queue = [...fileContents.entries()];

  while (queue.length) {
    const [path, content] = queue.shift();
    for (const m of content.matchAll(WORKER_URL_REF)) {
      const quote = m[1];
      const spec = m[2];

      // a backtick literal with an unresolved `${...}` isn't a filename at all — `?worker&url`'s own
      // output is always a fully-resolved literal, so this only happens for hand-written, non-static
      // worker construction. Flag it distinctly rather than trying (and failing) to resolve it as text.
      if (quote === "`" && spec.includes("${")) {
        reasons.push(
          `unanalysable worker reference: \`${spec}\` in "${path}" is not a literal string (template ` +
            `interpolation) — this checker cannot resolve a non-literal worker URL; rewrite it as a ` +
            `plain string built entirely at build time`,
        );
        continue;
      }

      const naive = posix.normalize(posix.join(posix.dirname(path), spec));
      let resolved = naive;
      let buf = tryReadFile(readFile, naive);

      if (!buf) {
        // fallback: the reference's own text didn't resolve as a plain sibling of the referencing
        // file — look its basename up among everything the build actually emitted instead of giving
        // up (a Vite bump prefixing the base path, or nesting output differently, is exactly this).
        const basename = posix.basename(spec);
        const candidates = emittedFiles.filter((f) => posix.basename(f) === basename);
        if (candidates.length === 1) {
          resolved = candidates[0];
          buf = tryReadFile(readFile, resolved);
        } else if (candidates.length > 1) {
          reasons.push(
            `ambiguous worker reference: "${spec}" in "${path}" — ${candidates.length} emitted files ` +
              `share the basename "${basename}" (${candidates.join(", ")}); refusing to guess which one`,
          );
          continue;
        }
      }

      if (!buf) {
        reasons.push(
          `unresolvable worker reference: "${spec}" in "${path}" — no emitted dist file at "${naive}", ` +
            `and no emitted file is named "${posix.basename(spec)}" either`,
        );
        continue;
      }

      if (!workers.has(resolved)) workers.set(resolved, buf);
      if (!scanned.has(resolved)) {
        scanned.add(resolved);
        queue.push([resolved, buf.toString("utf8")]);
      }
    }
  }

  return { workers, reasons };
}

/**
 * @param {object} opts
 * @param {Record<string, any>} opts.manifest
 * @param {string} opts.entryKey
 * @param {(relPath: string) => Buffer} opts.readFile reads a dist-relative file as a Buffer
 * @param {number} [opts.budgetBytes] static critical-path budget, gzip bytes
 * @param {number} [opts.workerBudgetBytes] runtime-worker budget, gzip bytes (F3)
 * @param {number} [opts.fontImageBudgetBytes] fonts and images budget, raw bytes (0.4.0, the MBON kit)
 * @param {string[]} [opts.emittedFiles] every dist-relative file the build emitted (N1's
 *   basename-lookup fallback for a worker reference that doesn't resolve where its own text says it
 *   should); defaults to empty, in which case a reference that doesn't resolve directly is a FAIL, not
 *   a silent skip — see `findWorkerAssets`.
 * @param {string[]} [opts.forbiddenMarkers] defaults to {@link FORBIDDEN_LAZY_MARKERS}; see
 *   `findForbiddenMarkers`'s own doc comment (atlas-7's `--allow-marker`).
 */
export function evaluateBudget({
  manifest,
  entryKey,
  readFile,
  budgetBytes = CRITICAL_BUDGET_BYTES,
  workerBudgetBytes = RUNTIME_WORKER_BUDGET_BYTES,
  fontImageBudgetBytes = FONT_IMAGE_BUDGET_BYTES,
  emittedFiles = [],
  // atlas-7: see findForbiddenMarkers's own doc comment. Defaults to every marker (index.html's
  // invocation never passes this) -- an entry that legitimately narrates a lazy dependency's name
  // (report.html's provenance text) passes the specific marker(s) it needs dropped.
  forbiddenMarkers = FORBIDDEN_LAZY_MARKERS,
}) {
  const emptyResult = (reason) => ({
    ok: false,
    totalGzipBytes: 0,
    workerGzipBytes: 0,
    fontImageBytes: 0,
    files: [],
    workerFiles: [],
    fontImageFiles: [],
    reasons: [reason],
  });

  // F3 vacuous-pass hole: a manifest with no entry key, or an entry with no "file" (vite build did not
  // actually emit an output for it — e.g. the entry key name drifted from what `--entry` was given, or
  // a build failed to produce it), must FAIL loudly, not silently walk zero files and report success.
  if (!manifest[entryKey]) return emptyResult(`no entry "${entryKey}" in manifest`);
  if (!manifest[entryKey].file) {
    return emptyResult(
      `entry "${entryKey}" in manifest has no "file" — vite build did not emit it`,
    );
  }

  const { files } = collectStaticGraph(manifest, entryKey);
  const raw = new Map(); // relPath -> Buffer
  const contents = new Map(); // relPath -> utf8 text

  for (const f of files) {
    const buf = readFile(f);
    raw.set(f, buf);
    contents.set(f, buf.toString("utf8"));
  }

  const { workers: workerRaw, reasons: workerReasons } = findWorkerAssets(
    contents,
    readFile,
    emittedFiles,
  );
  // obis-hex: with an absolute `base` ("/obis-hex/") Vite emits a `?worker&url` reference as a
  // plain "/obis-hex/assets/<worker>.js" string, not `new URL(..., import.meta.url)`, so the scan
  // above misses it. A .js file in a manifest record's `assets` is by construction a URL-referenced
  // file, never a static import: count those as runtime workers too.
  for (const key of collectStaticGraph(manifest, entryKey).visitedKeys) {
    for (const a of manifest[key]?.assets ?? []) {
      if (/\.m?js$/.test(a) && raw.has(a) && !workerRaw.has(a)) workerRaw.set(a, raw.get(a));
    }
  }
  const workerFiles = new Set(workerRaw.keys());

  const fontImageFiles = [...raw.keys()].filter((f) => FONT_IMAGE_RE.test(f));
  let fontImageBytes = 0;
  for (const f of fontImageFiles) fontImageBytes += raw.get(f).length; // already compressed: raw bytes

  let totalGzipBytes = 0;
  for (const [f, buf] of raw) {
    if (workerFiles.has(f)) continue; // reclassified as a worker — budgeted separately, below
    if (FONT_IMAGE_RE.test(f)) continue; // fonts and images — budgeted separately, below
    totalGzipBytes += gzipSize(buf);
  }

  let workerGzipBytes = 0;
  for (const buf of workerRaw.values()) workerGzipBytes += gzipSize(buf);

  // the forbidden-lazy-marker scan covers the worker files too (F3): a worker is just as reachable
  // before first interaction as anything else on the static path, so an accidentally-inlined duckdb/etc.
  // chunk inside a worker is exactly the same fault as one inside the main bundle.
  const allContents = new Map([...contents].filter(([f]) => !FONT_IMAGE_RE.test(f)));
  for (const [f, buf] of workerRaw) allContents.set(f, buf.toString("utf8"));

  // N1: a worker reference that couldn't be resolved (or wasn't a literal at all) is a hard FAIL — it
  // is exactly the case where a real ~144 KB download could silently leave the budget unnoticed.
  const reasons = [...workerReasons];
  for (const hit of findForbiddenMarkers(allContents, forbiddenMarkers)) {
    reasons.push(
      `forbidden lazy-chunk marker "${hit.marker}" found in a file reachable by STATIC import (or referenced ` +
        `from one as a runtime worker): "${hit.path}" — it must be dynamically imported instead`,
    );
  }
  if (fontImageBytes > fontImageBudgetBytes) {
    reasons.push(
      `fonts and images ${fontImageBytes} B exceed the ${fontImageBudgetBytes} B budget (${fontImageFiles.join(", ")})`,
    );
  }
  if (totalGzipBytes > budgetBytes) {
    const staticFiles = [...raw.keys()].filter((f) => !workerFiles.has(f) && !FONT_IMAGE_RE.test(f));
    reasons.push(
      `critical-path gzip size ${totalGzipBytes} B exceeds the ${budgetBytes} B budget (${staticFiles.join(", ")})`,
    );
  }
  if (workerGzipBytes > workerBudgetBytes) {
    reasons.push(
      `runtime-worker gzip size ${workerGzipBytes} B exceeds the ${workerBudgetBytes} B budget (${[...workerFiles].join(", ")})`,
    );
  }

  return {
    ok: reasons.length === 0,
    totalGzipBytes,
    workerGzipBytes,
    fontImageBytes,
    files: [...raw.keys()].filter((f) => !workerFiles.has(f) && !FONT_IMAGE_RE.test(f)),
    workerFiles: [...workerFiles],
    fontImageFiles,
    reasons,
  };
}
