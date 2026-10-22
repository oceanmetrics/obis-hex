# Redirect map: obis-hex -> Ocean Metrics

Written 2026-10-22 (0.11.3, the freeze). **Not activated.** obis-hex is frozen (bug fixes only); its layers move to the
Ocean Metrics Atlas in build week 4 (2026-11-20 to 11-26), when this address redirects. Until then the only use of the
map is the freeze banner's link, "Open in the Atlas ↗", which shows what the redirect will do. There is no 404 page, no
JavaScript redirect and no DNS change. (The other file here, `redirect.md`, is the Caddy redirect for the Shiny app.)

The map is one pure function, `redirectFor(hash, origin = 'https://oceanmetrics.io')` in `src/lib/redirect.ts`, tested in
`tests/redirect.test.ts` (one test per rule). It returns `{ url, exact, note? }`: `exact` is true when the target shows
what the old link showed. It never throws; an empty or unknown hash gives the bare atlas link. The banner passes it
`formatHash(st)`, so the link follows the view.

## Rules

Evaluated in this order.

| old | new | rule |
|---|---|---|
| `pl=<id>` with `l` absent or `l=all` (the default layer, which the app always writes) | `https://oceanmetrics.io/places/p/<id>` | `exact: true`. A place is outlined and no layer is chosen, so the view is the place. `:` kept, a space percent-encoded (`pl=BOEM:OCS-P%200561` -> `/places/p/BOEM:OCS-P%200561`). `pc` is dropped (the Place page is keyed by id); `i`, `p`, `r`, `c` are not carried: they describe a layer view |
| anything else | `https://oceanmetrics.io/atlas/?c=obis_h3#<l, i, p, r, c that are present>` | `exact: false`, note "the obis-h3 collection arrives in the atlas in build week 4 (2026-11-20 to 11-26)" |

In the atlas link `?c=obis_h3` is the atlas's collection key (a query key); the hash's `c` is still obis-hex's camera
(`lon,lat,zoom`). They are different namespaces. The atlas reads these hash keys under the same names, written in this
order and only when present:

| key | meaning | example |
|---|---|---|
| `l` | layer: `all`, `eov:<k>`, `taxon:<rank>:<name>`, `aphia:<id>` | `l=eov:seabirds` |
| `i` | indicator: `es`, `sp`, `shannon`, `simpson`, `n` | `i=es` |
| `p` | period: `all` or a decade | `p=1990` |
| `r` | hexagon size: `auto` or a resolution | `r=3` |
| `c` | camera `lon,lat,zoom` | `c=-20,5,1.4` |

Dropped without a note (layout, theme, colour domain, selection, filter): `o`, `t`, `d`, `g`, `k`, `cc`, `tc`, `x`, `xo`,
`b`, `pc`, `f`, `v`, and `pl` when a layer is chosen (the outline is not carried to the atlas link).

## Examples

- `#i=shannon&l=eov:fish&p=1990&r=3&o=0.85&t=light&d=release&c=-20,5,1.4` -> `https://oceanmetrics.io/atlas/?c=obis_h3#l=eov:fish&i=shannon&p=1990&r=3&c=-20,5,1.4`
- `#l=taxon:class:Aves&i=es` -> `https://oceanmetrics.io/atlas/?c=obis_h3#l=taxon:class:Aves&i=es`
- `#pl=NMS:MBNMS` -> `https://oceanmetrics.io/places/p/NMS:MBNMS` (exact)
- the default state, `#i=es&l=all&p=all&r=auto&o=0.85&t=dark&d=release&c=-103.7,33.2,2.57` -> `https://oceanmetrics.io/atlas/?c=obis_h3#l=all&i=es&p=all&r=auto&c=-103.7,33.2,2.57`
