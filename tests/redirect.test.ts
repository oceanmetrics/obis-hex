// obis-hex's redirectFor against the SAME case table as the atlas codec (oceanmetrics/atlas tests/state/obisHex.test.ts):
// tests/fixtures/obis_redirect_cases.json is copied from the atlas's tests/fixtures; edit it there first. A case the two
// sides read differently fails here (this side) or there (the atlas side).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OBIS_COLLECTION, OM_ORIGIN, redirectFor } from "../src/lib/redirect";
import { DEFAULT_STATE, formatHash, parseHash } from "../src/lib/state/url";

interface Case {
  name: string;
  obis_hex: string;
  atlas: string;
  exact: boolean;
  dropped: string[];
}
const TABLE = JSON.parse(readFileSync("tests/fixtures/obis_redirect_cases.json", "utf8")) as {
  origin: string;
  keys: Record<string, { to?: string; rule?: string; drop?: string }>;
  cases: Case[];
};

// every key obis-hex writes (src/lib/state/url.ts formatHash) and every query switch it reads
const OBIS_HEX_KEYS = ["i", "l", "p", "r", "o", "t", "d", "g", "c", "k", "cc", "tc", "x", "xo", "b", "pl", "pc", "f", "v"];
const OBIS_HEX_SWITCHES = ["?tour", "?modal", "?theme", "?data", "?h3t", "?legacy"];

describe("the shared obis-hex -> atlas case table", () => {
  it("is the atlas's table: the origin and the collection are the ones redirectFor writes", () => {
    expect(TABLE.origin).toBe(OM_ORIGIN);
    expect(TABLE.cases.length).toBeGreaterThanOrEqual(32);
    expect(TABLE.cases.every((c) => c.atlas.includes(`c=${OBIS_COLLECTION}`) || c.atlas.includes("/places/p/"))).toBe(true);
  });

  it("equals the atlas checkout's table when the two repos sit side by side", () => {
    const atlas = "../atlas/tests/fixtures/obis_redirect_cases.json";
    if (existsSync(atlas)) expect(JSON.parse(readFileSync(atlas, "utf8"))).toEqual(TABLE);
  });

  it.each(TABLE.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const r = redirectFor(c.obis_hex);
    expect(r.url).toBe(c.atlas);
    expect(r.exact).toBe(c.exact);
    expect(r.dropped).toEqual([...c.dropped].sort());
    if (!c.exact) expect(r.notes.length).toBeGreaterThan(0);
    // a clamp that loses nothing is a note on an exact result (r=7 with a decade is res 5, as obis-hex drew it)
    expect(r.note).toBe(r.notes.length ? r.notes.join("; ") : undefined);
  });

  it("names every key and switch obis-hex has, each carried (to, rule) or dropped with a reason", () => {
    expect(Object.keys(TABLE.keys).sort()).toEqual([...OBIS_HEX_KEYS, ...OBIS_HEX_SWITCHES].sort());
    for (const [k, v] of Object.entries(TABLE.keys)) {
      const carried = typeof v.to === "string" && typeof v.rule === "string";
      const dropped = typeof v.drop === "string" && v.drop.length > 0;
      expect(carried !== dropped, k).toBe(true);
    }
  });

  it("obis-hex's own formatHash writes only keys the table names", () => {
    const h = formatHash({ ...DEFAULT_STATE, proj: "flat", cell: "8928308280fffff", cellOpen: true, place: "NMS:CINMS", placeColl: "places", labels: false });
    for (const kv of h.slice(1).split("&")) expect(OBIS_HEX_KEYS, kv).toContain(kv.split("=")[0]);
  });
});

describe("redirectFor beyond the table", () => {
  const A = "https://oceanmetrics.io/atlas/?c=obis_h3&i=all&dim.indicator=es&dim.period=all&res=auto";
  it("takes a bare hash, a query and hash, or a whole URL alike", () => {
    const h = "#i=sp&l=eov:fish&p=1990&r=3&c=-20,5,1.4";
    const want = redirectFor(`https://oceanmetrics.io/obis-hex/${h}`).url;
    expect(redirectFor(h).url).toBe(want);
    expect(redirectFor(`https://marinebon.github.io/obis-hex/${h}`).url).toBe(want);
  });
  it("the banner's input, formatHash of the default state, is the default atlas view", () => {
    expect(redirectFor(formatHash(DEFAULT_STATE))).toMatchObject({
      url: `${A}&map=-103.7,33.2,2.57&proj=globe`, exact: true,
    });
  });
  it("a state with an outlined place and the default layer round-trips to its Place page", () => {
    const h = formatHash({ ...DEFAULT_STATE, place: "NMS:CINMS", placeColl: "places" });
    expect(parseHash(h).place).toBe("NMS:CINMS");
    expect(redirectFor(h)).toMatchObject({ url: "https://oceanmetrics.io/places/p/NMS:CINMS", exact: true });
  });
  it("an empty or unknown link is the default atlas view, and never throws", () => {
    for (const h of ["", "#", "nonsense", "#%%%", "#l=%E0%A4%A", "?tour=%#c=a,b,c", "#pl=%ZZ", undefined as unknown as string, null as unknown as string])
      expect(() => redirectFor(h)).not.toThrow();
    expect(redirectFor("").url).toBe(`${A}&map=-103.7,33.2,2.57&proj=globe`);
  });
  it("honours another origin, with or without a trailing slash", () => {
    expect(redirectFor("#pl=NMS:MBNMS", "http://localhost:5181/").url).toBe("http://localhost:5181/places/p/NMS:MBNMS");
    expect(redirectFor("", "http://localhost:5181").url.startsWith("http://localhost:5181/atlas/?c=obis_h3&")).toBe(true);
  });
  it("drops a place id outside the gazetteer alphabet", () => {
    expect(redirectFor("#pl=%3Cscript%3E&r=3").url).not.toContain("#pl=");
  });
  it("a Shiny bookmark (?legacy=) runs through legacyToState first: seabirds, richness, the 1990s is class Aves with the period all", () => {
    const legacy = "_inputs_&preset=%22Seabirds%20(class%20Aves)%22&indicator=%22es%22&years=%5B1990%2C1999%5D";
    const r = redirectFor(`https://oceanmetrics.io/obis-hex/?legacy=${legacy}`);
    expect(r.url).toContain("&taxon=class:Aves");
    expect(r.url).toContain("dim.period=all");
    expect(r.exact).toBe(false);
    expect(r.notes.length).toBeGreaterThan(0);
    expect(r.dropped).not.toContain("?legacy");
  });
  it("?legacy= with an exact preset is exact, and its query switches still carry", () => {
    const r = redirectFor("?tour=off&legacy=_inputs_&preset=%22Fish%22&indicator=%22shannon%22");
    expect(r).toMatchObject({ exact: true });
    expect(r.url).toBe(
      "https://oceanmetrics.io/atlas/?c=obis_h3&i=fish&dim.indicator=shannon&dim.period=all&res=auto&map=-103.7,33.2,2.57&proj=globe&tour=off",
    );
  });
});
