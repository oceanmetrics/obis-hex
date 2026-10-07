// the engine against real Parquet: the committed fixture release (always) and the full demo
// release under ~/data/obis-h3-demo/demo (when present locally; CI does not have it).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cellToParent, getResolution, isValidCell } from "h3-js";
import { Engine } from "../src/lib/engine/engine";
import { fileUrl } from "../src/lib/release/manifest";
import { loadMeta, statsSql, type ReleaseMeta, type StatsRow } from "../src/lib/release/release";
import { viewStats } from "../src/lib/color/ramp";
import { createNodeDb } from "./helpers/nodeDb";

const FIXTURE = `${resolve(__dirname, "fixtures/release")}/`;
const DEMO = `${join(homedir(), "data", "obis-h3-demo", "demo")}/`;

describe("engine on the fixture release", () => {
  const engine = new Engine({ createDb: createNodeDb });
  let meta: ReleaseMeta;
  const release = JSON.parse(readFileSync(`${FIXTURE}release.json`, "utf8"));

  beforeAll(async () => {
    meta = await loadMeta(engine, FIXTURE);
  });
  afterAll(() => engine.dispose());

  it("loads the manifest; layers missing from release.json are absent, not errors", () => {
    expect(meta.manifest.hasLayer("all")).toBe(true);
    expect(meta.manifest.hasLayer("decade_all")).toBe(true);
    expect(meta.manifest.hasLayer("eov")).toBe(false);
    expect(release.layers.eov).toBeUndefined();
    expect(meta.manifest.lookup({ kind: "eov", eov: "fish" }, null, 3)).toBeNull();
    expect(meta.taxonGroups).toEqual([]);
    expect(meta.statsLoaded).toBe(true);
  });

  it("manifest row counts add up to release.json per layer", () => {
    for (const [layer, info] of Object.entries(release.layers) as [string, { rows: number }][]) {
      const sum = meta.manifest.rows
        .filter((r) => r.layer === layer)
        .reduce((a, r) => a + r.rows, 0);
      expect(sum, layer).toBe(info.rows);
    }
  });

  it("reads one partition: row count matches the manifest, h3 strings are valid cells", async () => {
    const row = meta.manifest.lookup({ kind: "all" }, null, 1)!;
    const p = await engine.loadPartition(fileUrl(FIXTURE, row));
    expect(p.rows).toBe(row.rows);
    expect(p.h3).toHaveLength(row.rows);
    expect(p.h3.every((h) => isValidCell(h) && getResolution(h) === 1)).toBe(true);
    expect(p.values.n.every((v) => v >= 1)).toBe(true);
  });

  it("the loaded partition's own p02–p98 equals stats.parquet's for the same view", async () => {
    const row = meta.manifest.lookup({ kind: "all" }, null, 1)!;
    const p = await engine.loadPartition(fileUrl(FIXTURE, row));
    for (const v of ["es", "sp", "shannon"] as const) {
      const [s] = await engine.rows<StatsRow>(statsSql("all", { kind: "all" }, null, 1, v));
      const mine = viewStats(p.values[v]);
      expect(mine.valued, v).toBe(s.n_cells);
      expect(mine.p02, v).toBeCloseTo(s.p02!, 6);
      expect(mine.p98, v).toBeCloseTo(s.p98!, 6);
    }
  });

  it("decade partitions and NULL ES(50) as NaN", async () => {
    const row = meta.manifest.lookup({ kind: "all" }, 2000, 1)!;
    expect(row.layer).toBe("decade_all");
    const p = await engine.loadPartition(fileUrl(FIXTURE, row));
    expect(p.rows).toBe(row.rows);
    const nanEs = p.values.es.filter((v, i) => Number.isNaN(v) && p.values.n[i] < 50).length;
    const anyNan = p.values.es.filter(Number.isNaN).length;
    expect(nanEs).toBe(anyNan); // only cells with n < 50 lack ES(50)
  });

  it("layout v2: res 7 is split by res-3 parent; a union of parents loads through DuckDB", async () => {
    const v7 = meta.manifest.view({ kind: "all" }, null, 7)!;
    expect(v7.whole).toBeNull();
    expect(v7.parentRes).toBe(3);
    expect(release.layers.all.parent_res).toEqual({ "6": 2, "7": 3 });
    const parents = ["83de80fffffffff", "83de81fffffffff", "83de83fffffffff"];
    const rows = parents.map((p) => v7.parents!.get(p)!);
    const urls = rows.map((r) => fileUrl(FIXTURE, r));
    const u = await engine.loadUnion(urls.slice(0, 2));
    expect(u.fetched).toHaveLength(2);
    expect(u.rows).toBe(rows[0].rows + rows[1].rows);
    // the third is fetched alone; the first two come from the DuckDB cache
    const all3 = await engine.loadUnion(urls);
    expect(all3.fetched).toEqual([urls[2]]);
    expect(all3.rows).toBe(rows.reduce((a, r) => a + r.rows, 0));
    expect(engine.partsCached).toBe(3);
    expect(new Set(all3.h3).size).toBe(all3.rows);
    expect(all3.h3.every((h) => getResolution(h) === 7 && parents.includes(cellToParent(h, 3)))).toBe(
      true,
    );
    expect(all3.values.n.every((v) => v >= 1)).toBe(true);
  });

  it("evicts the least recently used parent partitions beyond the cap", async () => {
    const e = new Engine({ createDb: createNodeDb });
    e.maxCachedParts = 1;
    const v7 = meta.manifest.view({ kind: "all" }, null, 7)!;
    const [a, b] = ["83de80fffffffff", "83de81fffffffff"].map((p) => fileUrl(FIXTURE, v7.parents!.get(p)!));
    await e.loadUnion([a]);
    const ub = await e.loadUnion([b]);
    expect(e.partsCached).toBe(1);
    expect(ub.rows).toBe(v7.parents!.get("83de81fffffffff")!.rows);
    const ua = await e.loadUnion([a]);
    expect(ua.fetched).toEqual([a]);
    await e.dispose();
  });

  it("caches by URL", async () => {
    const url = fileUrl(FIXTURE, meta.manifest.lookup({ kind: "all" }, null, 2)!);
    const before = engine.cacheSize;
    const a = await engine.loadPartition(url);
    const b = await engine.loadPartition(url);
    expect(a).toBe(b);
    expect(engine.cacheSize).toBe(before + 1);
  });
});

describe.skipIf(!existsSync(`${DEMO}all/res=3/data_0.parquet`))("engine on the local demo release", () => {
  const engine = new Engine({ createDb: createNodeDb });
  afterAll(() => engine.dispose());

  it("all/res=3: row count equals the manifest and release.json; h3 valid", async () => {
    const meta = await loadMeta(engine, DEMO);
    const release = JSON.parse(readFileSync(`${DEMO}release.json`, "utf8"));
    const row = meta.manifest.lookup({ kind: "all" }, null, 3)!;
    expect(row.path).toBe("all/res=3/data_0.parquet");
    const p = await engine.loadPartition(`${DEMO}all/res=3/data_0.parquet`);
    expect(p.rows).toBe(row.rows);
    const allRows = meta.manifest.rows.filter((r) => r.layer === "all").reduce((a, r) => a + r.rows, 0);
    expect(allRows).toBe(release.layers.all.rows);
    expect(p.h3.every((h) => isValidCell(h) && getResolution(h) === 3)).toBe(true);
  });
});
