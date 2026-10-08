// where the published gazetteer lives. Kept apart from index.ts so the map (always loaded) can build a
// PMTiles URL without pulling in the picker's code, which loads with the Place panel.

/** the published gazetteer, read from the bucket host: `storage.oceanmetrics.io` answers a 302
 * without CORS headers, which browsers reject before following (README, "Place outline") */
export const GAZETTEER_BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/gazetteer/";
export const LAYERS_URL = `${GAZETTEER_BASE}layers.json`;
export const INDEX_URL = `${GAZETTEER_BASE}index/places_index.parquet`;

/** the map's own credit for the occurrence data; a gazetteer credit never repeats its links */
export const OBIS_CREDIT = '<a href="https://obis.org" target="_blank" rel="noopener">OBIS</a>';

/** a collection's PMTiles (source layer == slug) */
export const pmtilesUrl = (slug: string) => `${GAZETTEER_BASE}${slug}/places.pmtiles`;
