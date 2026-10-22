// the redirect map of the freeze (2026-10-22): an obis-hex hash -> the Ocean Metrics URL that will show
// the same thing. Written, NOT activated: nothing navigates by it, the freeze banner only offers the link.
// The table and the reason for each rule: docs/redirects.md.
//
//   a place outlined and no layer chosen   #…&pl=NMS:MBNMS            -> https://oceanmetrics.io/places/p/NMS:MBNMS   (exact)
//   anything else                          #i=es&l=eov:fish&p=1990&r=3&c=-20,5,1.4
//        -> https://oceanmetrics.io/atlas/?c=obis_h3#i=es&l=eov:fish&p=1990&r=3&c=-20,5,1.4   (not exact until build week 4)
//
// in the atlas link `?c=obis_h3` is the atlas's collection switch (a query key) and the hash's `c` is still this app's
// camera (lon,lat,zoom): the two are in different namespaces, and the atlas reads the hash keys under the names below.

export const OM_ORIGIN = 'https://oceanmetrics.io'

export interface Redirect {
  /** where the same view lives in Ocean Metrics */
  url: string
  /** true when the target shows what the old link showed */
  exact: boolean
  /** what the target does not do yet, when `exact` is false */
  note?: string
}

/** the hash keys the atlas will read from an obis-hex link, under the same names, in this order:
 * the layer, the indicator, the period (a decade or `all`), the resolution and the camera */
export const ATLAS_KEYS = ['l', 'i', 'p', 'r', 'c'] as const

export const NOTE_ATLAS = 'the obis-h3 collection arrives in the atlas in build week 4 (2026-11-20 to 11-26)'

/** the hash's key/value pairs, values decoded once (a value that does not decode is skipped); a whole URL works too */
function pairs(hash: string): Map<string, string> {
  const h = String(hash ?? '')
  const i = h.indexOf('#')
  const out = new Map<string, string>()
  for (const kv of (i < 0 ? '' : h.slice(i + 1)).split('&')) {
    const j = kv.indexOf('=')
    if (j <= 0) continue
    try { out.set(kv.slice(0, j), decodeURIComponent(kv.slice(j + 1).replace(/\+/g, ' '))) } catch { /* skip */ }
  }
  return out
}

/** encodeURIComponent with the readable `:`, `,` and `|` kept, as obis-hex writes its hashes */
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%7C/gi, '|')

/**
 * Where an obis-hex hash lives in Ocean Metrics. Never throws: an empty or unknown hash gives the bare atlas
 * link. The keys with no counterpart (`o`, `t`, `d`, `g`, `k`, `cc`, `tc`, `x`, `xo`, `b`, `pc`, `f`, `v`) are
 * dropped without a note: they are layout, the theme, the colour domain and the place filter.
 */
export function redirectFor(hash: string, origin: string = OM_ORIGIN): Redirect {
  const base = String(origin || OM_ORIGIN).replace(/\/+$/, '')
  const p = pairs(hash)
  const place = (p.get('pl') ?? '').trim()
  const layer = p.get('l') ?? 'all'
  if (place && layer === 'all') return { url: `${base}/places/p/${enc(place)}`, exact: true }
  const hashPart = ATLAS_KEYS.filter((k) => p.get(k)).map((k) => `${k}=${enc(p.get(k)!)}`).join('&')
  return { url: `${base}/atlas/?c=obis_h3${hashPart ? '#' + hashPart : ''}`, exact: false, note: NOTE_ATLAS }
}
