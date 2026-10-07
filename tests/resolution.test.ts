import { describe, expect, it } from "vitest";
import { autoRes, effectiveRes, resCap, ZOOM_BREAKS, zoomToRes } from "../src/lib/state/resolution";

describe("zoom → H3 resolution (port of the Shiny app's zoom_to_res)", () => {
  it("uses the same breaks as app.R", () => {
    expect(ZOOM_BREAKS.map((b) => Number(b.toFixed(4)))).toEqual([
      0, 2.2, 3.4, 4.6, 5.8, 7, 8.2, 9.4, 10.6, 11.8, 22,
    ]);
  });

  it.each([
    [0, 1],
    [1.4, 1],
    [2.19, 1],
    [2.2, 2],
    [3.4, 3],
    [4.6, 4],
    [5.8, 5],
    [6.99, 5],
    [7, 6],
    [8.2, 7],
    [9.4, 8],
    [11.8, 10],
    [22, 10],
  ])("zoom %f → res %i (uncapped)", (z, r) => expect(zoomToRes(z)).toBe(r));

  it("caps at 7 (the store's max)", () => {
    expect(autoRes(9.4)).toBe(7);
    expect(autoRes(15)).toBe(7);
    expect(autoRes(8.2)).toBe(7);
    expect(autoRes(7.5)).toBe(6);
  });

  it("caps at 5 when a decade is selected", () => {
    expect(effectiveRes("auto", 3, 9, 1990)).toBe(5);
    expect(effectiveRes("manual", 7, 1, 1990)).toBe(5);
    expect(effectiveRes("manual", 7, 1, null)).toBe(7);
  });

  it("a live AphiaID layer keeps res 7 with a decade (the endpoint filters years itself)", () => {
    expect(effectiveRes("auto", 3, 9, 1990, true)).toBe(7);
    expect(effectiveRes("manual", 7, 1, 1990, true)).toBe(7);
    expect(resCap(1990, true)).toBe(7);
    expect(resCap(1990)).toBe(5);
  });

  it("manual ignores zoom", () => {
    expect(effectiveRes("manual", 2, 12, null)).toBe(2);
    expect(effectiveRes("auto", 2, 4.6, null)).toBe(4);
  });
});
