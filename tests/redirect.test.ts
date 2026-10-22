import { describe, expect, it } from "vitest";
import { ATLAS_KEYS, NOTE_ATLAS, OM_ORIGIN, redirectFor } from "../src/lib/redirect";
import { DEFAULT_STATE, formatHash, parseHash } from "../src/lib/state/url";

const A = "https://oceanmetrics.io/atlas/?c=obis_h3";
const note = "the obis-h3 collection arrives in the atlas in build week 4 (2026-11-20 to 11-26)";

describe("redirectFor: layers go to the atlas, not exact until build week 4", () => {
  it("passes l, i, p, r and c through under the same names, in that order", () => {
    expect(redirectFor("#i=shannon&l=eov:fish&p=1990&r=3&o=0.85&t=light&d=release&c=-20,5,1.4")).toEqual({
      url: `${A}#l=eov:fish&i=shannon&p=1990&r=3&c=-20,5,1.4`, exact: false, note,
    });
    expect(NOTE_ATLAS).toBe(note);
    expect([...ATLAS_KEYS]).toEqual(["l", "i", "p", "r", "c"]);
  });
  it("carries a taxon and an AphiaID layer key unchanged", () => {
    expect(redirectFor("#l=taxon:class:Aves&i=es").url).toBe(`${A}#l=taxon:class:Aves&i=es`);
    expect(redirectFor("#l=aphia:137094&r=5").url).toBe(`${A}#l=aphia:137094&r=5`);
  });
  it("writes a space in a taxon name percent-encoded", () => {
    expect(redirectFor("#l=taxon:species:Megaptera%20novaeangliae").url).toBe(`${A}#l=taxon:species:Megaptera%20novaeangliae`);
  });
  it("drops the keys with no counterpart (o t d g k cc tc x xo b pc f v) without a note", () => {
    const r = redirectFor("#i=es&l=eov:fish&p=all&r=auto&o=0.5&t=dark&d=view&g=flat&c=1,2,3&k=share&cc=1&tc=1&x=8928308280fffff&xo=1&b=0&f=places&v=places");
    expect(r.url).toBe(`${A}#l=eov:fish&i=es&p=all&r=auto&c=1,2,3`);
    expect(r.note).toBe(note);
  });
  it("a place outlined WITH a layer chosen stays in the atlas, the outline dropped", () => {
    expect(redirectFor("#i=es&l=eov:fish&p=all&r=3&pl=NMS:MBNMS").url).toBe(`${A}#l=eov:fish&i=es&p=all&r=3`);
  });
  it("an empty or unknown hash is the bare atlas link, and never throws", () => {
    for (const h of ["", "#", "nonsense", "#%%%", "#l=%E0%A4%A", undefined as unknown as string])
      expect(redirectFor(h)).toEqual({ url: A, exact: false, note });
  });
});

describe("redirectFor: a place outlined and no layer chosen goes to its Place page, exact", () => {
  it("pl alone", () => {
    expect(redirectFor("#pl=NMS:MBNMS")).toEqual({ url: "https://oceanmetrics.io/places/p/NMS:MBNMS", exact: true });
  });
  it("pl with l=all (the default layer the app always writes) and every other default key", () => {
    expect(redirectFor("#i=es&l=all&p=all&r=auto&o=0.85&t=dark&d=release&c=-103.7,33.2,2.57&pl=NMS:MBNMS&pc=places&f=places&v=places"))
      .toEqual({ url: "https://oceanmetrics.io/places/p/NMS:MBNMS", exact: true });
  });
  it("a space in the id is percent-encoded, the colon kept", () => {
    expect(redirectFor("#pl=BOEM:OCS-P%200561").url).toBe("https://oceanmetrics.io/places/p/BOEM:OCS-P%200561");
  });
  it("f alone (a filter without an outlined place) is not a place link", () => {
    expect(redirectFor("#l=all&f=places").exact).toBe(false);
  });
});

describe("redirectFor: origin and the keys the app writes", () => {
  it("honours another origin, with or without a trailing slash", () => {
    expect(redirectFor("#pl=NMS:MBNMS", "http://localhost:5181/").url).toBe("http://localhost:5181/places/p/NMS:MBNMS");
    expect(redirectFor("", "http://localhost:5181").url).toBe("http://localhost:5181/atlas/?c=obis_h3");
    expect(OM_ORIGIN).toBe("https://oceanmetrics.io");
  });
  it("reads a whole URL as well as a hash", () => {
    expect(redirectFor("https://oceanmetrics.io/obis-hex/#l=eov:fish&i=es").url).toBe(`${A}#l=eov:fish&i=es`);
  });
  it("the default state's hash (formatHash) is the atlas link with the default layer, indicator, period, resolution and camera", () => {
    expect(redirectFor(formatHash(DEFAULT_STATE)).url).toBe(`${A}#l=all&i=es&p=all&r=auto&c=-103.7,33.2,2.57`);
  });
  it("a state with an outlined place and the default layer round-trips to its Place page", () => {
    const h = formatHash({ ...DEFAULT_STATE, place: "NMS:CINMS", placeColl: "places" });
    expect(parseHash(h).place).toBe("NMS:CINMS");
    expect(redirectFor(h)).toEqual({ url: "https://oceanmetrics.io/places/p/NMS:CINMS", exact: true });
  });
});
