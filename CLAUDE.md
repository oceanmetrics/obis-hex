# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

OBIS biodiversity indicators (ES(50), richness, Shannon, Simpson, records) on H3 hexagons, computed in
the browser: a static Svelte 5 + TypeScript page on GitHub Pages (<https://oceanmetrics.io/obis-hex/>)
that reads Parquet from S3 with DuckDB-WASM and draws cells with deck.gl's `H3HexagonLayer` over
MapLibre. No server of ours is in the request path except the h3t subtree service for the one live
layer (`aphia:<id>`).

The hard rules and the file map are in AGENTS.md; follow them:

@AGENTS.md

README.md holds the long form (URL keys, data layout v2, viewport loading numbers, h3t limits, size
budget history, pinned versions). Read the matching section before changing that area.

## Commands

```sh
npm install
npm run dev            # http://localhost:5173/obis-hex/ against the S3 release
npm run dev:local      # local release at /obis-hex/local-data/ (OBIS_H3_LOCAL=/path, default ~/data/obis-h3-demo/demo)
npm test               # vitest run (node env, no DOM)
npx vitest run tests/url.test.ts         # one file
npx vitest run -t "round-trips"          # tests whose name matches
npx tsc --noEmit       # typecheck (also: npm run typecheck)
npm run check          # svelte-check
npm run build && npm run size-budget     # size budget reads dist/.vite/manifest.json, so build first
npm run figures        # paper figures via Playwright; OBIS_HEX_URL=http://localhost:5173/obis-hex/ for local
node scripts/shoot.mjs # UI assessment screenshots → docs/ui-assessment/after/
```

CI (`.github/workflows/pages.yml`) runs, in order: `tsc --noEmit`, `check`, `test`, `build`,
`size-budget`; a push to `main` deploys that `dist/`. Run the same five before calling a change done.
Playwright needs `npx playwright install chromium` once on a fresh machine.

## Architecture: how a view becomes hexagons

1. **State.** `App.svelte` holds one `st: AppState`, seeded from `parseHash(location.hash)` (or from
   `?legacy=` via `legacy.ts`) and written back with `formatHash` in an `$effect`. Everything below is
   `$derived` from `st` plus loaded data; components receive values and callbacks, they hold no
   view state.
2. **Release.** `release.ts` resolves the data base URL (async: `?data=` → `VITE_DATA_BASE` → the
   `base` in S3 `obis-h3/latest.json` → the `PUBLIC_DATA_BASE` constant), then loads `release.json`, `files.parquet` (into `Manifest`), `stats.parquet` and
   `taxon_groups.parquet` through the engine once per page.
3. **Plan.** `st.layer` → `LayerSel` (`parseLayerKey`); zoom/res mode/decade → requested res
   (`effectiveRes`); `planView(manifest, sel, decade, res, bounds)` returns either one whole file or
   the parent partitions covering the viewport, stepping res down past `MAX_PARENTS`. The load effect
   keys on the joined file list, so a pan that needs no new partition triggers no fetch.
4. **Load.** `Engine.loadPartition` (whole file, cached by URL) or `Engine.loadUnion` (parents into
   `part_cache`, UNION per view, LRU 512) returns a `Partition`: columnar `h3` + every indicator
   column, so switching indicator never refetches. For `aphia:<id>`, `h3t.ts` builds the request URL
   and `Engine.loadRemote` inserts the response into the same `part_cache`.
5. **Draw.** `ramp.ts` picks the domain (release stats p02–p98 or the loaded cells') and colours;
   `map/hexLayer.ts` builds the `H3HexagonLayer`; `map/map.ts` owns MapLibre + the `MapboxOverlay`
   (flat or globe, re-applied on each style load).
6. **Caption.** `sentence.ts` turns the same derived values into the title sentence chips, its text
   (PNG stamp, figures) and the ES(50) coverage line.

The engine takes an injectable `createDb`: the browser path lazy-imports `bundles.ts`; tests use
`tests/helpers/nodeDb.ts` (the node-blocking build of the same duckdb-wasm 1.32.0) against
`tests/fixtures/release/`, so engine tests run the browser's exact SQL in CI.

## Conventions not covered above

- Versioning: bump `package.json` `version` with a user-facing change and say what changed in the
  README (and the size-budget table when bytes move); commits are prefixed with the version or area
  (`0.5.0: …`, `UI: …`, `docs: …`). There is no NEWS.md.
- `__APP_VERSION__` (from `package.json`, via `vite.config.ts` `define`) is what the footer, About
  and feedback report show.
- Feedback sends to the shared Ocean Metrics Apps Script when `VITE_FEEDBACK_URL` is set (runbook:
  erddap-places `docs/feedback.md`); the email is optional, Sheet and mail only, never the issue.
  Without an endpoint, or after a failed send, the GitHub issue, Copy report and Download PNG remain.
- Vite `base` is `/obis-hex/`; local URLs and `OBIS_HEX_URL` need that path.
