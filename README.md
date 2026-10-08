# obis-hex

OBIS biodiversity indicators on H3 hexagons, computed from Parquet in the browser.

Live at <https://oceanmetrics.io/obis-hex/>. This is a serverless replacement for the Shiny app
[app.marinesensitivity.org/h3-db](https://app.marinesensitivity.org/h3-db/): a static Svelte 5 page
on GitHub Pages that reads Parquet straight from S3 with DuckDB-WASM (one file per view for the
coarse resolutions, only the partitions covering the viewport for the fine ones) and draws the
cells with deck.gl's `H3HexagonLayer`, flat or on a globe. No hexagon geometry is shipped: deck.gl
builds each cell from its H3 index.

## What it shows

An MBON product built on the [`@marinebon/ui`](https://github.com/marinebon/ui) kit (v0.1.0): the map is
the page, and everything else follows the calcofi.io/explore anatomy (`docs/ui-assessment.md`).

- **Header**: the MBON wordmark, *OBIS hex* and its tagline, **Help ▾** (see "Help, the tour and
  feedback"), the feedback bubble and the theme toggle. The theme is the kit's (stored as
  `mbon-theme`) and drives the CARTO basemap (dark-matter / positron); a link's `t=` still wins.
- **The title sentence is the controls**, in the order dataset → place → method:
  "**Seabirds** (EOV), **all years** (OBIS 2026-07-28), **worldwide**, **~12,400 km² hexagons** (res 3):
  **ES(50)**". Each bold part is a chip whose popover holds the same control as its Controls tab.
  The second line is the colour scale (viridis over p02–p98, the release's for the view or the loaded
  hexagons') and the count, which for ES(50) is the coverage caveat: "9,196 of 26,361 hexagons have
  ≥ 50 records". *Worldwide* means the whole layer is loaded (one file); *in view* means only the
  parent partitions covering the map (or the live layer's bbox), and the count is for those.
- **Controls** (top left, numbered): ① **Taxon**: one picker of All taxa, the 7 Essential Ocean
  Variables (IOOS definitions, as in `obisindicators::obis_eov_seeds()`), the taxon groups by phylum,
  class and order (from `taxon_groups.parquet`, most records first, record counts on a log bar, common
  names for the groups people look for), and **Any taxon (WoRMS)**: the children of any WoRMS AphiaID,
  computed live by the h3t subtree service (see below; the one layer not in the static release).
  ② **Place & scale**: go to a sea or sanctuary, hexagon size (auto from zoom, the Shiny app's
  mapping capped at 7, or 5 with a decade on a release layer; or pinned), the period, flat or globe.
  ③ **Indicator**: ES(50), species richness, Shannon H′, Simpson Σp², records, each with a line of
  meaning; *More options*: ramp domain (whole release / loaded hexagons), fill opacity, basemap labels.
  ④ **Share**: Download PNG (the title, scale, release and link stamped on it), Copy link, *Cite this
  data* (the release citation, then OBIS's own line), and *SQL & timing* (the partition path, bytes, cells, ms,
  partitions fetched/cached, the stats table and the copyable SQL or request URL).
- **Time strip** (bottom): records per decade for the current layer (the sum of `n` over the res-1
  decade files, one query per layer after the map has loaded, ~90–150 KB once); brushing a decade
  selects it, a click returns to all years. Decades exist for all taxa and the EOVs at res ≤ 5, and
  at any res for a WoRMS taxon; taxon groups say so instead.
- **Cell** (right edge): a pill that lights when a hexagon is clicked; open it for all five indicators.
  Hovering a hexagon shows them too.
- **Footer** (kit): built by Ocean Metrics · OBIS snapshot · data build date · release · version · bytes · ms · source.
- **Phone**: the panes become bottom sheets (Controls folded at first), the footer wraps.
- The URL hash holds the whole view, so any link reproduces it (see "URL" below). Old links to the
  Shiny app open the same view here once Caddy redirects them (see "Legacy URLs").

## URL

`#i=es&l=eov:fish&p=1990&r=auto&o=0.85&t=dark&d=release&g=flat&c=-20,5,1.4` — indicator, layer,
period, resolution, opacity, theme, ramp domain, projection, centre and zoom, in that order. All are
always written except the projection `g`: the map opens on the globe by default (0.5.1), so `g=flat`
is written for the flat map and `g` is left out for the globe (a link without `g` is the globe; an
older `g=flat` link still opens flat). 0.4.0 added layout keys, written only when not at their
default and after the keys above (tested):

| key | value | default |
|---|---|---|
| `k` | Controls tab: `taxon`, `place`, `indicator`, `share` | `taxon` |
| `cc=1` | Controls folded to its pill | open (folded on a phone when the link does not say) |
| `tc=1` | Time strip folded | open |
| `x` | the selected hexagon (H3 index); lights the Cell pill | none |
| `xo=1` | the Cell pane open | folded |
| `b=0` | basemap labels off | on |

No key was renamed, so no alias is needed; with no `t=` the theme is `?theme=`, then the stored kit
choice, then dark (the old default).

Query parameters (before the `#`) are switches, not view state: `?tour=off` (no welcome card, no
tour: screenshots and figures use it), `?tour=on` (replay the tour), `?modal=about|sources|keys` (open
that Help modal), `?theme=`, `?data=` and `?h3t=` (see below), `?legacy=` (see "Legacy URLs").

Not here: custom SQL, year ranges finer than decades, report export.

## Help, the tour and feedback

Modelled on calcofi.io/explore ("Help, the tour and feedback"). Logic in `src/lib/help/` and
`src/lib/feedback/` (tested in `tests/help.test.ts`); components `Welcome`, `Tour`, `Modal`,
`FeedbackDialog`.

- **Welcome card** (*Start here*): on a first visit (localStorage `obis-hex-welcome`), a small card over
  the map with two doors, *Show me seabird diversity* (seabirds EOV, res 3, worldwide) and *Zoom into a
  sanctuary* (class Aves, res 7, Monterey Bay), and three worked questions (hard corals by records;
  sea turtles in the 2010s; ES(50) in the Caribbean). Each is a link to a URL state; the theme and
  layout are kept.
- **Tour**: *Help ▾ → Take the tour*, the `?` key, or `?tour=on`. No library: a ring around one part
  of the page and a card with Skip / Back / Next (Done on the last). Nine stops in the page's order:
  the sentence → ① Taxon → ② Place & scale → ③ Indicator → the legend and the coverage line → the Time
  strip → the Cell pill → ④ Share → Help. Keys: ← → (PageUp/PageDown) move, Home/End jump, Esc ends;
  focus sits on Next and returns where it was. A stop on a Controls tab opens that tab (and unfolds
  Controls); the tab and folds are restored when the tour ends. Animated only without
  `prefers-reduced-motion`. The stops' words are `TOUR_STOPS` in `src/lib/help/tour.ts`.
- **Help ▾**: Take the tour · Guide ↗ (<https://marinebon.org/tools/obis-hex/>) · Start here · About
  (what the app is, the OBIS snapshot and release, the obisindicators version, who built it, the
  licence, *Cite this data*) · Data sources and attribution (OBIS with its citation and licence terms,
  WoRMS with its DOI, the IOOS MLDN EOV definitions, CARTO, the software credits; also
  `?modal=sources`) · Keyboard · What defines each EOV? ↗ · Register a product.
- **Keyboard**: `?` tour, `t` theme, `g` globe/flat, `1`–`4` Controls tabs, `+`/`-` zoom, `Esc`
  closes. Never while typing or with Ctrl/Alt/Meta held; only Esc while a dialog or the tour is open.
- **Feedback** (the speech bubble in the header): captures the view (the title band and the stage:
  map, sentence, panes; the header and footer are cropped, the map is composited from its own WebGL
  canvases), lets you draw a rectangle or an arrow or place text on it, and sends nothing itself:
  *Open a GitHub issue* opens `github.com/oceanmetrics/obis-hex/issues/new` prefilled (title, note,
  view URL, sentence, release, app version, viewport, theme; label `feedback`) and copies the image to
  the clipboard to paste in; *Copy report* puts the same text and the image on the clipboard;
  *Download PNG*. The body is cut to keep the URL under 7,500 characters (the note is trimmed, never
  the details). No email address is asked for. *Register a product* is the same dialog titled "I
  built something with this" (label `product`). The dialog and `html-to-image` load only on click.

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
match the basemap. So the globe is a plain URL field (`g=flat` for the flat map; the globe is the default since 0.5.1 and writes no key) with a toggle,
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
| `figA_app_seagrasses_caribbean.png` | seagrasses EOV, ES(50), res 4, the Caribbean, ② Place & scale open (`k=place`) |

Since 0.4.0 each figure shows the MBON layout: the title sentence, the Controls pane, the Time strip
and the footer; the script waits on `.shell[data-ready="1"]` (which now also waits for the ramp's
release stats) and logs the sentence (`.view-title`).

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
node scripts/shoot.mjs   # the UI assessment states at phone/laptop/projector → docs/ui-assessment/after/
                         # (welcome_* and tour-stop-1_* are the first-visit card and the tour's first stop)
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
| static critical path (MapLibre 6.10, deck.gl 9.4, h3-js, Svelte, app, CSS) | 601.6 KB (0.3.0) → 631.2 KB (0.4.0) → 637.5 KB (0.5.0) → 637.6 KB (0.5.1) | 650 KB |
| runtime worker (MapLibre's) | 140.2 KB | 150 KB |
| fonts and images (the kit's nine woff2 faces and the MBON wordmark; 0.4.0) | 538.1 KB raw | 600 KB |
| DuckDB-WASM (lazy: JS chunk 45 KB, wasm ~7.8 MB) | not counted | must stay lazy |
| feedback dialog + html-to-image (lazy, 0.5.0) | 3.9 KB + 5.3 KB, not counted | must stay lazy |

The atlas budget is 450 KB; deck.gl and h3-js add roughly 300 KB, hence 650 KB here. The viewport
code (`polygonToCells`, `gridDisk`) uses the h3-js already in the bundle for deck.gl, so 0.2.0 (viewport loading,
globe toggle, legacy links) added 4 KB and 0.3.0 (the WoRMS taxon search and subtree loader) another
4 KB; the budget is unchanged. 0.4.0 (the MBON layout on `@marinebon/ui`) added 23.6 KB of JS and
6.5 KB of CSS (gzip), within the 650 KB budget. The kit's self-hosted fonts and wordmark are in the
static graph as assets; they are already compressed, never parsed as script and fetched per face on
use, so they got their own 600 KB budget (`FONT_IMAGE_BUDGET_BYTES`) instead of a raise of the code
budget. 0.5.0 (welcome card, tour, Help modals, feedback bubble) added 6.3 KB; the feedback dialog and
`html-to-image` are a dynamic `import()`, and `fontEmbedCSS` (an html-to-image identifier) is a
forbidden marker in the static graph, like DuckDB's bundle names.

## Versions

- **0.5.1**: the map opens on the globe (`proj` default `globe`; `g=flat` is the only value written,
  see "URL"). The footer, About, Data sources and "Cite this data" state the data build date, the
  UTC day of `release.json` `built_at` (`OBIS 2026-07-28 · data 2026-10-07 · release v20260728 ·
  v0.5.1`), left out when the release has no `built_at`. `dataDateText()` in `src/lib/export/cite.ts`.

## Deploy

`.github/workflows/pages.yml` runs typecheck, svelte-check, tests, build and the size budget on every
push and pull request, and on `main` deploys the same `dist/` to GitHub Pages (Actions source). Vite's
`base` is `/obis-hex/`, served under the org's custom domain at <https://oceanmetrics.io/obis-hex/>.

## Pinned versions

`@duckdb/duckdb-wasm` 1.32.0 exactly (the atlas's spike S1: 1.33 dev builds are broken), deck.gl
9.4.0 (`@deck.gl/core`, `layers`, `geo-layers`, `mapbox`), `h3-js` 4.4.0, `maplibre-gl` ^6.10.0
(5.x has an unpatched critical XSS advisory), Svelte ^5.57, Vite ^8.3, vitest ^5, `playwright`
1.63.0 (dev, figures only), `html-to-image` 1.11.13 exactly (the feedback screenshot; the same
version MarineSensitivity/atlas and CalCOFI explore use).

## License

MIT, Ocean Metrics LLC. Data: [OBIS](https://obis.org), snapshot 2026-07-28.
