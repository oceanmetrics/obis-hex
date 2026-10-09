import { describe, expect, it } from "vitest";
import { mapPadding } from "../src/lib/view/padding";

describe("mapPadding", () => {
  it("pads only the bottom without a pane (folded Controls)", () => {
    expect(mapPadding(1800, null, 140)).toEqual({ top: 0, right: 0, bottom: 140, left: 0 });
  });

  it("pads the left up to the right edge of a pane on the left", () => {
    expect(mapPadding(1800, { left: 12, right: 412 }, 140)).toEqual({ top: 0, right: 0, bottom: 140, left: 412 });
  });

  it("pads the right from the left edge of a pane dragged into the right half", () => {
    expect(mapPadding(1800, { left: 1388, right: 1788 }, 0)).toEqual({ top: 0, right: 412, bottom: 0, left: 0 });
  });

  it("leaves the sides alone when the pane would leave less than 40% of the width", () => {
    // an expanded pane covers the stage
    expect(mapPadding(1800, { left: 12, right: 1788 }, 56)).toEqual({ top: 0, right: 0, bottom: 56, left: 0 });
    // a 400 px pane on a 600 px stage
    expect(mapPadding(600, { left: 12, right: 412 }, 0).left).toBe(0);
  });

  it("clamps a pane partly off the stage and a negative bottom", () => {
    expect(mapPadding(1000, { left: -50, right: 300 }, -5)).toEqual({ top: 0, right: 0, bottom: 0, left: 300 });
  });

  it("pads nothing on a stage with no width", () => {
    expect(mapPadding(0, { left: 12, right: 412 }, 0)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
