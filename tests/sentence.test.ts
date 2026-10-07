import { describe, expect, it } from "vitest";
import {
  coverageText,
  hexAreaLabel,
  placePart,
  scalePart,
  sentenceParts,
  sentenceText,
  taxonPart,
} from "../src/lib/view/sentence";
import { citeText } from "../src/lib/export/cite";

describe("title sentence", () => {
  it("renders the assessment's example exactly", () => {
    const p = sentenceParts({
      sel: { kind: "eov", eov: "seabirds" },
      decade: null,
      snapshot: "2026-07-28",
      inView: false,
      res: 3,
      auto: false,
      indicator: "es",
    });
    expect(sentenceText(p)).toBe(
      "Seabirds (EOV), all years (OBIS 2026-07-28), worldwide, ~12,400 km² hexagons (res 3): ES(50)",
    );
    expect(p.taxon).toEqual({ label: "Seabirds", qual: "(EOV)" });
  });

  it("Monterey Bay: a taxon group with a common name, in view, auto res 7", () => {
    const p = sentenceParts({
      sel: { kind: "taxon", rank: "class", taxon: "Aves" },
      decade: null,
      snapshot: "2026-07-28",
      inView: true,
      parts: { loaded: 1, total: 122 },
      res: 7,
      auto: true,
      indicator: "es",
    });
    expect(sentenceText(p)).toBe(
      "Birds (class Aves), all years (OBIS 2026-07-28), in view (1 of 122 partitions), ~5 km² hexagons (res 7, auto): ES(50)",
    );
  });

  it("a decade, all taxa, another indicator", () => {
    const p = sentenceParts({ sel: { kind: "all" }, decade: 1990, inView: false, res: 1, auto: true, indicator: "sp" });
    expect(sentenceText(p)).toBe("All taxa, 1990s, worldwide, ~610,000 km² hexagons (res 1, auto): Richness");
  });

  it("taxon chip: scientific name when no common name; live WoRMS layer", () => {
    expect(taxonPart({ kind: "taxon", rank: "order", taxon: "Wallemiales" })).toEqual({ label: "Wallemiales", qual: "(order)" });
    expect(taxonPart({ kind: "aphia", id: 2688 })).toEqual({ label: "AphiaID 2688", qual: "(WoRMS)" });
    expect(taxonPart({ kind: "aphia", id: 2688 }, { name: "Cetacea", rank: "Infraorder" })).toEqual({
      label: "Whales and dolphins",
      qual: "(infraorder Cetacea, WoRMS)",
    });
    expect(taxonPart({ kind: "aphia", id: 1 }, { name: "Foo", rank: "Genus" })).toEqual({ label: "Foo", qual: "(genus, WoRMS)" });
  });

  it("hexagon areas read as rounded km² per resolution", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(hexAreaLabel)).toEqual([
      "~610,000 km²",
      "~86,800 km²",
      "~12,400 km²",
      "~1,770 km²",
      "~253 km²",
      "~36 km²",
      "~5 km²",
    ]);
    expect(scalePart(3, true)).toEqual({ label: "~12,400 km² hexagons", qual: "(res 3, auto)" });
  });

  it("place: worldwide vs in view", () => {
    expect(placePart(false)).toEqual({ label: "worldwide", qual: "" });
    expect(placePart(true)).toEqual({ label: "in view", qual: "" });
  });
});

describe("coverage line (the ES(50) caveat)", () => {
  it("states how many hexagons have >= 50 records for ES(50)", () => {
    expect(coverageText("es", { cells: 26361, valued: 9196 })).toBe("9,196 of 26,361 hexagons have ≥ 50 records");
    expect(coverageText("es", { cells: 53268, valued: 3938 }, 50)).toBe("3,938 of 53,268 hexagons have ≥ 50 records");
  });
  it("other indicators: the hexagon count", () => {
    expect(coverageText("sp", { cells: 26361, valued: 26361 })).toBe("26,361 hexagons");
    expect(coverageText("shannon", { cells: 10, valued: 8 })).toBe("8 of 10 hexagons have a value");
    expect(coverageText("es", null)).toBe("");
  });
});

describe("cite", () => {
  it("credits OBIS with the snapshot, obisindicators with the release, and the link", () => {
    const t = citeText({ release: "v20260728", snapshot: "2026-07-28", obisindicators: "0.7.1", appVersion: "0.4.0", url: "https://oceanmetrics.io/obis-hex/#i=es" });
    expect(t).toContain("OBIS (2026)");
    expect(t).toContain("(snapshot 2026-07-28)");
    expect(t).toContain("obisindicators 0.7.1");
    expect(t).toContain("H3 release v20260728");
    expect(t.split("\n")[2]).toBe("Map: OBIS hex v0.4.0 (Ocean Metrics for MBON), https://oceanmetrics.io/obis-hex/#i=es");
  });
});
