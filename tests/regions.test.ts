import { describe, expect, it } from "vitest";
import { REGIONS, placeIdOf, regionOfPlace } from "../src/lib/view/regions";
import { PLACE_ID_RE } from "../src/lib/state/url";
import { placeFilter, OUTLINE_COLORS } from "../src/lib/map/map";

describe("region presets and gazetteer places", () => {
  it("maps the sanctuary presets to their gazetteer place ids", () => {
    expect(placeIdOf("mbnms")).toBe("NMS:MBNMS");
    expect(placeIdOf("fknms")).toBe("NMS:FKNMS");
    expect(placeIdOf("pmnm")).toBe("NMS:PMNM");
    expect(placeIdOf("tortugas")).toBe("PSGID:939");
    expect(placeIdOf("pitcairn")).toBe("MRGID:8439");
  });
  it("seas, oceans and unknown ids have no outline", () => {
    for (const id of ["world", "pacific", "caribbean", "gulf-maine", "north-sea", "gbr", "benguela", "nope", null, undefined])
      expect(placeIdOf(id), String(id)).toBeNull();
  });
  it("every place id is valid and unique, and finds its region back", () => {
    const ids = REGIONS.flatMap((r) => (r.place_id ? [r.place_id] : []));
    expect(ids.length).toBe(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REGIONS) {
      if (!r.place_id) continue;
      expect(r.place_id).toMatch(PLACE_ID_RE);
      expect(regionOfPlace(r.place_id)?.id).toBe(r.id);
    }
    expect(regionOfPlace("NMS:NOPE")).toBeNull();
    expect(regionOfPlace(null)).toBeNull();
  });
  it("a bbox is west < east, south < north (PMNM spans the antimeridian, so it has none)", () => {
    for (const r of REGIONS) {
      if (!r.bbox) continue;
      expect(r.place_id, r.id).toBeDefined();
      expect(r.bbox[0]).toBeLessThan(r.bbox[2]);
      expect(r.bbox[1]).toBeLessThan(r.bbox[3]);
      expect(r.lon).toBeGreaterThanOrEqual(r.bbox[0]);
      expect(r.lon).toBeLessThanOrEqual(r.bbox[2]);
    }
    expect(REGIONS.find((r) => r.id === "pmnm")?.bbox).toBeUndefined();
  });
  it("the map filter matches the id, and nothing when unset", () => {
    expect(placeFilter("NMS:MBNMS")).toEqual(["==", ["get", "place_id"], "NMS:MBNMS"]);
    expect(placeFilter(null)).toEqual(["==", ["get", "place_id"], ""]);
    expect(OUTLINE_COLORS.dark.line).not.toBe(OUTLINE_COLORS.light.line);
  });
});
