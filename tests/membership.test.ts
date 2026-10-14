// place × H3 membership (src/lib/places/membership.ts): the files a view needs, the filtered
// partition and the per-place summary on synthetic rows, and the browser's SQL on a real fixture,
// the gazetteer's noaa_aoa_socal membership (10 AOAs off southern California; places repo,
// scripts/build_h3_membership.py) read by the Node DuckDB-WASM.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MemberCache,
  cellShares,
  collectionDir,
  filterPartition,
  membershipFiles,
  membershipSql,
  parentsSql,
  parseManifest,
  pickMembers,
  placeColors,
  placeSummary,
  placeValue,
  summaryCsv,
  type Members,
} from "../src/lib/places/membership";
import { Engine, type Partition } from "../src/lib/engine/engine";
import type { Indicator } from "../src/lib/data/layers";
import { createNodeDb } from "./helpers/nodeDb";

const dir = resolve(__dirname, "fixtures/places/noaa_aoa_socal");
const manifest = parseManifest(JSON.parse(readFileSync(`${dir}/h3/membership.json`, "utf8")));

function part(cells: Record<string, Partial<Record<Indicator, number>>>): Partition {
  const h3 = Object.keys(cells);
  const values = {} as Record<Indicator, Float64Array>;
  for (const c of ["n", "sp", "shannon", "simpson", "es"] as Indicator[])
    values[c] = Float64Array.from(h3, (k) => cells[k][c] ?? NaN);
  return { url: "u", sql: "", rows: h3.length, h3, values, ms: 1 };
}
const members = (rows: [string, string, number][]): Members => ({
  place: rows.map((r) => r[0]),
  h3: rows.map((r) => r[1]),
  share: Float64Array.from(rows, (r) => r[2]),
});

describe("manifest and files", () => {
  it("parses the fixture's membership.json", () => {
    expect(manifest.res).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(manifest.parent_res).toEqual({ "6": 2, "7": 3 });
    expect(manifest.min_share).toBe(0.01);
    expect(manifest.parents).toBe("h3/parents.parquet");
    expect(manifest.files.filter((f) => f.res === 7).map((f) => f.parent)).toEqual(["832912fffffffff", "8329a1fffffffff"]);
  });

  it("rejects what is not a membership.json", () => {
    expect(() => parseManifest({ layers: [] })).toThrow(/membership/);
    expect(() => parseManifest(null)).toThrow();
  });

  it("collectionDir strips h3/membership.json", () => {
    expect(collectionDir("https://b/g/noaa_aoa_socal/h3/membership.json")).toBe("https://b/g/noaa_aoa_socal/");
  });

  it("one file for res 1–5, whatever the view", () => {
    expect(membershipFiles(manifest, 5, new Set(["x"]), new Set(["y"]))!.map((f) => f.path)).toEqual(["h3/res=5/membership.parquet"]);
  });

  it("split res: the parents in view and holding a chosen place", () => {
    const paths = (v: Set<string> | null, p: Set<string> | null) => membershipFiles(manifest, 7, v, p)!.map((f) => f.parent);
    expect(paths(null, null)).toEqual(["832912fffffffff", "8329a1fffffffff"]);
    expect(paths(new Set(["8329a1fffffffff", "83de80fffffffff"]), null)).toEqual(["8329a1fffffffff"]);
    expect(paths(null, new Set(["832912fffffffff"]))).toEqual(["832912fffffffff"]);
    expect(paths(new Set(["8329a1fffffffff"]), new Set(["832912fffffffff"]))).toEqual([]);
  });

  it("no membership at a res the collection lacks", () => {
    expect(membershipFiles(manifest, 8, null, null)).toBeNull();
  });

  it("SQL: every value through lit(), hive partitioning off, files tagged by URL", () => {
    expect(parentsSql("https://b/p.parquet", 7, ["AOA:N1-A", "O'X"])).toBe(
      "SELECT DISTINCT parent FROM read_parquet('https://b/p.parquet', hive_partitioning = false)\nWHERE res = 7 AND place_id IN ('AOA:N1-A', 'O''X')",
    );
    expect(membershipSql(["a.parquet", "b.parquet"])).toBe(
      "SELECT filename AS url, place_id, h3, share::DOUBLE AS share\nFROM read_parquet(['a.parquet', 'b.parquet'], hive_partitioning = false, filename = true)",
    );
  });
});

describe("filter", () => {
  const m = members([
    ["A", "c1", 1],
    ["A", "c2", 0.25],
    ["B", "c2", 0.5],
    ["B", "c3", 0.9],
    ["C", "c3", 0.4],
  ]);

  it("a cell's share over several places is their sum, capped at 1", () => {
    expect(Object.fromEntries(cellShares(m))).toEqual({ c1: 1, c2: 0.75, c3: 1 });
  });

  it("pickMembers keeps the chosen places (null = all)", () => {
    expect(pickMembers([m], ["B"]).h3).toEqual(["c2", "c3"]);
    expect(pickMembers([m, m], null).h3.length).toBe(10);
  });

  it("keeps only the cells of the chosen places, with their share, every indicator column cut alike", () => {
    const p = part({ c0: { n: 5 }, c1: { n: 10, es: 2 }, c2: { n: 100, es: 30 }, c4: { n: 1 } });
    const f = filterPartition(p, pickMembers([m], ["A"]));
    expect(f.h3).toEqual(["c1", "c2"]);
    expect(f.rows).toBe(2);
    expect([...f.values.n]).toEqual([10, 100]);
    expect([...f.values.es]).toEqual([2, 30]);
    expect([...f.share]).toEqual([1, 0.25]);
    expect(f.url).toBe("u#in");
  });

  it("no member cell loaded: an empty partition, not the whole one", () => {
    const f = filterPartition(part({ c9: { n: 1 } }), m);
    expect(f.rows).toBe(0);
    expect(f.h3).toEqual([]);
  });
});

describe("summary", () => {
  const m = members([
    ["A", "c1", 1],
    ["A", "c2", 0.25],
    ["B", "c2", 0.5],
    ["B", "c3", 0.5],
    ["C", "c9", 1],
  ]);
  const p = part({ c1: { n: 10, es: 4 }, c2: { n: 100, es: 20 }, c3: { n: 20 } });

  it("records are summed area-weighted; the indicator is the share-weighted mean of the hexagons", () => {
    const s = placeSummary(p, m, "es");
    expect(s.map((r) => r.place_id)).toEqual(["A", "B"]); // C has no loaded cell
    const [a, b] = s;
    expect(a).toEqual({ place_id: "A", cells: 2, area: 1.25, records: 10 + 25, valued: 2, mean: (4 * 1 + 20 * 0.25) / 1.25, min: 4, max: 20 });
    // B: c3 has no ES(50) (n < 50): it counts for records and area, not for the mean
    expect(b).toEqual({ place_id: "B", cells: 2, area: 1, records: 50 + 10, valued: 1, mean: 20, min: 20, max: 20 });
  });

  it("a place with no valued hexagon has NaN mean, min and max", () => {
    const [r] = placeSummary(part({ c3: { n: 20 } }), m, "es");
    expect(r.place_id).toBe("B");
    expect(r.valued).toBe(0);
    expect([r.mean, r.min, r.max].every(Number.isNaN)).toBe(true);
  });

  it("records colour a place for n (they add up); every other indicator by its mean", () => {
    const [a] = placeSummary(p, m, "n");
    expect(placeValue(a, "n")).toBe(35);
    const [ae] = placeSummary(p, m, "es");
    expect(placeValue(ae, "es")).toBe(ae.mean);
  });

  it("colours span the places' own values; a place without a value has none", () => {
    const rows = placeSummary(p, members([...m.place.map((x, i) => [x, m.h3[i], m.share[i]] as [string, string, number]), ["D", "c3", 1]]), "es");
    const { domain, fill } = placeColors(rows, "es");
    expect(domain).toEqual([7.2, 20]);
    expect(fill.A).toBe("rgb(68,1,84)"); // the low end of viridis
    expect(fill.B).toBe("rgb(253,231,37)"); // the high end
    expect(fill.D).toBeUndefined(); // D: one hexagon without ES(50)
    expect(placeColors([], "es")).toEqual({ domain: null, fill: {} });
  });

  it("CSV: a header naming the indicator, one row per place, names quoted when needed", () => {
    const csv = summaryCsv(placeSummary(p, m, "es"), new Map([["A", 'Big "A", bay']]), "es", "coll", 5);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("collection,place_id,name,res,hexagons,area_hexagons,records_weighted,hexagons_valued,es_mean_of_hexagons,es_min,es_max");
    expect(lines[1]).toBe('coll,A,"Big ""A"", bay",5,2,1.25,35,2,7.2,4,20');
    expect(lines[2]).toBe("coll,B,,5,2,1,60,1,20,20,20");
  });
});

describe("MemberCache on the fixture (Node DuckDB-WASM)", () => {
  const url = (p: string) => `${dir}/${p}`;

  it("reads res 7 files once each and filters by place in JS", async () => {
    const engine = new Engine({ createDb: createNodeDb });
    let queries = 0;
    const db = { query: (sql: string) => (queries++, engine.query(sql)) };
    const cache = new MemberCache(db, async () => new Response(readFileSync(`${dir}/h3/membership.json`)));
    const man = await cache.manifest("x/h3/membership.json");
    const files = membershipFiles(man, 7, null, null)!.map((f) => url(f.path));
    const all = await cache.members(files, null);
    expect(all.h3.length).toBe(42);
    expect(new Set(all.place).size).toBe(10);
    expect(all.h3.every((c) => /^87[0-9a-f]{13}$/.test(c))).toBe(true);
    expect(all.share.every((s) => s > 0 && s <= 1)).toBe(true);
    const before = queries;
    const one = await cache.members(files, ["AOA:N2-E"]);
    expect(queries).toBe(before); // cached
    expect(new Set(one.place)).toEqual(new Set(["AOA:N2-E"]));
    const parents = await cache.parents(url("h3/parents.parquet"), 7, ["AOA:CN1-A", "AOA:CN1-B"]);
    expect(parents).toEqual(new Set(["8329a1fffffffff"]));
    await engine.dispose();
  });

  it("res 5: the rows match the file", async () => {
    const engine = new Engine({ createDb: createNodeDb });
    const cache = new MemberCache(engine);
    const m = await cache.members([url("h3/res=5/membership.parquet")], ["AOA:N1-B"]);
    expect(m.h3).toEqual(["85291263fffffff", "85291277fffffff"]);
    expect(m.share[0]).toBeCloseTo(0.014579104, 6);
    expect(m.share[1]).toBeCloseTo(0.007161837, 6);
    await engine.dispose();
  });
});
