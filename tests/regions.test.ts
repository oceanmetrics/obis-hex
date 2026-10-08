import { describe, expect, it } from "vitest";
import { REGIONS, SEAS_GROUP } from "../src/lib/view/regions";
import { placeFilter, kindFilter, outlineIds, OUTLINE_COLORS } from "../src/lib/map/map";

describe("sea and ocean camera presets", () => {
  it("are the 13 cameras with no gazetteer feature, in one group (0.7.0)", () => {
    expect(REGIONS.map((r) => r.id)).toEqual([
      "world", "pacific", "atlantic", "indian", "southern", "arctic",
      "caribbean", "gulf-maine", "north-sea", "mediterranean", "gbr", "coral-triangle", "benguela",
    ]);
    for (const r of REGIONS) {
      expect(r.group, r.id).toBe(SEAS_GROUP);
      expect(r).not.toHaveProperty("place_id");
      expect(r.lat).toBeGreaterThanOrEqual(-90);
      expect(r.lat).toBeLessThanOrEqual(90);
    }
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
  });
});

describe("outline filters and ids", () => {
  it("the map filter matches the id, and nothing when unset", () => {
    expect(placeFilter("NMS:MBNMS")).toEqual(["==", ["get", "place_id"], "NMS:MBNMS"]);
    expect(placeFilter(null)).toEqual(["==", ["get", "place_id"], ""]);
    expect(OUTLINE_COLORS.dark.line).not.toBe(OUTLINE_COLORS.light.line);
  });
  it("polygons and lines draw as lines, points as circles", () => {
    expect(kindFilter("GEBCO:1", false)).toEqual(["all", ["==", ["get", "place_id"], "GEBCO:1"], ["!=", ["geometry-type"], "Point"]]);
    expect(kindFilter("GEBCO:1", true)).toEqual(["all", ["==", ["get", "place_id"], "GEBCO:1"], ["==", ["geometry-type"], "Point"]]);
  });
  it("each collection has its own source and layers", () => {
    const a = outlineIds("boem_wind_leases");
    const b = outlineIds("calcofi_lines");
    expect(a.source).toBe("gz-boem_wind_leases");
    expect(new Set([...Object.values(a), ...Object.values(b)]).size).toBe(10);
  });
});
