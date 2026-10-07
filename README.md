# obis-hex

OBIS biodiversity indicators on H3 hexagons, computed from Parquet in the browser.

Live at <https://oceanmetrics.io/obis-hex/>. This is a serverless replacement for the Shiny app
[app.marinesensitivity.org/h3-db](https://app.marinesensitivity.org/h3-db/): a static Svelte 5 page
on GitHub Pages that reads Parquet straight from S3 with DuckDB-WASM (one file per view for the
coarse resolutions, only the partitions covering the viewport for the fine ones) and draws the
cells with deck.gl's `H3HexagonLayer`, flat or on a globe. No hexagon geometry is shipped: deck.gl
builds each cell from its H3 index.

## What it shows

- **Indicator**: ES(50) (expected species per 50 records), species richness, Shannon H′,
  Simpson Σp², number of records.
- **Layer**: all taxa, one of the 7 Essential Ocean Variables (IOOS definitions, as in
  `obisindicators::obis_eov_seeds()`), a taxon group (rank + taxon, from `taxon_groups.parquet`),
  or **any taxon (WoRMS)**: the children of any WoRMS AphiaID, at any rank, computed live by the
  h3t subtree service (see "Any taxon (WoRMS)" below; the one layer not in the static release).
- **Period**: all years, or a decade 1960s–2020s (all taxa and EOVs at resolution ≤ 5; any
  resolution for a WoRMS taxon).
- **Resolution**: auto from zoom (the Shiny app's mapping, capped at 7, or 5 with a decade on a
  release layer) or pinned manually.
- **Projection**: flat (web mercator) or globe (MapLibre's globe; see "Globe" below).
- Viridis ramp over p02–p98, from the release's `stats.parquet` for that view (default) or from the
  loaded cells; fill opacity; dark or light CARTO basemap; hover tooltip; click for a cell panel;
  a stats panel (cells, min, max, p02–p98); a copyable SQL panel; load time and file size in the
  footer.
- The URL hash holds the whole view (indicator, layer, period, resolution, opacity, theme, ramp
  domain, projection, centre and zoom), so any link reproduces it. The title of the stats panel
  spells the view out (indicator · layer · years and OBIS snapshot · H3 res), so a screenshot
  explains itself.
- Old links to the Shiny app open the same view here once Caddy redirects them (see "Legacy URLs").

Not here: custom SQL, year ranges finer than decades, report export.

## Any taxon (WoRMS): the subtree service

The release precomputes all taxa, the EOVs and phylum/class/order groups. The children of an
arbitrary WoRMS AphiaID (a genus, a family, a species with its subspecies, an infraorder like
Cetacea) cannot be precomputed, so this one layer is served live by the h3t subtree endpoint
(MarineSensitivity/server `h3t/`, `app/subtree.py`, a port of obisindicators' taxon-tree CTE and
indicator SQL over the full OBIS H3 store). The app calls it through its Varnish cache,
`https://h3tcache.marinesensitivity.org/h3t/` (override with `?h3t=https://…/h3t/` on the page URL
or `VITE_H3T_BASE` at build time). Code: `src/lib/aphia/h3t.ts`, `src/components/AphiaSearch.svelte`.

- **The control.** "Any taxon (WoRMS)" in the layer picker opens a search box (debounced 250 ms,
  at least 2 letters) over `GET taxon?q=<prefix>&limit=20`, listing name · rank · status · records
  (accepted names first). Choosing a row sets the layer key `aphia:<id>` in the hash
  (`#l=aphia:137092`). The title line and the panel show the WoRMS name and rank from
  `GET taxon/<id>`, with a "▸ in WoRMS" link to marinespecies.org. A synonym is kept as chosen
  (the endpoint resolves it to the accepted subtree) and shown as "synonym → accepted name".
- **Data path.** Below res 6, one request per (AphiaID, res, decade) for the whole globe:
  `GET subtree?aphiaid=<id>&res=<r>[&decade=<d>]`. From res 6 the endpoint needs a bbox, so the
  app sends the viewport plus a 25 % margin, rounded outward to 0.5° (wrapped at the antimeridian;
  `w > e` crosses it) and refetches on `moveend` only when that rounded box changes, so small pans
  reuse the response. The app fetches the Parquet itself (for the status, `X-Rows`, `X-Query-Ms`
  and a 65 s timeout), registers the bytes with DuckDB-WASM and inserts them into the same
  `part_cache` table the parent partitions use, keyed by the request URL (`Engine.loadRemote()`),
  so indicators, ramp, hover, cell panel and stats work unchanged and a revisited view is not
  refetched. The ramp domain comes from the loaded cells (there are no release stats; the
  "release" option is disabled). The footer shows bytes, rows, the server's query time
  (`X-Query-Ms`) and the browser's round trip; the SQL panel shows the request URL instead.
- **Limits** (the service's, see its README "Subtree endpoint"): at most 200,000 cells per
  response (413), a bbox required from res 6 (400), a 60 s query timeout (504), 2 concurrent
  queries. On 413 the app steps down one resolution at a time (back to one global request below
  res 6) and says so ("Over 200,000 cells at res 7 in this view: showing res 5. Zoom in for res
  7."); 413s are remembered for 60 s, as the cache does. Other errors and timeouts are one line in
  the stats panel, never a silent blank map. A health probe (`GET health?t=<now>`, cache-busted)
  at startup greys the option out when the service is down.
- **Timings** (2026-10-08, from the browser, cache misses): Megaptera novaeangliae (137092) res 4
  48.6 KB, 11,645 cells, 2.4 s on the server; Cetacea (2688) res 3 139 KB, 14,973 cells, 1.5 s;
  class Mammalia (1837) res 7 over Monterey Bay 9.3 KB, 531 cells, 2.2 s; Animalia (2) res 5 is
  over the cap, so res 4: 2.3 MB, 180,091 cells, 7.9 s. Repeats come from Varnish (7 days).

## Data layout (v2)

Release `v20260728` at
`https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20260728/` (written by
`obisindicators::obis_h3_export_parquet()` 0.7.1, branch `export-parquet`; bucket CORS allows
GET/HEAD with Range from any origin):

| file | what |
|---|---|
| `release.json` | release, OBIS snapshot, layers with row/file/byte counts and `parent_res`, column docs |
| `files.parquet` | the manifest: `layer, path, url_path, rows, bytes, parent` for every file (HTTP cannot glob) |
| `stats.parquet` | per layer × key × rank × decade × res × variable: min, p02, p50, p98, max, n_cells |
| `taxon_groups.parquet` | `kind, rank, taxon, label, n, n_cells_res1, path, url_path` |
| `all/res=1..5/` | all taxa, one file per res |
| `all/res=6,7/p=<parent>/` | all taxa at res 6 / 7, one file per res-2 / res-3 parent cell |
| `eov/eov=<eov>/res=1..7/` | per EOV; res 6/7 split by parent like `all` when over 50,000 cells |
| `taxon/rank=<rank>/taxon=<taxon>/res=1..7/` | per taxon group; res 6/7 split by base cell (res 0) when over 50,000 cells |
| `decade/all/decade=<d>/res=1..5/` | all taxa by decade (never split) |
| `decade/eov/eov=<eov>/decade=<d>/res=1..5/` | EOV by decade (never split) |

Each partition is one `data_0.parquet` with `h3` (hex string), `cell_id`, `n`, `sp`, `shannon`,
`simpson`, `es`. Whole files run from under 1 MB (res ≤ 3) to 7.6 MB (`all/res=5`); a parent
partition is a few KB to a few hundred KB. Layout v1 had whole res-6/7 files (`all/res=7` was
33 MB); the v2 export (2026-10-07) replaced them in place: 158,475 files, 855 MB.

`files.parquet` `parent` is the partition's parent cell (NULL for a whole file); its H3 resolution
is the parent resolution, so the app needs no layout constants and a release may mix whole and
split resolutions (small EOVs stay whole at res 7). The app also reads `p=` from the path, so a v1
release still loads.

Taxon names are percent-encoded on disk by DuckDB (`taxon=Apicomplexa%20incertae%20sedis`), so the
HTTP URL needs the `%` encoded again (`%2520`). The app never builds either encoding: it indexes
`files.parquet` rows by their decoded partition values and fetches the row's `url_path` as-is
(`src/lib/release/manifest.ts`).

## Viewport loading

For a split resolution (`src/lib/view/viewport.ts`) the app covers the visible bounds with h3-js
`polygonToCells` at the parent resolution (split at the antimeridian, in strips of at most 90°),
adds a ring of one cell (`gridDisk`) so cells that only clip the edge are included (for the taxon
layer's res-0 base-cell parents a ring would mean 7 continent-sized files for a small view, so
coarse parents use H3's "overlapping" containment instead, with no ring), keeps the
parents the manifest has, and loads them into a DuckDB table `part_cache` (one `read_parquet` of
the new files; each file is fetched once and kept, least recently used dropped beyond 512). The
view is a `UNION` of the cached partitions in DuckDB. On `moveend` the cover is recomputed and only
new partitions are fetched. The footer shows `n of N partitions`, their bytes, cells, how many were
fetched for this view and how many are cached.

A view may load at most 64 parents (`MAX_PARENTS`); past that (a pinned res 7 at a low zoom) the app
steps down one resolution at a time, to a whole file at res 5 at worst, and says so in the stats
panel. Measured on the global release, 1512×798 window, auto resolution, Monterey Bay:

| zoom | res | partitions | bytes | cells |
|---|---|---|---|---|
| 9.0 | 7 | 7 of 36,893 | 118 KB | 7,993 |
| 8.3 | 7 | 13 | 156 KB | 10,695 |
| 7.5 | 6 | 7 of 5,799 | 117 KB | 7,911 |
| 7.0 | 6 | 12 | 194 KB | 12,569 |
| 5 (res 7 pinned) | 5 (fallback) | whole file | 7.3 MB | 657,311 |

(v1 loaded the whole 33 MB `all/res=7` or 17 MB `all/res=6` for each of these.) A pan of a third of
the window at zoom 8.3 fetched one new partition. The manifest itself grew to 1.25 MB with the
158k rows; it is read once per page.

## Globe

MapLibre GL 6 has `projection: { type: "globe" }`, and deck.gl 9.4's `MapboxOverlay` (non-interleaved,
as used here) follows it: on a globe projection it swaps its `MapView` for a `_GlobeView`, and
`H3HexagonLayer` switches to its polygon path there (a globe viewport has a `resolution`). Checked
with screenshots at res 1–4, including cells across the antimeridian (Fiji, `c=178,-20`) and the
coastline at zoom 5 (Florida, Cuba, Yucatán): the hexagons sit on the sphere, cull at the limb and
match the basemap. So the globe is a plain URL field (`g=globe|flat`, default flat) with a toggle,
re-applied on every style load (a theme swap replaces the style); no separate MapLibre fill layer
was needed. Cells with no value (ES(50) where n < 50) are transparent, so over the dark basemap's
land they read as near-black, as in the Shiny app.

## Legacy URLs

`app.marinesensitivity.org/h3-db/?<bookmark>` is meant to 302 to
`https://oceanmetrics.io/obis-hex/?legacy=<bookmark>` (Caddy block and the full mapping table in
[docs/redirect.md](docs/redirect.md)). On load the app maps the Shiny bookmark
(`src/lib/state/legacy.ts`) to its hash state, shows a one-line notice when the old view could only
be approximated (custom SQL, a family/genus/species filter, a year range that is not one decade,
several AphiaIDs at once), and removes `?legacy=` from the address bar. "Children of AphiaID"
bookmarks map exactly to the live `aphia:<id>` layer.

## Figures

`npm run figures` reproduces paper 2's app figures from three URL states with Playwright (Chromium
on SwiftShader, 1512×798) and writes `figures/figA_*.png`:

| file | view |
|---|---|
| `figA_app_alltaxa_globe_dark.png` | all taxa, ES(50), res 1, dark basemap, globe |
| `figA_app_seagrasses_globe.png` | seagrasses EOV, ES(50), res 1, light basemap, globe |
| `figA_app_seagrasses_caribbean.png` | seagrasses EOV, ES(50), res 4, the Caribbean, resolution control in the side panel |

It opens the deployed app by default; `OBIS_HEX_URL=http://localhost:5173/obis-hex/ npm run figures`
uses a local server. The URL states are in `scripts/figures.mjs`. Playwright is pinned to 1.63.0
(the Chromium build the other Ocean Metrics repos already have); a fresh machine needs
`npx playwright install chromium` once.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173/obis-hex/ against the S3 release
npm run dev:local    # serves a local release at /obis-hex/local-data/ (default ~/data/obis-h3-demo/demo,
                     # override with OBIS_H3_LOCAL=/path/to/release)
npm test             # vitest
npm run check        # svelte-check
npm run build && npm run size-budget
npm run figures      # paper figures (Playwright), see "Figures"
```

A page URL can also point at another release with `?data=https://…/` (https or a same-origin path).

To build the local demo release (layout v2) from the South Atlantic demo store, in R with
obisindicators 0.7.1 on branch `export-parquet`:

```r
devtools::load_all("~/Github/marinebon/obisindicators")
con <- obis_store_connect(path = "~/data/obis/obis_h3_satlantic_v20260728.duckdb")
obis_h3_export_parquet(con, "~/data/obis-h3-demo", "demo", res_decade = 1:5)
```

The demo store has no EOV table and an empty taxon table, so only `all` and `decade_all` have
data there; the app disables the layers a release lacks. `tests/fixtures/release/` is a 100 KB
subset of it (including three res-7 parent partitions), so the engine tests also run in CI.

## Size budget

`npm run size-budget` (copied from MarineSensitivity/atlas) gzips everything `index.html` loads
through static imports and fails if it exceeds the budget or if DuckDB-WASM leaks into that graph.
Measured at 0.3.0 (2026-10-08):

| | gzip | budget |
|---|---|---|
| static critical path (MapLibre 6.10, deck.gl 9.4, h3-js, Svelte, app, CSS) | 601.6 KB | 650 KB |
| runtime worker (MapLibre's) | 140.2 KB | 150 KB |
| DuckDB-WASM (lazy: JS chunk 45 KB, wasm ~7.8 MB) | not counted | must stay lazy |

The atlas budget is 450 KB; deck.gl and h3-js add roughly 300 KB, hence 650 KB here. The viewport
code (`polygonToCells`, `gridDisk`) uses the h3-js already in the bundle for deck.gl, so 0.2.0 (viewport loading,
globe toggle, legacy links) added 4 KB and 0.3.0 (the WoRMS taxon search and subtree loader) another
4 KB; the budget is unchanged.

## Deploy

`.github/workflows/pages.yml` runs typecheck, svelte-check, tests, build and the size budget on every
push and pull request, and on `main` deploys the same `dist/` to GitHub Pages (Actions source). Vite's
`base` is `/obis-hex/`, served under the org's custom domain at <https://oceanmetrics.io/obis-hex/>.

## Pinned versions

`@duckdb/duckdb-wasm` 1.32.0 exactly (the atlas's spike S1: 1.33 dev builds are broken), deck.gl
9.4.0 (`@deck.gl/core`, `layers`, `geo-layers`, `mapbox`), `h3-js` 4.4.0, `maplibre-gl` ^6.10.0
(5.x has an unpatched critical XSS advisory), Svelte ^5.57, Vite ^8.3, vitest ^5, `playwright`
1.63.0 (dev, figures only).

## License

MIT, Ocean Metrics LLC. Data: [OBIS](https://obis.org), snapshot 2026-07-28.
