# obis-hex: UI assessment for the MBON-branded re-layout

Written 2026-10-08 against the live app, https://oceanmetrics.io/obis-hex/, **v0.3.0** (the deploy
moved from v0.2.0 to v0.3.0 while the first set was being taken; every screenshot here was retaken on
v0.3.0, which has the *Any taxon (WoRMS)* layer and viewport partitions at res 7). v0.3.0 is commit `2f58068`.

The target is the calcofi.io/explore layout (`~/Github/CalCOFI/docs/explore.qmd`): one map as the page,
a title sentence that is also the controls, a numbered Controls pane, Time along the bottom, one pill
on the right edge, every pane with the same bar, every view a URL, Help ▾ / feedback / theme in the
header, and "built by Ocean Metrics" in the footer. Information should read **dataset → place →
method → delivery**: what is this map of, where, computed how, and how do I take it with me.

Screenshots are in `docs/ui-assessment/`, taken with Playwright Chromium (SwiftShader WebGL) after
`.shell[data-ready="1"]` and the footer's timing text, then network idle + 2 s. The script is
`erddap-places/docs/ui-assessment/shoot.mjs` (`node shoot.mjs oh`). "Dark / light" is the app's
`t=` (it sets both the basemap and the UI theme).

## 1. What the app looks like now

| state (hash) | phone 390×844 | laptop 1280×800 | projector 1920×1080 |
|---|---|---|---|
| initial, dark (no hash: all taxa, ES(50), res 1 auto) | ![](ui-assessment/initial_dark_phone.png) | ![](ui-assessment/initial_dark_laptop.png) | ![](ui-assessment/initial_dark_projector.png) |
| initial, light (`t=light`) | ![](ui-assessment/initial_light_phone.png) | ![](ui-assessment/initial_light_laptop.png) | ![](ui-assessment/initial_light_projector.png) |
| EOV seabirds, res 3, dark | ![](ui-assessment/eov-seabirds_res3_dark_phone.png) | ![](ui-assessment/eov-seabirds_res3_dark_laptop.png) | ![](ui-assessment/eov-seabirds_res3_dark_projector.png) |
| EOV seabirds, res 3, light | ![](ui-assessment/eov-seabirds_res3_light_phone.png) | ![](ui-assessment/eov-seabirds_res3_light_laptop.png) | ![](ui-assessment/eov-seabirds_res3_light_projector.png) |
| Aves (class), res 7, Monterey Bay, dark | ![](ui-assessment/aves_res7_monterey_dark_phone.png) | ![](ui-assessment/aves_res7_monterey_dark_laptop.png) | ![](ui-assessment/aves_res7_monterey_dark_projector.png) |
| Aves (class), res 7, Monterey Bay, light | ![](ui-assessment/aves_res7_monterey_light_phone.png) | ![](ui-assessment/aves_res7_monterey_light_laptop.png) | ![](ui-assessment/aves_res7_monterey_light_projector.png) |
| EOV seabirds, res 2, globe, dark | ![](ui-assessment/eov-seabirds_globe_dark_phone.png) | ![](ui-assessment/eov-seabirds_globe_dark_laptop.png) | ![](ui-assessment/eov-seabirds_globe_dark_projector.png) |
| EOV seabirds, res 2, globe, light | ![](ui-assessment/eov-seabirds_globe_light_phone.png) | ![](ui-assessment/eov-seabirds_globe_light_laptop.png) | ![](ui-assessment/eov-seabirds_globe_light_projector.png) |

Hashes: `#i=es&l=eov:seabirds&p=all&r=3&…&g=flat&c=-20,5,1.4`;
`#i=es&l=taxon:class:Aves&p=all&r=7&…&c=-122.05,36.75,9.2`;
`#i=es&l=eov:seabirds&p=all&r=2&…&g=globe&c=-150,20,1.6`.

Annotations (laptop, seabirds res 3):

1. **Sidebar, 300 px, always open**: "OBIS hex" + a subtitle about Parquet in the browser; then
   Indicator, Layer (All taxa / EOV / Taxon group, and *Any taxon (WoRMS)* on its own row), the EOV
   select, Period, Resolution (number, *auto from zoom*, slider), Fill opacity, Colour ramp domain
   (release / loaded cells), Projection (flat / globe), Basemap (dark / light), SQL ▸. Nine control
   groups at the same visual weight; three of them (opacity, ramp domain, basemap) are display
   settings.
2. **Stats card, top left of the map**: the title line (indicator · layer · period (OBIS snapshot) ·
   H3 res) which is the nearest thing to a sentence, the ramp with "≤ 1.81 · release p02–p98 · ≥ 25.82",
   then a four-row table: cells "26,361 (9,196 with a value)", min · max, p02–p98, release p02–p98
   (the last two are equal whenever the domain is *release*).
3. **Map**, MapLibre + deck.gl, hover tooltip with all five indicators for the cell, click opens a
   cell card (h3, res, layer, period, values).
4. **Footer** under the map, ten items: partition path (`eov/eov=seabirds/res=3/data_0.parquet`),
   391.3 KB, 26,361 cells, 273 ms, DuckDB-WASM 1.32.0, release v20260728 (OBIS 2026-07-28), v0.3.0,
   source. At res 7 it adds "1 of 122 partitions (res 7 by parent cell)" and "1 fetched · 1 cached".

Phone: the sidebar stacks on top and takes 45 % of the screen, scrolling inside itself (ramp domain,
projection, basemap and SQL are out of sight); the stats card then covers half of what is left of the
map; the footer is cut off at "DuckDB-WAS". On the projector the globe at zoom 1.6 is a small disc in a
1620 px stage, and the stats card is the same 360 px.

Taxon group (Aves at res 7): a `filter taxa…` box and a six-row list box of class names A–Z
(Acantharia, Acavomonea, Aconoidasida, Actinobacteria …), no common names, no record counts, no
grouping; the chosen group is echoed below the list ("Aves (class)") and again in the stats title.

### The Shiny app it replaces (h3-db), 1280×800

![h3-db](ui-assessment/shiny_h3-db_laptop.png)

## 2. Inventory

Grades from the user's side: **P** primary, **S** secondary, **R** rarely used.

| control / readout | where now | what it does | when it matters | grade |
|---|---|---|---|---|
| Layer kind: All taxa / EOV / Taxon group / Any taxon (WoRMS) | sidebar | which records are pooled | every view | P |
| EOV select (7) | sidebar | the EOV | EOV views | P |
| taxon filter + list box (classes, orders…, A–Z) | sidebar | the taxon group | taxon views | P (needs a real picker) |
| WoRMS search (live h3t subtree) | sidebar | any AphiaID's children | power use | S |
| "▸ in WoRMS" link | stats title / sidebar | taxon authority | sometimes | S |
| Indicator select (ES(50), richness, Shannon, Simpson, records) | sidebar, first | the statistic | every view | P |
| Period (all years / 1960s … 2020s), disabled with a hint | sidebar | time slice | sometimes | S (Time pane) |
| Resolution number + *auto from zoom* + slider | sidebar | hexagon size | often | P |
| Fill opacity | sidebar | display | rarely | R |
| Colour ramp domain (release / loaded cells) | sidebar | legend scale | comparing regions | S |
| Projection (flat / globe) | sidebar | display | presenting | S (map button) |
| Basemap / theme (dark / light) | sidebar | display + UI theme | once | S (header toggle) |
| SQL ▸ (partition query, ramp domain query, request URL) + copy | sidebar foot | provenance | reproduce | R (Share) |
| stats title line | map card | what the map is | always | P (becomes the sentence) |
| ramp + domain labels | map card | colour scale | always | P |
| cells (n with a value) | map card | coverage | always | P (into the sentence) |
| min · max, p02–p98, release p02–p98 | map card | distribution | rarely | R |
| hover tooltip (all five indicators) | map | read one cell | often | P |
| cell card on click | map, right | one cell's values | sometimes | S |
| zoom + / − | map, top right | navigation | often | S |
| legacy notice banner (`?legacy=` from h3-db) | sidebar | explains a redirected bookmark | once | R |
| release-down banner | sidebar | error | on failure | S |
| footer: path, KB, cells, ms, partitions, fetched/cached | below map | cost | debugging | R (Share → SQL and timing) |
| footer: DuckDB version, app version, source | below map | provenance | rarely | R (one footer line) |
| footer: release + OBIS snapshot | below map | data version | citing | S (into the sentence / Cite) |

### What h3-db (Shiny) had that obis-hex lacks

- **Years as a range** (a two-handle slider along the bottom); obis-hex has decades only, and only
  for all taxa and EOVs at res ≤ 5. This is a data limit as much as a UI one: decades are what the
  release precomputes.
- **Share** button, **Schema** (the column dictionary) and **About** in the map's top bar.
- **View title** field (a user-set title, carried into exports).
- **"what defines each EOV?"** link next to the taxon picker.
- **Custom taxon filter** and **Advanced: custom SQL** checkboxes (custom SQL has no equivalent).
- **System theme** option (moon / gear) rather than only dark / light.
- Floating **RES** and **FILL** panels and a collapsible sidebar (the map gets the whole width).
- The globe as the default view.

obis-hex already matches h3-db on the WoRMS AphiaID children (*Any taxon (WoRMS)*), the stats table,
the generated SQL, and legacy bookmarks (`?legacy=` → hash, `docs/redirect.md`).

## 3. Clutter

- **Nine control groups open at once**, with display settings (opacity, ramp domain, projection,
  basemap) at the same weight as the question (taxon, indicator). Three of them are map furniture.
- **Indicator comes before the taxon.** The sidebar asks "how" before "what"; the stats title then
  reads indicator first too.
- **The stats card is a second legend plus a table** whose last two rows are usually identical; it
  covers the map's north-west at every size and half the map on a phone.
- **Footer noise**: ten items, most of them engine detail (paths, KB, ms, DuckDB version), sitting
  where the brand and credits should be. At phone width it is clipped.
- **The taxon list is a raw A–Z of classes** starting with protist and bacterial names; it needs the
  CalCOFI picker (groups with icons, record counts, log bars, search, A–Z as a fallback) and common
  names ("Aves — birds").
- **Hints in grey that explain why something is disabled** ("decades: all taxa and EOVs only"): keep
  the rule, but say it once where the decades are (the Time pane), not in the sidebar.
- **Resolution as a bare number.** "H3 res 7" means nothing to most users; say "~5 km² hexagons".
- **Coverage hides in a parenthesis**: at Aves res 7, 3,938 of 53,268 loaded cells have an ES(50)
  value (≥ 50 records). That ratio is the most important caveat on the map and belongs in the
  sentence, as CalCOFI's sentence states what the standardization excludes.
- **Phone**: sidebar on top eats the screen, card over the map, footer cut; the map is never the page.
- **Projector**: the globe is a small disc at the stored zoom and all text stays at laptop size.

## 4. Cut list

| item | decision |
|---|---|
| subtitle | remove (About in Help ▾) |
| Layer kind, EOV, taxon group, WoRMS search | fold into the sentence (taxon chip); also Controls ① |
| Indicator select | fold into the sentence; also Controls ③ |
| Period | fold into the sentence; Controls ② lists it, the Time pane sets it |
| Resolution + auto | fold into the sentence ("~12,400 km² hexagons · auto"); Controls ② |
| Fill opacity | fold under the layers card (map button) |
| Colour ramp domain | fold under Indicator → *More options* (and a click on the legend) |
| Projection | keep as a map button (globe / flat) in the top-right row |
| Basemap / theme | keep, as the header theme toggle (with system) |
| SQL ▸ | fold under Share → *Copy code* / *SQL and timing* |
| stats title | becomes the sentence |
| ramp + domain labels | keep, under the sentence |
| cells (n with a value) | fold into the sentence |
| min · max, p02–p98, release p02–p98 | fold into the right-edge pane (distribution) |
| hover tooltip, cell card | keep |
| footer engine items (path, KB, cells, ms, partitions, cache, DuckDB) | fold under Share → *SQL and timing* |
| footer release + OBIS snapshot | fold into the sentence and Cite |
| footer version, source | keep one footer line: MBON · built by Ocean Metrics · OBIS credit · source · version |
| legacy notice | keep (transient toast) |

## 5. Proposed main view

**Title sentence** (dataset → place → method):

"**Seabirds** (EOV) in OBIS records of **all years** (snapshot 2026-07-28), **worldwide**, in
**~12,400 km² hexagons** (H3 res 3): **expected species per 50 records, ES(50)**. 9,196 of 26,361
hexagons have ≥ 50 records."

At Monterey Bay: "**Birds** (class Aves) … **in view**, **~5 km² hexagons** (res 7, auto): ES(50).
3,938 of 53,268 hexagons have ≥ 50 records." "Worldwide / in view" is the place chip; it is honest
about what is loaded (the view's parent partitions) rather than a named region, unless a region
filter is added later.

**Controls tabs**: ① Taxon ② Place & scale ③ Indicator ④ Share, as asked; the facts support it. The
taxon decides which files load (the layer is the partition key), place and scale decide which
partitions and how many bytes (`planView()`, at most `MAX_PARENTS`), and the indicator is a column of
what is already loaded (switching it never refetches), so the tabs run from most to least costly.

1. **① Taxon**: All life / EOVs (7, with the "what defines each EOV?" link) / Taxon groups (grouped
   by phylum and rank, common names, record counts, log bars, search) / Any WoRMS taxon (live).
2. **② Place & scale**: worldwide or in view, a "go to" for named regions (sanctuaries, EEZs) as a
   later addition; hexagon size with *auto from zoom* and the area per size; the decades with their
   limits stated once.
3. **③ Indicator**: ES(50) (default), richness, Shannon, Simpson, records, each with one line of
   meaning; *More options*: ramp domain (whole release vs this view), opacity.
4. **④ Share**: Copy link; Download the view's cells (CSV / Parquet) and a zip (cells, SQL against the
   release object URLs, README, citation, `reproduce.R` / `reproduce.py`); Copy code; Cite (OBIS
   snapshot + release); PNG / SVG; Send feedback; *SQL and timing* (today's footer and SQL panel).

**Bottom pane (Time).** Records per decade for the current taxon (1960s–2020s, all years as the
default), click a decade to slice; it greys out with the reason when the taxon or resolution has no
decade layers. It replaces the Period select and stays useful when it cannot filter (it still shows
when the records came from). It needs records-per-decade in `stats.parquet` or a small summary file;
if that is not in the release, start the pane as decade buttons only.

**Right-edge pill.** **Distribution**: the histogram of the indicator over the loaded hexagons with
min · max, p02–p98 and the release p02–p98 marked, and the hovered or clicked cell drawn on it; the
cell card opens in the same pane. Folded by default.

**Map buttons (top right, one row)**: zoom, globe / flat, layers card (basemap detail, opacity), ⬇.

**Header and footer.** MBON wordmark + product name (e.g. "Marine biodiversity by hexagon"), Help ▾
(tour, guide, About, Schema, data sources), feedback, theme. Footer: "built by Ocean Metrics" · OBIS ·
source · version.

## 6. Must not regress

1. **URL state.** Every field of `AppState` round-trips through the hash (`i, l, p, r, o, t, d, g, c`),
   parsing never throws, and `?legacy=` h3-db bookmarks still land (`legacy.ts`, `docs/redirect.md`).
   New state (open panes, the right-edge pane, a view title) goes into `AppState`, `formatHash` /
   `parseHash` and `tests/url.test.ts` in the same change.
2. **Bytes per view.** Today: all taxa res 1 = 25 KB; seabirds res 3 = 391 KB; Aves res 7 over
   Monterey Bay = 1 of 122 partitions, 602 KB; seabirds res 2 = 103 KB. DuckDB stays a lazy chunk
   (`npm run size-budget`, 650 KB gzip static budget), `@duckdb/duckdb-wasm` pinned to 1.32.0,
   indicator switches never refetch, and the viewport plan keeps its `MAX_PARENTS` fallback. The
   re-layout must not make the map narrower or taller in a way that loads more parents.
3. **Tests and figures.** `npm test`, `npm run check`, `npx tsc --noEmit` and the size budget green
   (≈ 90 tests: url, legacy, manifest, resolution, viewport, ramp, release, engine, h3t, size budget);
   `npm run figures` must still reproduce paper 2's three figures — it waits on
   `.shell[data-ready="1"]` and reads `.stats .title`, so the new layout keeps a ready flag and a
   title element (or the script moves with it in the same change).
