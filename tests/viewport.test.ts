// layout v2: split resolutions in the manifest, the viewport cover and the view plan
import { describe, expect, it } from "vitest";
import { cellToParent, getResolution, latLngToCell, polygonToCells } from "h3-js";
import { Manifest, type FileRow } from "../src/lib/release/manifest";
import { boundsRings, coverCells, estimateCells, planView, type Bounds } from "../src/lib/view/viewport";

const row = (layer: string, path: string, rows = 10, parent: string | null = null): FileRow => ({
  layer,
  path,
  url_path: path,
  rows,
  bytes: rows * 10,
  parent,
});

// a synthetic v2 release over the Caribbean box: res 1-5 whole, res 6 by res-2 parent, res 7 by
// res-3 parent (parent given only by the path, as a v2 files.parquet read without `parent` would)
const BOX: [number, number][] = [
  [5, -100],
  [35, -100],
  [35, -55],
  [5, -55],
];
const P2 = polygonToCells(BOX, 2);
const P3 = polygonToCells(BOX, 3);
const ROWS: FileRow[] = [
  row("meta", "stats.parquet"),
  ...[1, 2, 3, 4, 5].map((r) => row("all", `all/res=${r}/data_0.parquet`)),
  ...P2.map((p) => row("all", `all/res=6/p=${p}/data_0.parquet`)),
  ...P3.map((p) => row("all", `all/res=7/p=${p}/data_0.parquet`, 10, p)),
  // a small EOV kept whole at res 7 (below parent_min_rows in the export)
  row("eov", "eov/eov=seagrasses/res=7/data_0.parquet", 5),
];
const m = new Manifest(ROWS);
const ALL = { kind: "all" } as const;

describe("manifest v2: split resolutions", () => {
  it("groups parent partitions under one view; lookup() only returns whole files", () => {
    const v7 = m.view(ALL, null, 7)!;
    expect(v7.whole).toBeNull();
    expect(v7.parents?.size).toBe(P3.length);
    expect(v7.parentRes).toBe(3);
    expect(v7.rows).toBe(P3.length * 10);
    expect(m.view(ALL, null, 6)!.parentRes).toBe(2); // from the p= path segment
    expect(m.lookup(ALL, null, 7)).toBeNull();
    expect(m.lookup(ALL, null, 5)?.path).toBe("all/res=5/data_0.parquet");
    expect(m.view({ kind: "eov", eov: "seagrasses" }, null, 7)?.whole?.rows).toBe(5);
    expect(m.resolutions(ALL, null)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("viewport cover", () => {
  it("splits the view at the antimeridian and in strips of at most 90°", () => {
    const r = boundsRings([170, -10, 190, 10]);
    expect(r).toHaveLength(2);
    expect(r[0][2][1]).toBe(180);
    expect(r[1][0][1]).toBe(-180);
    expect(r[1][2][1]).toBe(-170);
    expect(boundsRings([-200, -10, 200, 10])).toHaveLength(4); // the whole world
    expect(boundsRings([-540, 0, -520, 10])[0][0][1]).toBe(-180); // a far world copy
  });

  it("covers every point of the view (centres plus a ring)", () => {
    const b: Bounds = [-80.3, 24.1, -76.9, 26.2];
    const cover = new Set(coverCells(b, 3, 64)!);
    for (let x = b[0]; x <= b[2]; x += 0.1)
      for (let y = b[1]; y <= b[3]; y += 0.1) expect(cover.has(latLngToCell(y, x, 3))).toBe(true);
    expect([...cover].every((c) => getResolution(c) === 3)).toBe(true);
  });

  it("a view smaller than one cell still gets its cell and neighbours", () => {
    const cover = coverCells([-80.01, 25, -80, 25.01], 2, 64)!;
    expect(cover).toContain(latLngToCell(25.005, -80.005, 2));
    expect(cover).toHaveLength(7);
  });

  it("coarse parents (res 0/1): the overlapping cells, no ring", () => {
    const b: Bounds = [-122.6, 36.4, -121.8, 37]; // ~ zoom 9 at Monterey Bay
    const cover = coverCells(b, 0, 64)!;
    expect(cover.length).toBeLessThanOrEqual(2); // not the 7 a ring would add
    for (let x = b[0]; x <= b[2]; x += 0.1)
      for (let y = b[1]; y <= b[3]; y += 0.1) expect(cover).toContain(latLngToCell(y, x, 0));
  });

  it("gives up early (null) on a view far beyond the limit", () => {
    expect(estimateCells([-180, -85, 180, 85], 3)).toBeGreaterThan(30000);
    expect(coverCells([-180, -85, 180, 85], 3, 64)).toBeNull();
  });
});

describe("view plan", () => {
  it("whole resolutions are one file, no notice", () => {
    const p = planView(m, ALL, null, 4, [-90, 10, -60, 30])!;
    expect(p).toMatchObject({ res: 4, split: false, notice: "" });
    expect(p.files[0].path).toBe("all/res=4/data_0.parquet");
  });

  it("a zoomed-in view loads only the parent partitions covering it", () => {
    const b: Bounds = [-80.3, 24.1, -76.9, 26.2]; // ~ zoom 8 over the Bahamas
    const p = planView(m, ALL, null, 7, b)!;
    expect(p.res).toBe(7);
    expect(p.split).toBe(true);
    expect(p.files.length).toBeGreaterThan(0);
    expect(p.files.length).toBeLessThanOrEqual(64);
    expect(p.parentsTotal).toBe(P3.length);
    const parents = new Set(p.files.map((f) => f.path.match(/p=([0-9a-f]+)/)![1]));
    // the parent of every cell in the view is loaded
    for (let x = b[0]; x <= b[2]; x += 0.2)
      for (let y = b[1]; y <= b[3]; y += 0.2)
        expect(parents.has(cellToParent(latLngToCell(y, x, 7), 3))).toBe(true);
  });

  it("too many partitions: falls back to the next coarser res, with a notice", () => {
    // ~ zoom 6 over the Caribbean: hundreds of res-3 parents, a few dozen res-2 ones
    const p = planView(m, ALL, null, 7, [-86, 14, -70, 24])!;
    expect(p.res).toBe(6);
    expect(p.split).toBe(true);
    expect(p.notice).toMatch(/Res 7 needs more than 64 partitions.*showing res 6/);
    // the whole Caribbean box: res 6 too would exceed the cap, res 5 is whole
    const q = planView(m, ALL, null, 7, [-100, 5, -55, 35])!;
    expect(q).toMatchObject({ res: 5, split: false });
    expect(q.notice).toMatch(/showing res 5/);
  });

  it("an empty view in a split res plans zero files (ocean with no data)", () => {
    const p = planView(m, ALL, null, 7, [10, -40, 12, -38])!;
    expect(p).toMatchObject({ res: 7, split: true, files: [] });
  });

  it("a small layer whole at res 7 is one file at any zoom", () => {
    const p = planView(m, { kind: "eov", eov: "seagrasses" }, null, 7, [-100, 5, -55, 35])!;
    expect(p).toMatchObject({ res: 7, split: false, notice: "" });
  });
});
