// old app.marinesensitivity.org/h3-db bookmarks → obis-hex state. The URLs are built the way
// Shiny's url bookmarking writes them for MarineSensitivity/apps h3-db/app.R: `?_inputs_&` then
// every non-excluded input as name=URL-encoded JSON (strings quoted, years an array, map_center
// an object, checkboxes true/false).
import { describe, expect, it } from "vitest";
import { legacyInputs, legacyQuery, legacyToState, sqlToLayer } from "../src/lib/state/legacy";
import { DEFAULT_STATE, formatHash, parseHash } from "../src/lib/state/url";

const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));
/** a Shiny bookmark query with the app's defaults, overridden by `over` */
function bookmark(over: Record<string, unknown> = {}): string {
  const inputs: Record<string, unknown> = {
    aphiaid_val: "",
    custom_aphiaid: false,
    custom_sql: false,
    custom_taxon: false,
    indicator: "es",
    map_center: { lng: -20, lat: 5 },
    map_zoom: 1.4,
    opacity: 85,
    preset: "All taxa",
    rank: "class",
    res: 1,
    res_manual: false,
    sidebar: true,
    sql: "SELECT cell_id, es AS value, n\nFROM idx_h3\nWHERE res = LEAST({{res}}, 7)",
    taxon_val: "",
    theme: "dark",
    view_title: "",
    years: [1900, 2026],
    ...over,
  };
  return `_inputs_&${Object.entries(inputs)
    .map(([k, v]) => `${k}=${enc(v)}`)
    .join("&")}`;
}

describe("legacy h3-db links", () => {
  it("1. the default view maps to the default state, no notice", () => {
    const r = legacyToState(bookmark());
    expect(r.notice).toBe("");
    expect(r.state).toEqual({ ...DEFAULT_STATE, opacity: 0.85 });
  });

  it("2. seagrasses EOV, res 4 pinned, light, the Caribbean (paper 2 figure)", () => {
    const r = legacyToState(
      bookmark({
        preset: "Seagrasses",
        res: 4,
        res_manual: true,
        theme: "light",
        map_center: { lng: -80.5, lat: 19.5 },
        map_zoom: 4.3,
      }),
    );
    expect(r.notice).toBe("");
    expect(r.state).toMatchObject({
      layer: "eov:seagrasses",
      resMode: "manual",
      res: 4,
      theme: "light",
      lon: -80.5,
      lat: 19.5,
      zoom: 4.3,
    });
  });

  it("3. seabirds preset, richness, the 1990s: class Aves, decades unsupported for taxa", () => {
    const r = legacyToState(
      bookmark({ preset: "Seabirds (class Aves)", indicator: "sp", years: [1990, 1999], opacity: 60 }),
    );
    expect(r.state).toMatchObject({ layer: "taxon:class:Aves", indicator: "sp", decade: null, opacity: 0.6 });
    expect(r.notice).toBe("Old h3-db link: taxon groups have no decades: showing all years.");
    // the same years on an EOV become the decade
    expect(legacyToState(bookmark({ preset: "Fish", years: [1990, 1999] })).state.decade).toBe(1990);
  });

  it("4. children of AphiaID 2688 (Cetacea) → the live aphia:2688 layer exactly, no notice", () => {
    const r = legacyToState(bookmark({ custom_aphiaid: true, aphiaid_val: "2688", map_zoom: 3 }));
    expect(r.state.layer).toBe("aphia:2688");
    expect(r.notice).toBe("");
    // decades and res 7 are allowed on the live layer (the endpoint filters by decade at any res)
    const d = legacyToState(
      bookmark({ custom_aphiaid: true, aphiaid_val: " 137092 ", years: [1990, 1999], res: 7, res_manual: true }),
    );
    expect(d).toEqual({
      state: expect.objectContaining({ layer: "aphia:137092", decade: 1990, resMode: "manual", res: 7 }),
      notice: "",
    });
    expect(parseHash(formatHash(d.state))).toEqual(d.state);
    // several ids: the first, with a notice; junk keeps the preset's layer, with a notice
    const u = legacyToState(bookmark({ custom_aphiaid: true, aphiaid_val: "123456, 7" }));
    expect(u.state.layer).toBe("aphia:123456");
    expect(u.notice).toBe("Old h3-db link: AphiaIDs 123456, 7: showing the children of 123456 only.");
    const j = legacyToState(bookmark({ custom_aphiaid: true, aphiaid_val: "whales", preset: "Fish" }));
    expect(j.state.layer).toBe("eov:fish");
    expect(j.notice).toBe('Old h3-db link: AphiaID "whales" is not a number: showing the fish EOV.');
  });

  it("5. custom SQL on idx_h3_eov → that EOV and indicator, with a notice", () => {
    const r = legacyToState(
      bookmark({
        custom_sql: true,
        sql: "SELECT cell_id, sp AS value, n\nFROM idx_h3_eov\nWHERE eov = 'seaTurtles' AND res = LEAST({{res}}, 7)",
      }),
    );
    expect(r.state).toMatchObject({ layer: "eov:seaTurtles", indicator: "sp" });
    expect(r.notice).toBe("Old h3-db link: Custom SQL is not supported here: showing the seaTurtles EOV.");
    expect(sqlToLayer("SELECT cell_id, n AS value, n FROM idx_h3_taxon WHERE rank = 'order' AND taxon = 'Cetacea'"))
      .toEqual({ sel: { kind: "taxon", rank: "order", taxon: "Cetacea" }, indicator: "n" });
  });

  it("6. a family filter and a cross-decade range: closest view, both noted", () => {
    const r = legacyToState(
      bookmark({ custom_taxon: true, rank: "family", taxon_val: "Delphinidae", years: [2005, 2014] }),
    );
    expect(r.state).toMatchObject({ layer: "all", decade: null });
    expect(r.notice).toBe(
      "Old h3-db link: family filters are not in the static release: showing all taxa; years 2005–2014 are not one decade: showing all years.",
    );
    // a class filter is exact
    const c = legacyToState(bookmark({ custom_taxon: true, rank: "class", taxon_val: "Cephalopoda" }));
    expect(c).toEqual({ state: expect.objectContaining({ layer: "taxon:class:Cephalopoda" }), notice: "" });
  });

  it("7. approximated presets say so; unknown params and values are ignored", () => {
    const r = legacyToState(bookmark({ preset: "Bony fishes (Actinopterygii)", sidebar: false, bogus: 1 }));
    expect(r.state.layer).toBe("taxon:class:Teleostei");
    expect(r.notice).toMatch(/Actinopterygii .* OBIS class Teleostei/);
    expect(legacyToState("indicator=%22nope%22&theme=7&map_zoom=%22x%22&res=99&res_manual=true").state).toEqual({
      ...DEFAULT_STATE,
      resMode: "manual",
      res: 7,
    });
    expect(legacyToState("%E0%A4%A&&=").state).toEqual(DEFAULT_STATE);
  });

  it("the state survives the hash codec", () => {
    const { state } = legacyToState(bookmark({ preset: "Sea turtles", years: [2010, 2019], res: 3, res_manual: true }));
    expect(parseHash(formatHash(state))).toEqual(state);
  });
});

describe("?legacy= on the page URL", () => {
  const q = bookmark({ preset: "Seagrasses" });
  it("takes everything after legacy= (the redirect appends the query unencoded)", () => {
    expect(legacyQuery(`?legacy=${q}`)).toBe(q);
    expect(legacyQuery(`?data=/x/&legacy=${q}`)).toBe(q);
    expect(legacyQuery("?data=/x/")).toBe("");
    expect(legacyQuery("?legacy=")).toBe("");
  });
  it("also accepts the query encoded as one value", () => {
    expect(legacyQuery(`?legacy=${encodeURIComponent(q)}`)).toBe(q);
  });
  it("decodes Shiny's JSON values", () => {
    const m = legacyInputs(q);
    expect(m.get("preset")).toBe("Seagrasses");
    expect(m.get("years")).toEqual([1900, 2026]);
    expect(m.get("map_center")).toEqual({ lng: -20, lat: 5 });
    expect(m.get("res_manual")).toBe(false);
  });
});
