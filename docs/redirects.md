# Redirect map: obis-hex -> Ocean Metrics

Written 2026-10-22 (0.11.3, the freeze); the map rewritten to the atlas grammar and the redirect page written 2026-10-23.
**Activated 2026-10-24 on Ben's go.** obis-hex is frozen (bug fixes only); its layers move to the Ocean Metrics Atlas in build week 4
(2026-11-20 to 11-26), when this address redirects. Until then the only use of the map is the freeze banner's link,
"Open in the Atlas ↗", which shows what the redirect will do. There is no 404 page, no DNS change, and nothing forwards to
the redirect page. (The other file here, `redirect.md`, is the Caddy redirect for the Shiny app.)

The map is one pure function, `redirectFor(link, origin = 'https://oceanmetrics.io')` in `src/lib/redirect.ts`. `link` is
a whole URL, `?query#hash` or `#hash`. It returns `{ url, exact, note?, dropped, notes }`: `exact` is true when the target
shows what the old link showed, `dropped` lists the old keys the target does not carry (`?<key>` for a query switch) and
`notes` says what changed. It never throws; an empty or unknown link gives the atlas on its default view. A Shiny bookmark
(`?legacy=`) runs through `legacyToState()` first.

**It mirrors the atlas.** The atlas's codec (`oceanmetrics/atlas` `src/lib/state/obisHex.ts`, `obisHexRedirect`) and this
function are driven by one case table, `tests/fixtures/obis_redirect_cases.json`, copied from the atlas's
`tests/fixtures/` (edit it there first; `tests/redirect.test.ts` also compares the copy with the atlas checkout when the
two sit side by side). All 32 cases agree on both sides.

## Rules

Old: `https://oceanmetrics.io/obis-hex/?tour=off#i=es&l=eov:fish&p=1990&r=3&o=0.85&t=dark&d=release&c=-20,5,1.4`
New: `https://oceanmetrics.io/atlas/?c=obis_h3&i=fish&dim.indicator=es&dim.period=1990s&res=3&map=-20,5,1.4&proj=globe&tour=off`

The atlas query keys are written in this order: `c=obis_h3`, `i`, `dim.indicator`, `dim.period`, `res`, `map`, `taxon`,
`proj`, `theme`, `tour`; the hash carries only `pl`.

| old | new | rule |
|---|---|---|
| `pl=<id>` with `l`, `i`, `p`, `r` all at their defaults (`all`, `es`, `all`, `auto`) | `https://oceanmetrics.io/places/p/<id>` | `exact: true`. No layer view is chosen, so the view is the place. `:` kept, a space percent-encoded. Every other key is dropped |
| anything else | `https://oceanmetrics.io/atlas/?c=obis_h3&…` | see below |
| `l` | `i` and `taxon` | `all` -> `i=all`; `eov:<key>` -> `i=<key>`; `taxon:<rank>:<name>` -> `i=all&taxon=<rank>:<name>` (split before decoding, so an encoded `:` stays in the name); `aphia:<id>` -> `i=all&taxon=aphia:<id>` |
| `i` | `dim.indicator` | `es|sp|shannon|simpson|n`; anything else `es` |
| `p` | `dim.period` | a decade -> `<decade>s`; `all` or anything else -> `all`; a taxon group has no decade layers, so `all` with `exact: false` |
| `r` | `res` | `auto` or 1..7, else `auto`; clamped to 5 with a decade, 5 for an AphiaID subtree, 4 for a subtree with a decade (inexact for a subtree) |
| `c` (hash) | `map` | `lon,lat,zoom`; malformed or absent -> the opening camera. The atlas's `?c=` is the collection, so the old `c` is read from the hash only |
| `g` | `proj` | absent or `globe` -> `proj=globe` (written explicitly); `flat` -> `mercator` |
| `pl` on a chosen view | `#pl=p.<id>.` | the atlas's place token; `pc` is not carried (`exact: false`) |
| `?tour`, `?theme` | `tour`, `theme` | `on|off`, `dark|light`, the atlas's own switches |
| `x`, `f`, `v`, `?data` | dropped | `exact: false`, with a note |
| `o`, `t`, `d`, `b`, `k`, `cc`, `tc`, `xo`, `?modal`, `?h3t` | dropped | layout, theme, colour domain; `exact` unchanged. The hash `t` is the old theme and the atlas's `t` is a report title: never copied |

The full table with the reason for each key is the `keys` object of `tests/fixtures/obis_redirect_cases.json`.

## The redirect page (written 2026-10-23, not active)

The template is shared with erddap-places and lives in its repo (`erddap-places/app/static/redirect/`; see
`erddap-places/docs/redirects.md`, "The redirect page"). Here:

| file | where | what |
|---|---|---|
| `redirect.html`, `redirect.js` | `public/redirect/` | the template, copied by `node scripts/sync-redirect.mjs` (never edited here) |
| `config.json` | `public/redirect/` | `{ app: "OBIS hex", target: "the Ocean Metrics Atlas", codec: "./codec.js", stay: "../", home }` |
| `codec.js` | `dist/redirect/`, built by `vite.config.ts` (`redirectCodec`) from `src/lib/redirect.ts` | this app's `redirectFor`, with `?legacy=` |

The page is `https://oceanmetrics.io/obis-hex/redirect/redirect.html`. It passes `?query#hash` to `redirectFor`, shows
"This app moved to the Ocean Metrics Atlas; taking you there…", the computed link, the note, and "Stay here" for 5 s, then
`location.replace`. `?noredirect=1` keeps the page. Copies of the template are identical by checksum:
`tests/redirectPage.test.ts` pins the SHA-256 (the same constant as erddap-places') and compares with the sibling checkout.

## Activation (Ben's go 2026-10-24: ACTIVE since that day; `?noredirect=1` keeps the app)

Preconditions (plan section 7 (d)): the parity checklist passes; the atlas OBIS layer reads the stable `obis-h3/collection.json`
and survives a release change; this map passes the case table and the atlas opens every example above to the same layer,
indicator, period, resolution and camera (a Playwright spec over the table); the paper figures have a home (D7); h3t keeps
running until week 6.

Then one line in `index.html`, first thing in `<head>`:

```html
<script>if(!/[?&]noredirect=1/.test(location.search))location.replace('./redirect/redirect.html'+location.search+location.hash)</script>
```

Every old link lands on the template, which carries it to the atlas after the 5 s notice. To check before the go, open
`https://oceanmetrics.io/obis-hex/redirect/redirect.html?noredirect=1#<old hash>`. The plan then moves the app to a tagged
archive (`v0.11.x`, buildable, not served), so that the final state is the redirect page alone; the freeze banner goes with
the app. To undo: remove the line and redeploy.

## Examples

- `#i=shannon&l=eov:fish&p=1990&r=3&o=0.85&t=light&d=release&c=-20.00,5.00,1.40` -> `https://oceanmetrics.io/atlas/?c=obis_h3&i=fish&dim.indicator=shannon&dim.period=1990s&res=3&map=-20,5,1.4&proj=globe`
- `#l=taxon:class:Aves&i=es` -> `…&i=all&dim.indicator=es&dim.period=all&res=auto&map=-103.7,33.2,2.57&taxon=class:Aves&proj=globe`
- `#pl=NMS:MBNMS` -> `https://oceanmetrics.io/places/p/NMS:MBNMS` (exact)
- the default state, `#i=es&l=all&p=all&r=auto&o=0.85&t=dark&d=release&c=-103.7,33.2,2.57` -> `https://oceanmetrics.io/atlas/?c=obis_h3&i=all&dim.indicator=es&dim.period=all&res=auto&map=-103.7,33.2,2.57&proj=globe`
