# AGENTS.md

Conventions for anyone (human or agent) changing obis-hex.

## Rules

- **The URL is the view.** Every piece of view state lives in `AppState` (`src/lib/state/url.ts`)
  and round-trips through the hash. Add a field there, to `formatHash`/`parseHash`, and to
  `tests/url.test.ts` in the same change. Parsing never throws; bad values fall back to defaults.
- **The release comes from `latest.json`.** `resolveDataBase()` (`src/lib/release/release.ts`, async)
  takes `?data=`, then `VITE_DATA_BASE` (both synchronous, via `dataBaseOverride()`), then the `base`
  in `obis-h3/latest.json` (no-cache, 3 s timeout), then the `PUBLIC_DATA_BASE` constant. Any failure
  of the fetch means the constant, never an error. Nothing may read the data base before it resolves
  (`App.svelte` sets `base` before `probeRelease`); a new release needs no redeploy.
- **Files come from the manifest.** A view (layer × period × resolution) resolves through
  `files.parquet` (`Manifest.view()`), never a URL template: one whole file, or (layout v2) the
  parent partitions of a split resolution, of which the app loads those covering the viewport
  (`planView()` in `src/lib/view/viewport.ts`, at most `MAX_PARENTS`, else a coarser res with a
  notice). The parent resolution is read off the parent cells, not hard-coded. Fetch each row's
  `url_path` verbatim; never re-encode taxon names (see README, "Data layout").
- **DuckDB stays lazy.** `src/lib/engine/bundles.ts` is reached only via the dynamic `import()` in
  `engine.ts`. `npm run size-budget` fails if a duckdb bundle name shows up in the static graph.
  `@duckdb/duckdb-wasm` is pinned to exactly 1.32.0; do not caret it.
- **Every query goes through `Engine`** (one connection, one promise chain; whole files cached by
  URL, parent partitions in the DuckDB table `part_cache`, unioned per view by `loadUnion()`). User values reach SQL only through `lit()` (`src/lib/engine/sql.ts`).
- **One live layer.** `aphia:<id>` (children of a WoRMS AphiaID) is the only layer not in the
  release: it comes from the h3t subtree service (`src/lib/aphia/h3t.ts`; limits in README, "Any
  taxon (WoRMS)"). Its response still goes through `Engine.loadRemote()` into `part_cache`, so
  every downstream panel treats it like a partition. Never call the service without a bbox at
  res >= 6, keep the request URL's parameter order fixed (it is the cache key, in DuckDB and
  in Varnish), and handle 413 by stepping down a resolution, not by retrying.
- **Places come from the gazetteer, not from code.** The Place picker lists `layers.json` and
  `places_index.parquet` (`src/lib/places/index.ts`); never add a place to `regions.ts` (it holds only the
  sea and ocean cameras). A place is keyed by (collection, `place_id`): ids repeat across collections, so
  `pl=` carries `pc=` when it is ambiguous. Read PMTiles from the bucket host (`pmtilesUrl()`), never
  `storage.oceanmetrics.io` (302 without CORS). `places/index.ts` and `PlacePanel.svelte` are a lazy chunk:
  the always-loaded code (`App.svelte`, `map.ts`) reaches them by `import()` or `places/urls.ts` only.
- **The UI is `@marinebon/ui`** (pinned `github:marinebon/ui#v0.3.0`; read its AGENTS.md before adding a
  control). Use its components and semantic tokens (`--bg-surface`, `--text-body`, …), never a new hex
  value; the pipeline order is ① Metric (the dataset step: taxon and indicator, sub-tabs, since neither means anything
  without the other) → ② Place (where, hexagon size, period, projection) → ③ Share (delivery); a title chip
  takes the colour of the tab that holds its control. A
  control that changes what the map means goes in its Controls tab AND in the title sentence as a
  Chip showing the same component; its state goes in `AppState`. A widget two apps need belongs in
  the kit, not here.
- **The title sentence is the view's caption.** `sentenceParts()`/`sentenceText()`
  (`src/lib/view/sentence.ts`) build it; the PNG stamp and `npm run figures` read it. The sentence carries no OBIS snapshot and no resolution: those are the footer's
  (`footerReleaseText()` in `src/lib/export/cite.ts`, `resNote()`). Keep the ES(50)
  coverage line ("n of N hexagons have ≥ 50 records") visible whenever the indicator is ES(50).
- **Help, the tour and feedback stay in step with the layout.** A control that moves or is renamed
  updates its tour stop (`TOUR_STOPS` in `src/lib/help/tour.ts`: order, selectors, words) and the
  Keyboard list (`SHORTCUTS`). `?tour=`/`?modal=` are query switches, never AppState. Screenshots and
  figures open with `?tour=off`. Feedback sends to the shared Ocean Metrics Apps Script when
  `VITE_FEEDBACK_URL` (or the `obis-hex.feedback_url` localStorage override) is set (runbook:
  erddap-places `docs/feedback.md`); Send is the dialog's one primary button (`sendUi()` in `feedback/sendState.ts`): disabled
  without an endpoint, and then, or when the POST fails, one notice line links to the GitHub issue
  URL (`issueUrl()`, kept under 7,500 characters; the screenshot goes to the clipboard). There is no
  Copy report or Download PNG. The email is
  optional: Sheet and mail only, never the issue, the issue URL or the clipboard report
  (`payload.ts` leaves the key out when empty; `FeedbackReport` has no email field). The view link is
  an opt-out checkbox; unticked, `url` is absent from the payload. Mark colours live only in
  `feedback/colors.ts`.
- **html-to-image stays lazy** (pinned 1.11.13 exactly). Only `src/lib/feedback/capture.ts` imports
  it, and it and `FeedbackDialog.svelte` are reached only via `import()` in `App.svelte`
  (`tests/help.test.ts` and the size budget's `fontEmbedCSS` marker check this).
- **Logic in plain `.ts`, tested.** Components only wire. Every rule (resolution mapping, ramp domain,
  manifest lookup, hash codec) has a vitest test with a small fixture; a bug fix adds a named
  regression test. `npm test`, `npm run check`, `npx tsc --noEmit` and the size budget must be green.

## Where things live

| path | what |
|---|---|
| `src/App.svelte` | the shell: `st` (AppState), derived view, loading effects, map wiring; Header, title sentence, Controls, Cell pane, Time strip, Footer |
| `src/components/` | TitleSentence (chips), TaxonPanel, PeriodPicker, PlacePanel (lazy, behind PlaceGate), ScalePanel, IndicatorPanel, SharePanel, SqlPanel, CellPanel, DecadeBars, AphiaSearch |
| `src/lib/view/sentence.ts` | the title sentence parts and text, hexagon areas, the coverage line |
| `src/lib/data/taxa.ts` | the taxon picker rows (groups, counts, common names, log bars) |
| `src/lib/release/decades.ts` | records per decade (sum of `n` of the res-1 decade files), brush ⇄ decade |
| `src/lib/view/regions.ts` | the 13 "Seas & oceans" camera presets (no gazetteer feature) |
| `src/lib/places/` | the gazetteer as the Place picker's source: `index.ts` (manifest, index read through the engine, search, picker groups, camera, credits; lazy), `urls.ts` (bucket URLs, `pmtilesUrl`, always loaded) |
| `src/lib/export/` | the title-stamped PNG, the Cite this data text (release citation + OBIS line) |
| `src/lib/help/` | tour stops and keys (`tour.ts`), `?tour=`/`?modal=` and the welcome views (`start.ts`), shortcuts (`keys.ts`), data sources (`sources.ts`) |
| `src/lib/feedback/` | the GitHub issue URL and report text (`issue.ts`), mark-up drawing (`annotate.ts`) and colours (`colors.ts`), the endpoint (`endpoint.ts`), what Send and the notice do (`sendState.ts`), POST body (`payload.ts`) and client (`postFeedback.ts`), the lazy screenshot (`capture.ts`) |
| `src/components/Welcome, Tour, Modal, FeedbackDialog` | the welcome card, the tour ring and card, the native-dialog modal, the feedback dialog (lazy) |
| `scripts/shoot.mjs` | the UI assessment capture → `docs/ui-assessment/after/` |
| `src/lib/state/url.ts` | AppState, hash codec, defaults |
| `src/lib/state/resolution.ts` | zoom → res (Shiny app's breaks), caps 7 / 5 with a decade |
| `src/lib/state/legacy.ts` | Shiny h3-db bookmark (`?legacy=`) → AppState + notice; Caddy side in `docs/redirect.md` |
| `src/lib/aphia/h3t.ts` | the live AphiaID layer: h3t URLs, taxon search parsing, fetch, 413 fallback, health probe |
| `src/components/AphiaSearch.svelte` | the debounced WoRMS name search |
| `src/lib/view/viewport.ts` | viewport → parent cells (h3-js), the view plan and its fallback |
| `src/lib/data/layers.ts` | indicators, EOVs, `LayerSel`, layer keys, manifest-layer mapping |
| `src/lib/release/release.ts` | data base URL (`latest.json` pointer, overrides), `release.json` probe, metadata + stats SQL |
| `src/lib/release/manifest.ts` | `files.parquet` index and lookup |
| `src/lib/engine/` | DuckDB-WASM engine (`engine.ts`), bundles, SQL builders |
| `src/lib/color/ramp.ts` | viridis, p02–p98 domain, quantiles, view stats |
| `src/lib/map/` | MapLibre + deck.gl overlay (flat or globe projection); `H3HexagonLayer` builder; the gazetteer outline map above deck (`createOutlineMap`, one source per collection) |
| `scripts/size-budget*.mjs` | the bundle-size gate (from MarineSensitivity/atlas) |
| `scripts/figures.mjs` | `npm run figures`: paper 2's figures from URL states → `figures/figA_*.png` |
| `docs/redirect.md` | the Caddy redirect for app.marinesensitivity.org/h3-db and the legacy mapping table |
| `tests/fixtures/release/` | a small real release subset for engine tests |
| `tests/fixtures/h3t/` | real h3t responses: Megaptera novaeangliae res 4 Parquet, a taxon search, a synonym |

## How to add a layer

1. Export it from `obisindicators::obis_h3_export_parquet()` so it appears in `release.json`,
   `files.parquet` (a new `layer` value) and `stats.parquet`.
2. Add the selection to `LayerSel` and `layerKey`/`parseLayerKey`, and map it in `manifestLayer`
   and `statsKey` (`src/lib/data/layers.ts`).
3. If its partition keys differ, extend `Manifest.view` (`src/lib/release/manifest.ts`). Split
   resolutions need nothing extra: `p=<parent>` partitions are grouped automatically.
4. Offer it in the taxon picker (`taxonItems()` in `src/lib/data/taxa.ts`), disabled when
   `manifest.hasLayer(...)` is false; give `taxonPart()` (`sentence.ts`) its words.
5. If the Shiny app had it, map its `preset=` value in `LEGACY_PRESETS` (`legacy.ts`) and add the
   row to `docs/redirect.md`.
6. Tests: a manifest lookup case, a URL round-trip, and an engine case if a fixture exists.

## Figures

`npm run figures` must keep reproducing the paper's figures. If a URL field or the panel layout
changes, re-run it (against the deployed app, or a local server with `OBIS_HEX_URL`), look at the
PNGs, and commit them with the change.

## How to add an indicator

Add the column to the export, then to `Indicator`/`INDICATORS` (`layers.ts`) and `VALUE_COLUMNS`
(`sql.ts`). The partition query loads every indicator column once, so switching never refetches.
