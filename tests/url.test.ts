import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, formatHash, parseHash, type AppState } from "../src/lib/state/url";
import { layerKey } from "../src/lib/data/layers";

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
      lon: -123.456,
      lat: 36.789,
      zoom: 5.25,
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
    expect(parseHash("#i=bogus&l=eov:nope&p=1955&r=9&o=3&t=pink&d=x&c=1,2")).toEqual(DEFAULT_STATE);
    expect(parseHash("#l=taxon:%E0%A4%A:x")).toEqual(DEFAULT_STATE);
  });

  it("rounds the camera", () => {
    const h = formatHash({ ...DEFAULT_STATE, lon: 1.23456789, lat: -2.3456789, zoom: 3.14159 });
    expect(h).toContain("c=1.235,-2.346,3.14");
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
