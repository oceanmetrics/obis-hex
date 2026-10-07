# obis-hex

OBIS biodiversity indicators on H3 hexagons, computed from Parquet in the browser.

Live at <https://oceanmetrics.io/obis-hex/>. This is a serverless replacement for the Shiny app
[app.marinesensitivity.org/h3-db](https://app.marinesensitivity.org/h3-db/): a static Svelte 5 page
on GitHub Pages that reads one Parquet file per view straight from S3 with DuckDB-WASM and draws
the cells with deck.gl's `H3HexagonLayer`. No hexagon geometry is shipped: deck.gl builds each cell
from its H3 index.

## What it shows

- **Indicator**: ES(50) (expected species per 50 records), species richness, Shannon H′,
  Simpson Σp², number of records.
- **Layer**: all taxa, one of the 7 Essential Ocean Variables (IOOS definitions, as in
  `obisindicators::obis_eov_seeds()`), or a taxon group (rank + taxon, from `taxon_groups.parquet`).
- **Period**: all years, or a decade 1960s–2020s (all taxa and EOVs only, resolution ≤ 5).
- **Resolution**: auto from zoom (the Shiny app's mapping, capped at 7, or 5 with a decade) or
  pinned manually.
- Viridis ramp over p02–p98, from the release's `stats.parquet` for that view (default) or from the
  loaded cells; fill opacity; dark or light CARTO basemap; hover tooltip; click for a cell panel;
  a stats panel (cells, min, max, p02–p98); a copyable SQL panel; load time and file size in the
  footer.
- The URL hash holds the whole view (indicator, layer, period, resolution, opacity, theme, ramp
  domain, centre and zoom), so any link reproduces it.

Not in this scaffold: children of a WoRMS AphiaID (needs a small backend), custom SQL, year ranges
finer than decades, report export.

## Data layout

Release `v20260728` at
`https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20260728/` (written by
`obisindicators::obis_h3_export_parquet()`; bucket CORS allows GET/HEAD with Range from any origin):

| file | what |
|---|---|
| `release.json` | release, OBIS snapshot, layers with row/file/byte counts, column docs |
| `files.parquet` | the manifest: `layer, path, url_path, rows, bytes` for every file (HTTP cannot glob) |
| `stats.parquet` | per layer × key × rank × decade × res × variable: min, p02, p50, p98, max, n_cells |
| `taxon_groups.parquet` | `kind, rank, taxon, label, n, n_cells_res1, path, url_path` |
| `all/res=1..7/` | all taxa |
| `eov/eov=<eov>/res=1..7/` | per EOV |
| `taxon/rank=<rank>/taxon=<taxon>/res=1..7/` | per taxon group |
| `decade/all/decade=<d>/res=1..5/` | all taxa by decade |
| `decade/eov/eov=<eov>/decade=<d>/res=1..5/` | EOV by decade |

Each partition is one `data_0.parquet` with `h3` (hex string), `cell_id`, `n`, `sp`, `shannon`,
`simpson`, `es`. Sizes run from under 1 MB (res ≤ 3) to 33 MB (`all/res=7`).

Taxon names are percent-encoded on disk by DuckDB (`taxon=Apicomplexa%20incertae%20sedis`), so the
HTTP URL needs the `%` encoded again (`%2520`). The app never builds either encoding: it indexes
`files.parquet` rows by their decoded partition values and fetches the row's `url_path` as-is
(`src/lib/release/manifest.ts`).

## Develop

```sh
npm install
npm run dev          # http://localhost:5173/obis-hex/ against the S3 release
npm run dev:local    # serves a local release at /obis-hex/local-data/ (default ~/data/obis-h3-demo/demo,
                     # override with OBIS_H3_LOCAL=/path/to/release)
npm test             # vitest
npm run check        # svelte-check
npm run build && npm run size-budget
```

A page URL can also point at another release with `?data=https://…/` (https or a same-origin path).

To build the local demo release from the South Atlantic demo store, in R with obisindicators on
branch `export-parquet`:

```r
devtools::load_all("~/Github/marinebon/obisindicators")
con <- obis_store_connect(path = "~/data/obis/obis_h3_satlantic_v20260728.duckdb")
obis_h3_export_parquet(con, "~/data/obis-h3-demo", "demo", res_decade = 1:5)
```

The demo store has no EOV or taxon tables, so only `all` and `decade_all` exist there; the app
disables the layers a release lacks. `tests/fixtures/release/` is a 60 KB subset of it, so the
engine tests also run in CI.

## Size budget

`npm run size-budget` (copied from MarineSensitivity/atlas) gzips everything `index.html` loads
through static imports and fails if it exceeds the budget or if DuckDB-WASM leaks into that graph.
Measured at 0.1.0 (2026-10-07):

| | gzip | budget |
|---|---|---|
| static critical path (MapLibre 6.10, deck.gl 9.4, h3-js, Svelte, app, CSS) | 593.3 KB | 650 KB |
| runtime worker (MapLibre's) | 140.2 KB | 150 KB |
| DuckDB-WASM (lazy: JS chunk 45 KB, wasm ~7.8 MB) | not counted | must stay lazy |

The atlas budget is 450 KB; deck.gl and h3-js add roughly 300 KB, hence 650 KB here.

## Deploy

`.github/workflows/pages.yml` runs typecheck, svelte-check, tests, build and the size budget on every
push and pull request, and on `main` deploys the same `dist/` to GitHub Pages (Actions source). Vite's
`base` is `/obis-hex/`, served under the org's custom domain at <https://oceanmetrics.io/obis-hex/>.

## Pinned versions

`@duckdb/duckdb-wasm` 1.32.0 exactly (the atlas's spike S1: 1.33 dev builds are broken), deck.gl
9.4.0 (`@deck.gl/core`, `layers`, `geo-layers`, `mapbox`), `h3-js` 4.4.0, `maplibre-gl` ^6.10.0
(5.x has an unpatched critical XSS advisory), Svelte ^5.57, Vite ^8.3, vitest ^5.

## License

MIT, Ocean Metrics LLC. Data: [OBIS](https://obis.org), snapshot 2026-07-28.
