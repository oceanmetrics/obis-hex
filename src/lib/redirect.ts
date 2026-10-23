// the redirect map of the freeze: an obis-hex link -> the Ocean Metrics URL that shows the same thing. Written, NOT
// activated: nothing navigates by it; the freeze banner offers the link and public/redirect/ holds the page that will
// (docs/redirects.md, "Activation"). Rewritten 2026-10-23 to the atlas grammar of the OBIS layer; it MIRRORS the atlas's
// codec (oceanmetrics/atlas src/lib/state/obisHex.ts, obisHexRedirect) and is driven by the same case table,
// tests/fixtures/obis_redirect_cases.json (copied from the atlas's tests/fixtures; edit it there first).
//
//   obis-hex   https://oceanmetrics.io/obis-hex/?tour=off#i=es&l=eov:fish&p=1990&r=3&o=0.85&t=dark&d=release&c=-20,5,1.4
//   atlas      https://oceanmetrics.io/atlas/?c=obis_h3&i=fish&dim.indicator=es&dim.period=1990s&res=3&map=-20,5,1.4&proj=globe&tour=off
//
// The keys, in the order written: `c=obis_h3` (the collection), `i=<item>` (`all` or an EOV key; a taxon filters `all`),
// `dim.indicator`, `dim.period` (`<decade>s` or `all`), `res` (`auto` or 1..7, clamped to what the atlas serves),
// `map=lon,lat,zoom` (this app's camera `c`, read from the old hash only: the atlas's `?c=` is the collection),
// `taxon=<rank>:<name>` or `aphia:<id>` (split on the FIRST `:`), `dom=view` (from `d=view`), `filter=coll:<slug>` (from
// `f=<collection>`), `proj` (always written: this app opens on the globe),
// `theme` and `tour` (query switches only), and in the hash `pl=` the outlined place as the atlas's `p.` token. A place
// outlined with no layer view chosen goes to the Place page. The hash `t` is this app's theme and the atlas's `t` is a
// report title, so it is never copied. A Shiny bookmark (`?legacy=`) is turned into a hash by legacyToState() first.
//
// The view is read by this app's own parse rules (layers.ts, url.ts, resolution.ts), so a link means here what it meant on screen.
import { EOVS, parseLayerKey, type LayerSel } from "./data/layers";
import { legacyQuery, legacyToState } from "./state/legacy";
import { RES_DECADE_MAX, RES_MAX, zoomToRes } from "./state/resolution";
import { DECADES, DEFAULT_STATE, formatHash, PLACE_COLL_RE, PLACE_ID_RE } from "./state/url";

export const OM_ORIGIN = "https://oceanmetrics.io";
/** the atlas collection id of the obis-h3 release */
export const OBIS_COLLECTION = "obis_h3";

export interface Redirect {
  /** where the same view lives in Ocean Metrics */
  url: string;
  /** true when the target shows what the old link showed */
  exact: boolean;
  /** what changed, joined with "; ", when anything the target shows differs (`exact` false) or was clamped */
  note?: string;
  /** the keys of the old link (hash keys, and `?<key>` for query switches) the target does not carry, sorted */
  dropped: string[];
  /** what changed, one line each */
  notes: string[];
}

/** the atlas serves a WoRMS subtree to res 5, and 4 with a decade (the species table's decade variant is res 3 and 4) */
export const RES_SUBTREE_MAX = 5;
export const RES_SUBTREE_DECADE_MAX = 4;

/** the hash's pairs: `l` raw, every other value decoded once (`+` is a space); an undecodable value is skipped */
function hashPairs(hash: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const kv of hash.split("&")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    const k = kv.slice(0, i);
    const raw = kv.slice(i + 1);
    try {
      out.set(k, k === "l" ? raw : decodeURIComponent(raw.replace(/\+/g, " ")));
    } catch {
      /* skip */
    }
  }
  return out;
}

/** a link (a whole URL, `?query#hash` or `#hash`) split into its query and hash, without the `?` and `#` */
function splitLink(url: string): { query: string; hash: string } {
  const s = String(url ?? "");
  const h = s.indexOf("#");
  const before = h < 0 ? s : s.slice(0, h);
  const q = before.indexOf("?");
  return { query: q < 0 ? "" : before.slice(q + 1), hash: h < 0 ? "" : s.slice(h + 1) };
}

/** the URLSearchParams string with `,` `:` `/` readable, as the atlas's prettyEncode writes it */
const pretty = (p: URLSearchParams) =>
  p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/");

/** the atlas's id encoding for a Place page path: encodeURIComponent with `:` `,` `|` readable */
const placesPath = (id: string) =>
  encodeURIComponent(id).replace(/%3A/gi, ":").replace(/%2C/gi, ",").replace(/%7C/gi, "|");

/** the atlas's `p.<id>.<name>` place token (src/lib/geo/placeCodec.ts encodePlace, kind "gaz", empty name):
 * the id percent-encoded from every byte but [A-Za-z0-9_-] */
function placeToken(id: string): string {
  let enc = "";
  for (const byte of new TextEncoder().encode(id)) {
    const ch = String.fromCharCode(byte);
    enc += /[A-Za-z0-9_-]/.test(ch) ? ch : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return `p.${enc}.`;
}

/**
 * Where an obis-hex link lives in Ocean Metrics, with what it loses. Never throws: an empty or unknown link gives the
 * atlas on the default view. `link` is a whole URL, `?query#hash` or `#hash`.
 */
export function redirectFor(link: string, origin: string = OM_ORIGIN): Redirect {
  const base = String(origin || OM_ORIGIN).replace(/\/+$/, "");
  const { query: fullQuery, hash: rawHash } = splitLink(link);
  // a Shiny bookmark's query is unencoded and swallows the rest of the query: only the switches BEFORE `legacy=` are ours
  const legacy = legacyQuery(fullQuery);
  const query = legacy ? fullQuery.replace(/(^|&)legacy=[\s\S]*$/, "") : fullQuery;
  const q = new URLSearchParams(query);
  const notes: string[] = [];
  let exact = true;

  // a Shiny bookmark becomes the hash it would have opened (the query switches stay)
  let hash = rawHash;
  if (legacy) {
    const r = legacyToState(legacy);
    hash = formatHash(r.state).slice(1);
    if (r.notice) {
      exact = false;
      notes.push(r.notice);
    }
  }
  const p = hashPairs(hash);

  // ---- the obis-hex view, by obis-hex's own parse rules ----
  const sel: LayerSel = parseLayerKey(p.get("l")) ?? { kind: "all" };
  const i = p.get("i") ?? "";
  const indicator = ["es", "sp", "shannon", "simpson", "n"].includes(i) ? i : "es";
  const per = p.get("p");
  let decade: number | null =
    per && per !== "all" && (DECADES as readonly number[]).includes(Number(per)) ? Number(per) : null;
  const r = p.get("r");
  const rn = Number(r);
  let res: number | "auto" =
    r && r !== "auto" && Number.isInteger(rn) && rn >= 1 && rn <= RES_MAX ? rn : "auto";
  const proj = p.get("g") === "flat" ? "mercator" : "globe";
  const cam = (p.get("c") ?? "").split(",").map(Number);
  const camOk =
    cam.length === 3 &&
    cam.every(Number.isFinite) &&
    cam[0] >= -540 &&
    cam[0] <= 540 &&
    cam[1] >= -90 &&
    cam[1] <= 90 &&
    cam[2] >= 0 &&
    cam[2] <= 22;
  const [lon, lat, zoom] = camOk ? cam : [DEFAULT_STATE.lon, DEFAULT_STATE.lat, DEFAULT_STATE.zoom];
  const plRaw = (p.get("pl") ?? "").trim();
  const place = PLACE_ID_RE.test(plRaw) ? plRaw : null;
  const placeColl = place && PLACE_COLL_RE.test(p.get("pc") ?? "") ? p.get("pc")! : null;

  const present = [...p.keys(), ...[...q.keys()].map((k) => `?${k}`)];
  const dropOf = (carried: Set<string>) =>
    [...new Set(present.filter((k) => !carried.has(k)))].sort();
  const out = (url: string, dropped: string[]): Redirect => ({
    url,
    exact,
    ...(notes.length ? { note: notes.join("; ") } : {}),
    dropped,
    notes,
  });

  // ---- a place outlined and no layer view chosen: the Place page (exact values, not hexagon statistics) ----
  const realView = sel.kind !== "all" || indicator !== "es" || decade !== null || res !== "auto";
  if (place && !realView)
    return out(`${base}/places/p/${placesPath(place)}`, dropOf(new Set(["pl"])));

  // ---- the atlas OBIS layer ----
  if (sel.kind === "taxon" && decade !== null) {
    decade = null;
    exact = false;
    notes.push(
      "a taxon group has no decade layers in the release (obis-hex loaded nothing): the period is all",
    );
  }
  const cap =
    sel.kind === "aphia"
      ? decade === null
        ? RES_SUBTREE_MAX
        : RES_SUBTREE_DECADE_MAX
      : decade === null
        ? RES_MAX
        : RES_DECADE_MAX;
  if (typeof res === "number" && res > cap) {
    // obis-hex clamped a release decade to 5 itself, so that clamp loses nothing; a live AphiaID subtree drew 7
    if (sel.kind === "aphia") {
      exact = false;
      notes.push(`the atlas serves a WoRMS subtree up to res ${cap}; obis-hex drew res ${res}`);
    } else notes.push(`res ${res} with a decade is res ${cap}, as obis-hex drew it`);
    res = cap;
  } else if (res === "auto" && sel.kind === "aphia" && Math.min(zoomToRes(zoom), RES_MAX) > cap) {
    exact = false;
    notes.push(
      `at zoom ${zoom} obis-hex drew a WoRMS subtree at res ${Math.min(zoomToRes(zoom), RES_MAX)}; the atlas serves up to res ${cap}`,
    );
  }

  const params = new URLSearchParams();
  params.set("c", OBIS_COLLECTION);
  params.set("i", sel.kind === "eov" && EOVS.some((e) => e.id === sel.eov) ? sel.eov : "all");
  params.set("dim.indicator", indicator);
  params.set("dim.period", decade === null ? "all" : `${decade}s`);
  params.set("res", String(res));
  params.set("map", `${lon},${lat},${zoom}`);
  if (sel.kind === "taxon") params.set("taxon", `${sel.rank}:${sel.taxon}`);
  if (sel.kind === "aphia") params.set("taxon", `aphia:${sel.id}`);
  const carried = new Set(["i", "l", "p", "r", "c", "g"]);
  // the ramp domain: `d=view` (the loaded hexagons) is the atlas's `dom=view`; `d=release` (this app's default) and
  // anything else is the atlas's default, the release's stats.parquet range, so it is not carried
  if (p.get("d") === "view") {
    params.set("dom", "view");
    carried.add("d");
  }
  // `f=<collection>` (no ids) is the atlas's `filter=coll:<slug>`; `f=<collection>|<ids>` (some of a collection's
  // places) and a malformed value are not carried
  const filt = p.get("f") ?? "";
  const filterColl = !filt.includes("|") && PLACE_COLL_RE.test(filt) ? filt : null;
  if (filterColl) {
    params.set("filter", `coll:${filterColl}`);
    carried.add("f");
  }
  params.set("proj", proj);
  const theme = (q.get("theme") ?? "").toLowerCase();
  if (theme === "dark" || theme === "light") {
    params.set("theme", theme);
    carried.add("?theme");
  }
  const tour = (q.get("tour") ?? "").toLowerCase();
  if (tour === "on" || tour === "off") {
    params.set("tour", tour);
    carried.add("?tour");
  }

  let hashOut = "";
  if (place) {
    const pl = new URLSearchParams();
    pl.set("pl", placeToken(place));
    hashOut = `#${pretty(pl)}`;
    carried.add("pl");
    if (placeColl) {
      exact = false;
      notes.push(
        "the place's collection (pc) is not carried: the atlas resolves the id through the gazetteer index",
      );
    }
  }
  if (p.has("x")) {
    exact = false;
    notes.push("the selected hexagon (x) is not carried");
  }
  if ((p.has("f") && !filterColl) || p.get("v") === "places") {
    exact = false;
    notes.push(
      "the filter by chosen places (f=<collection>|<ids>), a malformed f and the view as places (v) are not carried; the Place page has the exact values",
    );
  }
  if (q.has("data")) {
    exact = false;
    notes.push(
      "the pinned release (?data=) is not carried: the atlas reads the current obis-h3 collection",
    );
  }
  return out(`${base}/atlas/?${pretty(params)}${hashOut}`, dropOf(carried));
}
