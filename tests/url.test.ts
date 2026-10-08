import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, formatHash, hashHas, parseHash, type AppState } from "../src/lib/state/url";
import { layerKey, layerLabel, manifestLayer, parseLayerKey } from "../src/lib/data/layers";

describe("URL hash state", () => {
  it("round-trips every field", () => {
    const s: AppState = {
      indicator: "shannon",
      layer: layerKey({ kind: "taxon", rank: "class", taxon: "Apicomplexa incertae sedis" }),
      decade: null,
      resMode: "manual",
      res: 6,
      opacity: 0.4,
      theme: "light",
      domain: "view",
      proj: "globe",
      lon: -123.456,
      lat: 36.789,
      zoom: 5.25,
      tab: "share",
      ctlFolded: true,
      timeFolded: true,
      cell: "832830fffffffff",
      cellOpen: true,
      labels: false,
      place: "NMS:MBNMS",
    };
    expect(parseHash(formatHash(s))).toEqual(s);
  });

  it("round-trips an EOV with a decade and auto resolution", () => {
    const s: AppState = { ...DEFAULT_STATE, layer: "eov:seaTurtles", decade: 1990, resMode: "auto" };
    const h = formatHash(s);
    expect(h).toContain("l=eov:seaTurtles");
    expect(h).toContain("p=1990");
    expect(h).toContain("r=auto");
    expect(parseHash(h)).toEqual(s);
  });

  it("keeps a taxon with a space readable and decodable", () => {
    const s = { ...DEFAULT_STATE, layer: "taxon:class:Apicomplexa%20incertae%20sedis" };
    expect(parseHash(formatHash(s)).layer).toBe(s.layer);
  });

  it("falls back to defaults for junk, never throws", () => {
    expect(parseHash("")).toEqual(DEFAULT_STATE);
    expect(parseHash("#i=bogus&l=eov:nope&p=1955&r=9&o=3&t=pink&d=x&g=sphere&c=1,2")).toEqual(DEFAULT_STATE);
    expect(parseHash("#l=taxon:%E0%A4%A:x")).toEqual(DEFAULT_STATE);
  });

  it("projection: the globe is the default (0.5.1), written only for flat", () => {
    expect(DEFAULT_STATE.proj).toBe("globe");
    expect(parseHash("").proj).toBe("globe");
    expect(parseHash("#i=sp").proj).toBe("globe");
    expect(formatHash(DEFAULT_STATE)).not.toMatch(/[&#]g=/);
    const h = formatHash({ ...DEFAULT_STATE, proj: "flat" });
    expect(h).toContain("&d=release&g=flat&c=");
    expect(parseHash(h).proj).toBe("flat");
    expect(parseHash("#g=globe").proj).toBe("globe");
  });

  it("rounds the camera", () => {
    const h = formatHash({ ...DEFAULT_STATE, lon: 1.23456789, lat: -2.3456789, zoom: 3.14159 });
    expect(h).toContain("c=1.235,-2.346,3.14");
  });
});

describe("aphia:<id> layer (live WoRMS subtree)", () => {
  it("round-trips with a decade at res 7", () => {
    const s: AppState = { ...DEFAULT_STATE, layer: layerKey({ kind: "aphia", id: 137092 }), decade: 1990, resMode: "manual", res: 7 };
    const h = formatHash(s);
    expect(h).toContain("l=aphia:137092&");
    expect(parseHash(h)).toEqual(s);
    expect(parseLayerKey("aphia:2688")).toEqual({ kind: "aphia", id: 2688 });
  });
  it("rejects ids that are not positive integers", () => {
    for (const bad of ["aphia:", "aphia:0", "aphia:-5", "aphia:1.5", "aphia:12a", "aphia:1:2", "aphia:12345678901"])
      expect(parseHash(`#l=${bad}`).layer, bad).toBe("all");
  });
  it("is not a release layer", () => {
    expect(manifestLayer({ kind: "aphia", id: 2688 }, null)).toBeNull();
    expect(manifestLayer({ kind: "aphia", id: 2688 }, 1990)).toBeNull();
    expect(layerLabel({ kind: "aphia", id: 2688 })).toBe("AphiaID 2688");
  });
});

describe("URL hash encoding (regression: taxon key was double-encoded, %2520)", () => {
  it("writes a taxon with a space encoded exactly once", () => {
    const s = { ...DEFAULT_STATE, layer: layerKey({ kind: "taxon", rank: "class", taxon: "Apicomplexa incertae sedis" }) };
    const h = formatHash(s);
    expect(h).toContain("l=taxon:class:Apicomplexa%20incertae%20sedis&");
    expect(h).not.toContain("%25");
    expect(parseHash(h).layer).toBe(s.layer);
  });
  it("survives a taxon containing % and &", () => {
    const s = { ...DEFAULT_STATE, layer: layerKey({ kind: "taxon", rank: "genus", taxon: "A&B 100%" }) };
    expect(parseHash(formatHash(s))).toEqual(s);
  });
});

describe("layout keys (0.4.0 MBON re-layout)", () => {
  // the links made before 0.4.0, among them the paper figures and the UI assessment states; since
  // 0.5.1 the globe is the default, so `g=globe` is dropped when formatting and `g=flat` is kept
  const OLD = [
    "#i=es&l=all&p=all&r=1&o=0.85&t=dark&d=release&c=-30,15,1.5",
    "#i=es&l=eov:seagrasses&p=all&r=4&o=0.85&t=light&d=release&g=flat&c=-80.5,19.5,4.3",
    "#i=es&l=taxon:class:Aves&p=all&r=7&o=0.85&t=dark&d=release&g=flat&c=-122.05,36.75,9.2",
    "#i=sp&l=aphia:137092&p=1990&r=auto&o=0.4&t=light&d=view&g=flat&c=10,20,3",
  ];
  it("an old g=globe link opens the same view and drops the now-default key", () => {
    const h = "#i=es&l=all&p=all&r=1&o=0.85&t=dark&d=release&g=globe&c=-30,15,1.5";
    expect(parseHash(h).proj).toBe("globe");
    expect(formatHash(parseHash(h))).toBe(OLD[0]);
  });
  it("an old link opens the same view and formats back to the same string", () => {
    for (const h of OLD) {
      const s = parseHash(h);
      expect(formatHash(s), h).toBe(h);
      expect(s.tab).toBe("taxon");
      expect(s.ctlFolded || s.timeFolded || s.cellOpen || s.cell !== null || !s.labels).toBe(false);
    }
  });
  it("writes the layout keys only when they differ from the default, after the eight view keys", () => {
    expect(formatHash(DEFAULT_STATE)).not.toMatch(/[&#](g|k|cc|tc|x|xo|b|pl)=/);
    const h = formatHash({ ...DEFAULT_STATE, tab: "indicator", ctlFolded: true, cell: "8a2a1072b59ffff", labels: false });
    expect(h.endsWith("&k=indicator&cc=1&x=8a2a1072b59ffff&b=0")).toBe(true);
  });
  it("each layout key round-trips on its own", () => {
    const cases: Partial<AppState>[] = [
      { tab: "place" },
      { tab: "share" },
      { ctlFolded: true },
      { timeFolded: true },
      { cell: "8a2a1072b59ffff" },
      { cellOpen: true },
      { labels: false },
      { place: "NMS:FKNMS" },
      { place: "MRGID:8439" },
      { place: "PSGID:939" },
    ];
    for (const c of cases) {
      const s = { ...DEFAULT_STATE, ...c };
      expect(parseHash(formatHash(s)), JSON.stringify(c)).toEqual(s);
    }
  });
  it("pl= is written last, only when a place is set, and an unknown id is dropped", () => {
    const h = formatHash({ ...DEFAULT_STATE, labels: false, place: "NMS:MBNMS" });
    expect(h.endsWith("&b=0&pl=NMS:MBNMS")).toBe(true);
    expect(formatHash(DEFAULT_STATE)).not.toContain("pl=");
    for (const bad of ["pl=", "pl=MBNMS", "pl=XYZ:1", "pl=NMS:", "pl=NMS:a'b", "pl=NMS:" + "A".repeat(40)])
      expect(parseHash("#" + bad).place, bad).toBeNull();
  });
  it("junk layout values fall back to defaults", () => {
    const s = parseHash("#k=nope&cc=yes&tc=2&x=zz12&xo=true&b=off");
    expect(s).toEqual(DEFAULT_STATE);
    expect(parseHash("#x=8A2A1072B59FFFF").cell).toBe("8a2a1072b59ffff");
  });
  it("hashHas tells whether a link chose the theme", () => {
    expect(hashHas("#i=es&t=light", "t")).toBe(true);
    expect(hashHas("#i=es&tc=1", "t")).toBe(false);
    expect(hashHas("", "t")).toBe(false);
  });
});
