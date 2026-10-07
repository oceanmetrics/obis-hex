import { describe, expect, it } from "vitest";
import {
  chooseDomain,
  domainFromStats,
  quantileSorted,
  rampColor,
  VIRIDIS,
  viewStats,
} from "../src/lib/color/ramp";

const row = (o: Partial<{ min: number | null; p02: number | null; p98: number | null; max: number | null; n_cells: number }>) => ({
  min: 0,
  p02: 1,
  p98: 9,
  max: 10,
  n_cells: 5,
  ...o,
});

describe("colour-ramp domain from stats rows", () => {
  it("is p02–p98", () => expect(domainFromStats(row({}))).toEqual([1, 9]));
  it("falls back to min–max when p02 = p98", () =>
    expect(domainFromStats(row({ p02: 3, p98: 3 }))).toEqual([0, 10]));
  it("falls back to min–max when p02/p98 are NULL", () =>
    expect(domainFromStats(row({ p02: null, p98: null }))).toEqual([0, 10]));
  it("is null when n_cells = 0 (e.g. ES(50) where every n < 50)", () =>
    expect(domainFromStats(row({ n_cells: 0 }))).toBeNull());
  it("is null for no row", () => expect(domainFromStats(null)).toBeNull());
  it("chooses release stats, else the view's own quantiles", () => {
    const v = viewStats(Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(chooseDomain("release", [1, 9], v)).toEqual([1, 9]);
    expect(chooseDomain("view", [1, 9], v)).toEqual([0.2, 9.8]);
    expect(chooseDomain("release", null, v)).toEqual([0.2, 9.8]);
  });
});

describe("ramp + quantiles", () => {
  it("clamps to the ends of viridis", () => {
    expect(rampColor(-5, [0, 1])).toEqual(VIRIDIS[0]);
    expect(rampColor(5, [0, 1])).toEqual(VIRIDIS[VIRIDIS.length - 1]);
    expect(rampColor(0.5, [0, 1])).toEqual(VIRIDIS[4]);
  });
  it("type-7 quantile like R / DuckDB quantile_cont", () => {
    const s = [1, 2, 3, 4];
    expect(quantileSorted(s, 0.5)).toBe(2.5);
    expect(quantileSorted(s, 0.02)).toBeCloseTo(1.06);
  });
  it("viewStats skips NaN (NULL)", () => {
    const v = viewStats(Float64Array.from([NaN, 2, 1, NaN, 3]));
    expect(v).toMatchObject({ cells: 5, valued: 3, min: 1, max: 3, p50: 2 });
  });
});
