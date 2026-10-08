// where the published gazetteer lives. Kept apart from index.ts so the map (always loaded) can build a
// PMTiles URL without pulling in the picker's code, which loads with the Place panel.

/** the published gazetteer, read from the bucket host: `storage.oceanmetrics.io` answers a 302
 * without CORS headers, which browsers reject before following (README, "Place outline") */
export const GAZETTEER_BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/";
/** the manifest's canonical path, with `<base>layers.json` as the fallback */
export const INDEX_LAYERS_URL = `${GAZETTEER_BASE}index/layers.json`;
export const LAYERS_URL = `${GAZETTEER_BASE}layers.json`;
export const INDEX_URL = `${GAZETTEER_BASE}index/places_index.parquet`;

/** the map's own credit for the occurrence data; a gazetteer credit never repeats its links */
export const OBIS_CREDIT = '<a href="https://obis.org" target="_blank" rel="noopener">OBIS</a>';

/** the base the manifest's `base_direct` names, when a browser can use it, else GAZETTEER_BASE.
 * `base_direct` must be https and must not be a virtual-hosted S3 URL with a dot in the bucket name
 * (`https://oceanmetrics.io-public.s3.amazonaws.com/...`): the S3 wildcard certificate does not cover
 * it, so the browser refuses the connection. */
export function directBase(manifest: unknown): string {
  const b = (manifest as { base_direct?: unknown })?.base_direct;
  if (typeof b !== "string") return GAZETTEER_BASE;
  let u: URL;
  try {
    u = new URL(b);
  } catch {
    return GAZETTEER_BASE;
  }
  if (u.protocol !== "https:") return GAZETTEER_BASE;
  const bucket = /^(.+)\.s3[.-][a-z0-9-]*\.?amazonaws\.com$/.exec(u.hostname)?.[1];
  if (bucket?.includes(".")) return GAZETTEER_BASE;
  return b.endsWith("/") ? b : `${b}/`;
}

/** a collection's PMTiles (source layer == slug) under `base` */
export const pmtilesUrl = (slug: string, base: string = GAZETTEER_BASE) => `${base}${slug}/places.pmtiles`;
