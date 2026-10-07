// links from the retired Shiny app (app.marinesensitivity.org/h3-db, MarineSensitivity/apps
// h3-db/app.R) → obis-hex hash state. Caddy answers /h3-db/* with a 302 to
// `https://oceanmetrics.io/obis-hex/?legacy=<the original query, as-is>` (docs/redirect.md).
//
// The Shiny app bookmarks with `enableBookmarking = "url"`: `?_inputs_&name=<JSON>&…`, each value
// a URL-encoded JSON literal (`indicator=%22es%22`, `years=%5B1990%2C1999%5D`,
// `map_center=%7B%22lng%22%3A-80%2C%22lat%22%3A25%7D`). Unknown or unsupported inputs are ignored;
// a view the static release cannot reproduce exactly (an AphiaID subtree, custom SQL, a family/
// genus/species filter, a year range that is not a decade) maps to the closest layer and returns
// a one-line notice saying so. Parsing never throws.
import { layerKey, type Indicator, type LayerSel } from "../data/layers";
import { DECADES, DEFAULT_STATE, type AppState } from "./url";
import { RES_DECADE_MAX, RES_MAX } from "./resolution";

/** the Shiny app's full year range (YR_MIN, YR_MAX): selecting all of it means "all years". */
export const LEGACY_YEARS: readonly [number, number] = [1900, 2026];

const taxon = (rank: string, name: string): LayerSel => ({ kind: "taxon", rank, taxon: name });

/** `preset=` values (the stored names in app.R PRESETS and EOV_PRESETS) → the closest layer.
 * `note` is set where the release's rank-column group differs from the app's AphiaID subtree. */
export const LEGACY_PRESETS: Record<string, { sel: LayerSel; note?: string }> = {
  "All taxa": { sel: { kind: "all" } },
  // taxon-group presets (WoRMS AphiaID subtrees in the Shiny app)
  "Seabirds (class Aves)": { sel: taxon("class", "Aves") },
  "Bony fishes (Actinopterygii)": {
    sel: taxon("class", "Teleostei"),
    note: "Actinopterygii (a WoRMS gigaclass) is shown as OBIS class Teleostei",
  },
  "Sharks & rays (Elasmobranchii)": { sel: taxon("class", "Elasmobranchii") },
  "Marine mammals (Mammalia)": { sel: taxon("class", "Mammalia") },
  "Sea turtles (order Testudines)": { sel: taxon("order", "Testudines") },
  "Corals & anemones (Anthozoa)": {
    sel: taxon("class", "Hexacorallia"),
    note: "Anthozoa (a WoRMS subphylum) is shown as OBIS class Hexacorallia (Octocorallia is a separate layer)",
  },
  "Mollusks (phylum Mollusca)": { sel: taxon("phylum", "Mollusca") },
  "Crustaceans (Malacostraca)": { sel: taxon("class", "Malacostraca") },
  // Essential Ocean Variables (stored as obis_eov_seeds() labels)
  Fish: { sel: { kind: "eov", eov: "fish" } },
  "Hard corals": { sel: { kind: "eov", eov: "hardCorals" } },
  Mangroves: { sel: { kind: "eov", eov: "mangroves" } },
  "Marine mammals": { sel: { kind: "eov", eov: "marineMammals" } },
  Seabirds: { sel: { kind: "eov", eov: "seabirds" } },
  Seagrasses: { sel: { kind: "eov", eov: "seagrasses" } },
  "Sea turtles": { sel: { kind: "eov", eov: "seaTurtles" } },
};

/** "Children of a WoRMS AphiaID" values with a close layer (the app's own examples and presets). */
export const LEGACY_APHIAIDS: Record<number, { sel: LayerSel; label: string }> = {
  1836: { sel: taxon("class", "Aves"), label: "class Aves" },
  10194: { sel: taxon("class", "Teleostei"), label: "class Teleostei" },
  10193: { sel: taxon("class", "Elasmobranchii"), label: "class Elasmobranchii" },
  1837: { sel: taxon("class", "Mammalia"), label: "class Mammalia" },
  2688: { sel: { kind: "eov", eov: "marineMammals" }, label: "the marine mammals EOV" },
  2689: { sel: taxon("order", "Testudines"), label: "order Testudines" },
  1292: { sel: taxon("class", "Hexacorallia"), label: "class Hexacorallia" },
  51: { sel: taxon("phylum", "Mollusca"), label: "phylum Mollusca" },
  1071: { sel: taxon("class", "Malacostraca"), label: "class Malacostraca" },
  148899: { sel: taxon("class", "Bacillariophyceae"), label: "class Bacillariophyceae" },
};

const INDICATOR_IDS: Indicator[] = ["es", "sp", "shannon", "simpson", "n"];
const RELEASE_RANKS = ["phylum", "class", "order"];
const EOV_KEYS = ["fish", "hardCorals", "mangroves", "marineMammals", "seabirds", "seagrasses", "seaTurtles"];

/** the legacy query string from the page's `location.search`: everything after `legacy=` (the
 * redirect appends the original query unencoded), or a single encoded value. "" when absent. */
export function legacyQuery(search: string): string {
  const s = search.replace(/^\?/, "");
  const m = /(?:^|&)legacy=/.exec(s);
  if (!m) return "";
  const rest = s.slice(m.index + m[0].length);
  // one encoded value (?legacy=_inputs_%26indicator%3D…): decode it once
  if (!rest.includes("&") && /%26|%3D/i.test(rest)) {
    try {
      return decodeURIComponent(rest);
    } catch {
      return rest;
    }
  }
  return rest;
}

/** Shiny bookmark params, each URL-decoded and JSON-parsed (undefined when unparsable). */
export function legacyInputs(query: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const kv of query.replace(/^\?/, "").split("&")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    let raw: string;
    try {
      raw = decodeURIComponent(kv.slice(i + 1));
    } catch {
      continue;
    }
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      v = raw; // a bare value (hand-written link)
    }
    out.set(kv.slice(0, i), v);
  }
  return out;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** the layer a custom SQL query most likely shows: `idx_h3_eov … eov = 'x'`, `idx_h3_taxon …
 * rank = 'r' AND taxon = 't'`, else all taxa; plus the indicator projected `AS value`. */
export function sqlToLayer(sql: string): { sel: LayerSel; indicator: Indicator | null } {
  const ind = /\b(es|sp|shannon|simpson|n)\b\s+AS\s+value\b/i.exec(sql)?.[1]?.toLowerCase();
  const indicator = (INDICATOR_IDS as string[]).includes(ind ?? "") ? (ind as Indicator) : null;
  const eov = /\beov\s*=\s*'([A-Za-z]+)'/.exec(sql)?.[1];
  if (/\bidx_h3_eov\b/i.test(sql) && eov && EOV_KEYS.includes(eov))
    return { sel: { kind: "eov", eov }, indicator };
  const rank = /\brank\s*=\s*'([a-z]+)'/i.exec(sql)?.[1]?.toLowerCase();
  const tx = /\btaxon\s*=\s*'([^']+)'/i.exec(sql)?.[1];
  if (/\bidx_h3_taxon\b/i.test(sql) && rank && tx && RELEASE_RANKS.includes(rank))
    return { sel: taxon(rank, tx), indicator };
  return { sel: { kind: "all" }, indicator };
}

export interface LegacyResult {
  state: AppState;
  /** one line for the user when the old view could not be reproduced exactly ("" otherwise) */
  notice: string;
}

/** map a legacy h3-db query string (with or without `?`, `_inputs_` optional) to obis-hex state. */
export function legacyToState(query: string): LegacyResult {
  const q = legacyInputs(query);
  const s: AppState = { ...DEFAULT_STATE };
  const notes: string[] = [];
  const label = (sel: LayerSel) =>
    sel.kind === "all" ? "all taxa" : sel.kind === "eov" ? `the ${sel.eov} EOV` : `${sel.rank} ${sel.taxon}`;

  // indicator ----
  const ind = str(q.get("indicator"));
  if ((INDICATOR_IDS as string[]).includes(ind)) s.indicator = ind as Indicator;

  // layer: preset, then the overrides in app.R's order of precedence ----
  const preset = LEGACY_PRESETS[str(q.get("preset"))] ?? LEGACY_PRESETS["All taxa"];
  let sel = preset.sel;
  if (preset.note) notes.push(preset.note);
  const rank = str(q.get("rank")).toLowerCase();
  const taxonVal = str(q.get("taxon_val")).trim();
  const aphia = str(q.get("aphiaid_val")).trim();
  if (q.get("custom_sql") === true) {
    const m = sqlToLayer(str(q.get("sql")));
    sel = m.sel;
    if (m.indicator) s.indicator = m.indicator;
    notes.splice(0, notes.length, `Custom SQL is not supported here: showing ${label(sel)}`);
  } else if (q.get("custom_taxon") === true && taxonVal) {
    if (RELEASE_RANKS.includes(rank)) {
      sel = taxon(rank, taxonVal);
      notes.length = 0;
    } else notes.push(`${rank || "this rank"} filters are not in the static release: showing ${label(sel)}`);
  } else if (q.get("custom_aphiaid") === true && aphia) {
    const ids = aphia.split(/\s*,\s*/).map(Number).filter(Number.isInteger);
    const hit = ids.length === 1 ? LEGACY_APHIAIDS[ids[0]] : undefined;
    if (hit) sel = hit.sel;
    notes.splice(
      0,
      notes.length,
      `Children of AphiaID ${aphia} need a backend: showing ${hit ? hit.label : label(sel)}`,
    );
  }
  s.layer = layerKey(sel);

  // years → all years or one decade ----
  const y = q.get("years");
  if (Array.isArray(y) && y.length === 2) {
    const [a, b] = [num(y[0]), num(y[1])];
    if (Number.isFinite(a) && Number.isFinite(b) && !(a <= LEGACY_YEARS[0] && b >= LEGACY_YEARS[1])) {
      const d = Math.floor(a / 10) * 10;
      const inOne = Math.floor(b / 10) * 10 === d && (DECADES as readonly number[]).includes(d);
      if (!inOne) notes.push(`years ${a}–${b} are not one decade: showing all years`);
      else if (sel.kind === "taxon") notes.push(`taxon groups have no decades: showing all years`);
      else {
        s.decade = d;
        if (a !== d || b !== d + 9) notes.push(`years ${a}–${b} shown as the ${d}s`);
      }
    }
  }

  // resolution (manual only; auto follows the zoom as before) ----
  const r = num(q.get("res"));
  if (q.get("res_manual") === true && Number.isInteger(r) && r >= 1) {
    const cap = s.decade === null ? RES_MAX : RES_DECADE_MAX;
    s.resMode = "manual";
    s.res = Math.min(r, cap);
  }

  // opacity (0–100 in the Shiny app), theme, camera ----
  const o = num(q.get("opacity"));
  if (o >= 0 && o <= 100) s.opacity = o / 100;
  const t = str(q.get("theme"));
  if (t === "dark" || t === "light") s.theme = t;
  const c = q.get("map_center") as { lng?: unknown; lat?: unknown } | undefined;
  const lng = num(c?.lng);
  const lat = num(c?.lat);
  if (lng >= -540 && lng <= 540 && lat >= -90 && lat <= 90) {
    s.lon = lng;
    s.lat = lat;
  }
  const z = num(q.get("map_zoom"));
  if (z >= 0 && z <= 22) s.zoom = z;

  return {
    state: s,
    notice: notes.length ? `Old h3-db link: ${notes.join("; ")}.` : "",
  };
}
