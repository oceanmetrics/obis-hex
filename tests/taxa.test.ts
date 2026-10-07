import { describe, expect, it } from "vitest";
import { APHIA_ITEM, commonName, logBar, taxonItems } from "../src/lib/data/taxa";
import { parseLayerKey } from "../src/lib/data/layers";
import { decadeAt, decadeCountsSql, decadeSpan, normalizeCounts, DECADE_DOMAIN } from "../src/lib/release/decades";

const GROUPS = [
  { kind: "taxon", rank: "order", taxon: "Testudines", n: 447735 },
  { kind: "taxon", rank: "class", taxon: "Teleostei", n: 44518095 },
  { kind: "taxon", rank: "class", taxon: "Aves", n: 23686770 },
  { kind: "taxon", rank: "class", taxon: "Apicomplexa incertae sedis", n: 12 },
  { kind: "taxon", rank: "phylum", taxon: "Chordata", n: 78853289 },
  { kind: "eov", rank: "eov", taxon: "seabirds", n: 23744889 },
  { kind: "eov", rank: "eov", taxon: "fish", n: 49347730 },
];

describe("taxon picker items", () => {
  const items = taxonItems(GROUPS, { totalRecords: 1e8 });
  it("groups in pipeline order: all, EOVs, phyla, classes, orders, WoRMS", () => {
    expect([...new Set(items.map((i) => i.group))]).toEqual([
      "All life",
      "Essential Ocean Variables",
      "Phyla",
      "Classes",
      "Orders",
      "Any taxon (WoRMS, live)",
    ]);
  });
  it("ids are layer keys (the URL's l=), the WoRMS row excepted", () => {
    for (const it of items) {
      if (it.id === APHIA_ITEM) expect(parseLayerKey(it.id)).toBeNull();
      else expect(parseLayerKey(it.id), it.id).not.toBeNull();
    }
    expect(items.find((i) => i.label.startsWith("Apicomplexa"))?.id).toBe("taxon:class:Apicomplexa%20incertae%20sedis");
  });
  it("most records first within a group, with counts and common names", () => {
    const classes = items.filter((i) => i.group === "Classes");
    expect(classes.map((i) => i.label)).toEqual(["Teleostei — bony fishes", "Aves — birds", "Apicomplexa incertae sedis"]);
    expect(classes[1].count).toBe(23686770);
    expect(classes[1].keywords).toContain("birds");
    const eovs = items.filter((i) => i.group === "Essential Ocean Variables");
    expect(eovs.length).toBe(7);
    expect(eovs[0]).toMatchObject({ id: "eov:fish", count: 49347730 });
    expect(eovs[1]).toMatchObject({ id: "eov:seabirds", count: 23744889 });
    expect(items[0]).toMatchObject({ id: "all", count: 1e8 });
  });
  it("disables what the release or the service lacks; lists the current live taxon", () => {
    const it2 = taxonItems(GROUPS, { hasEov: false, hasAphia: false, aphia: { id: 2688, name: "Cetacea" } });
    expect(it2.filter((i) => i.id.startsWith("eov:")).every((i) => i.disabled)).toBe(true);
    expect(it2.find((i) => i.id === APHIA_ITEM)?.disabled).toBe(true);
    expect(it2.find((i) => i.id === "aphia:2688")?.label).toBe("Cetacea");
  });
  it("common names and log bars", () => {
    expect(commonName("Aves")).toBe("birds");
    expect(commonName("Wallemiales")).toBeNull();
    expect(logBar(0, 100)).toBe(0);
    expect(logBar(100, 100)).toBe(1);
    expect(logBar(9, 99)).toBeCloseTo(0.5, 5);
  });
});

describe("records per decade (Time strip)", () => {
  it("snaps a brush to the decade under its midpoint, clamped to the release's decades", () => {
    expect(DECADE_DOMAIN).toEqual([1960, 2030]);
    expect(decadeAt(1991, 1999)).toBe(1990);
    expect(decadeAt(1985, 1996)).toBe(1990);
    expect(decadeAt(1940, 1950)).toBe(1960);
    expect(decadeAt(2029, 2040)).toBe(2020);
    expect(decadeSpan(1960)).toEqual([0, 1 / 7]);
    expect(decadeSpan(2020)[1]).toBeCloseTo(1, 10);
  });
  it("fills every decade, keeps the all-years total apart", () => {
    const r = normalizeCounts([
      { decade: 2000, n: 5 },
      { decade: null, n: 99 },
      { decade: 1960, n: 1 },
    ]);
    expect(r.decades.map((d) => d.n)).toEqual([1, 0, 0, 0, 5, 0, 0]);
    expect(r.total).toBe(99);
    expect(normalizeCounts([]).total).toBeNull();
  });
  it("sums n per file with literals only", () => {
    const sql = decadeCountsSql("https://x/", [
      { decade: 1990, file: { layer: "decade_all", path: "p", url_path: "decade/all/decade=1990/res=1/data_0.parquet", rows: 1, bytes: 1 } },
      { decade: null, file: { layer: "all", path: "p", url_path: "all/res=1/data_0.parquet", rows: 1, bytes: 1 } },
    ]);
    expect(sql).toBe(
      "SELECT 1990 AS decade, coalesce(sum(n), 0)::DOUBLE AS n FROM read_parquet('https://x/decade/all/decade=1990/res=1/data_0.parquet', hive_partitioning = false)\nUNION ALL\nSELECT NULL::INTEGER AS decade, coalesce(sum(n), 0)::DOUBLE AS n FROM read_parquet('https://x/all/res=1/data_0.parquet', hive_partitioning = false)",
    );
  });
});
