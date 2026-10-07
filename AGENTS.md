# AGENTS.md

Conventions for anyone (human or agent) changing obis-hex.

## Rules

- **The URL is the view.** Every piece of view state lives in `AppState` (`src/lib/state/url.ts`)
  and round-trips through the hash. Add a field there, to `formatHash`/`parseHash`, and to
  `tests/url.test.ts` in the same change. Parsing never throws; bad values fall back to defaults.
- **One file per view.** A view (layer × period × resolution) resolves to exactly one Parquet file
  through the manifest (`files.parquet`), never a URL template. Fetch the row's `url_path` verbatim;
  never re-encode taxon names (see README, "Data layout").
- **DuckDB stays lazy.** `src/lib/engine/bundles.ts` is reached only via the dynamic `import()` in
  `engine.ts`. `npm run size-budget` fails if a duckdb bundle name shows up in the static graph.
  `@duckdb/duckdb-wasm` is pinned to exactly 1.32.0; do not caret it.
- **Every query goes through `Engine`** (one connection, one promise chain, partition cache keyed by
  URL). User values reach SQL only through `lit()` (`src/lib/engine/sql.ts`).
- **Logic in plain `.ts`, tested.** Components only wire. Every rule (resolution mapping, ramp domain,
  manifest lookup, hash codec) has a vitest test with a small fixture; a bug fix adds a named
  regression test. `npm test`, `npm run check`, `npx tsc --noEmit` and the size budget must be green.

## Where things live

| path | what |
|---|---|
| `src/App.svelte` | the shell: `st` (AppState), derived view, loading effects, map wiring |
| `src/components/` | Controls, StatsPanel, CellPanel, SqlPanel |
| `src/lib/state/url.ts` | AppState, hash codec, defaults |
| `src/lib/state/resolution.ts` | zoom → res (Shiny app's breaks), caps 7 / 5 with a decade |
| `src/lib/data/layers.ts` | indicators, EOVs, `LayerSel`, layer keys, manifest-layer mapping |
| `src/lib/release/release.ts` | data base URL, `release.json` probe, metadata + stats SQL |
| `src/lib/release/manifest.ts` | `files.parquet` index and lookup |
| `src/lib/engine/` | DuckDB-WASM engine (`engine.ts`), bundles, SQL builders |
| `src/lib/color/ramp.ts` | viridis, p02–p98 domain, quantiles, view stats |
| `src/lib/map/` | MapLibre + deck.gl overlay; `H3HexagonLayer` builder |
| `scripts/size-budget*.mjs` | the bundle-size gate (from MarineSensitivity/atlas) |
| `tests/fixtures/release/` | a small real release subset for engine tests |

## How to add a layer

1. Export it from `obisindicators::obis_h3_export_parquet()` so it appears in `release.json`,
   `files.parquet` (a new `layer` value) and `stats.parquet`.
2. Add the selection to `LayerSel` and `layerKey`/`parseLayerKey`, and map it in `manifestLayer`
   and `statsKey` (`src/lib/data/layers.ts`).
3. If its partition keys differ, extend `Manifest.lookup` (`src/lib/release/manifest.ts`).
4. Offer it in `Controls.svelte`, disabled when `manifest.hasLayer(...)` is false.
5. Tests: a manifest lookup case, a URL round-trip, and an engine case if a fixture exists.

## How to add an indicator

Add the column to the export, then to `Indicator`/`INDICATORS` (`layers.ts`) and `VALUE_COLUMNS`
(`sql.ts`). The partition query loads every indicator column once, so switching never refetches.
