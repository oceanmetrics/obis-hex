import { describe, expect, it } from "vitest";
import { fileUrl, Manifest, partitionValues, type FileRow } from "../src/lib/release/manifest";

const BASE = "https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/obis-h3/v20260728/";
const r = (layer: string, path: string, url_path = path): FileRow => ({
  layer,
  path,
  url_path,
  rows: 1,
  bytes: 1,
});

// rows exactly as files.parquet holds them in v20260728 (path percent-encoded once, url_path twice)
const ROWS: FileRow[] = [
  r("meta", "stats.parquet"),
  r("all", "all/res=3/data_0.parquet"),
  r("all", "all/res=7/data_0.parquet"),
  r("eov", "eov/eov=fish/res=2/data_0.parquet"),
  r("decade_all", "decade/all/decade=1990/res=4/data_0.parquet"),
  r("decade_eov", "decade/eov/eov=seaTurtles/decade=2010/res=5/data_0.parquet"),
  r("taxon", "taxon/rank=class/taxon=Aves/res=3/data_0.parquet"),
  r(
    "taxon",
    "taxon/rank=class/taxon=Apicomplexa%20incertae%20sedis/res=1/data_0.parquet",
    "taxon/rank=class/taxon=Apicomplexa%2520incertae%2520sedis/res=1/data_0.parquet",
  ),
  // the same name at another rank must not collide
  r(
    "taxon",
    "taxon/rank=order/taxon=Apicomplexa%20incertae%20sedis/res=1/data_0.parquet",
    "taxon/rank=order/taxon=Apicomplexa%2520incertae%2520sedis/res=1/data_0.parquet",
  ),
];

describe("manifest resolution (layer, key, decade, res) → url_path", () => {
  const m = new Manifest(ROWS);

  it("decodes partition values", () => {
    expect(partitionValues("taxon/rank=class/taxon=A%20b/res=3/data_0.parquet")).toEqual({
      rank: "class",
      taxon: "A b",
      res: "3",
    });
  });

  it("all taxa", () => {
    expect(m.lookup({ kind: "all" }, null, 3)?.url_path).toBe("all/res=3/data_0.parquet");
    expect(m.lookup({ kind: "all" }, null, 5)).toBeNull();
  });

  it("EOV and decade layers", () => {
    expect(m.lookup({ kind: "eov", eov: "fish" }, null, 2)?.path).toBe(
      "eov/eov=fish/res=2/data_0.parquet",
    );
    expect(m.lookup({ kind: "all" }, 1990, 4)?.layer).toBe("decade_all");
    expect(m.lookup({ kind: "eov", eov: "seaTurtles" }, 2010, 5)?.layer).toBe("decade_eov");
    expect(m.lookup({ kind: "eov", eov: "seaTurtles" }, 2000, 5)).toBeNull();
  });

  it("a taxon with a space resolves to the double-encoded url_path", () => {
    const row = m.lookup(
      { kind: "taxon", rank: "class", taxon: "Apicomplexa incertae sedis" },
      null,
      1,
    );
    expect(row?.url_path).toBe(
      "taxon/rank=class/taxon=Apicomplexa%2520incertae%2520sedis/res=1/data_0.parquet",
    );
    expect(fileUrl(BASE, row!)).toBe(
      `${BASE}taxon/rank=class/taxon=Apicomplexa%2520incertae%2520sedis/res=1/data_0.parquet`,
    );
    // and the rank is part of the key
    expect(
      m.lookup({ kind: "taxon", rank: "order", taxon: "Apicomplexa incertae sedis" }, null, 1)?.path,
    ).toContain("rank=order");
  });

  it("taxon groups have no decade partitions", () => {
    expect(m.lookup({ kind: "taxon", rank: "class", taxon: "Aves" }, 1990, 3)).toBeNull();
  });

  it("knows which layers the release has", () => {
    expect(m.hasLayer("taxon")).toBe(true);
    expect(new Manifest(ROWS.filter((x) => x.layer === "all")).hasLayer("eov")).toBe(false);
    expect(m.resolutions({ kind: "all" }, null)).toEqual([3, 7]);
  });
});
