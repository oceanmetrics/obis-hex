import { describe, expect, it } from "vitest";
import { REGIONS, SEAS_GROUP } from "../src/lib/view/regions";
import type { StyleSpecification } from "maplibre-gl";
import { placeFilter, kindFilter, outlineIds, OUTLINE_COLORS, splitStyle, labelStyle } from "../src/lib/map/map";
import { DEFAULT_STATE } from "../src/lib/state/url";
import { zoomToRes } from "../src/lib/state/resolution";

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

describe("basemap split: labels above the hexagons (#1)", () => {
  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://example.org/{fontstack}/{range}.pbf",
    sources: { carto: { type: "vector", url: "https://example.org/carto.json" } },
    layers: [
      { id: "background", type: "background" },
      { id: "water", type: "fill", source: "carto", "source-layer": "water" },
      { id: "roads", type: "line", source: "carto", "source-layer": "transportation" },
      { id: "place_city", type: "symbol", source: "carto", "source-layer": "place", layout: { "text-field": "{name}" } },
      { id: "water_name", type: "symbol", source: "carto", "source-layer": "water_name" },
    ],
  };
  it("the main map keeps every layer but the labels, the label map only the labels", () => {
    expect(splitStyle(style, "base").layers.map((l) => l.id)).toEqual(["background", "water", "roads"]);
    expect(splitStyle(style, "labels").layers.map((l) => l.id)).toEqual(["place_city", "water_name"]);
    expect(splitStyle(style, "labels").sources).toBe(style.sources);
    expect(splitStyle(style, "labels").glyphs).toBe(style.glyphs);
  });
  it("the label style carries the labels' visibility and the projection", () => {
    const on = labelStyle(style, true, "globe");
    expect(on.projection).toEqual({ type: "globe" });
    expect(on.layers.map((l) => l.layout?.visibility)).toEqual(["visible", "visible"]);
    expect((on.layers[0].layout as Record<string, unknown>)["text-field"]).toBe("{name}");
    const off = labelStyle(style, false, "flat");
    expect(off.projection).toEqual({ type: "mercator" });
    expect(off.layers.map((l) => l.layout?.visibility)).toEqual(["none", "none"]);
    expect(style.layers[3].layout).toEqual({ "text-field": "{name}" });
  });
});

describe("the opening view (#1)", () => {
  it("is centred over North America, not the whole world", () => {
    expect(DEFAULT_STATE.lon).toBeGreaterThan(-125);
    expect(DEFAULT_STATE.lon).toBeLessThan(-65);
    expect(DEFAULT_STATE.lat).toBeGreaterThan(25);
    expect(DEFAULT_STATE.lat).toBeLessThan(50);
    expect(zoomToRes(DEFAULT_STATE.zoom)).toBe(2);
  });
});
