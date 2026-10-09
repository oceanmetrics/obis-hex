// the panes over the map (#2): the Time strip starts right of the full-height Controls
import { describe, expect, it } from "vitest";
import { PANE_GAP, relBox, stripLeft, STRIP_MIN_WIDTH } from "../src/lib/view/layout";

const W = 1400;
const STRIP_TOP = 600;
/** the Controls at their default: 400 px wide at the top left, the stage's full height */
const full = { left: 12, top: 12, right: 412, bottom: 788 };

describe("Time strip beside the Controls", () => {
  it("starts right of full-height Controls at the left", () => {
    expect(stripLeft(W, full, STRIP_TOP)).toBe(412 + PANE_GAP);
  });
  it("spans the stage when the Controls are folded (no pane)", () => {
    expect(stripLeft(W, null, STRIP_TOP)).toBe(PANE_GAP);
  });
  it("spans the stage when the Controls end above the strip (resized shorter)", () => {
    expect(stripLeft(W, { ...full, bottom: 500 }, STRIP_TOP)).toBe(PANE_GAP);
  });
  it("spans the stage when the Controls were dragged to the right half", () => {
    expect(stripLeft(W, { left: 900, top: 12, right: 1300, bottom: 788 }, STRIP_TOP)).toBe(PANE_GAP);
  });
  it("spans the stage when the strip beside the Controls would be too narrow", () => {
    const narrow = 412 + PANE_GAP * 2 + STRIP_MIN_WIDTH - 1;
    expect(stripLeft(narrow, full, STRIP_TOP)).toBe(PANE_GAP);
    expect(stripLeft(narrow + 1, full, STRIP_TOP)).toBe(412 + PANE_GAP);
  });
  it("rounds a fractional pane edge", () => {
    expect(stripLeft(W, { ...full, right: 412.6 }, STRIP_TOP)).toBe(425);
  });
  it("boxes are made relative to the stage", () => {
    expect(relBox({ left: 20, top: 150, right: 420, bottom: 900 }, { left: 8, top: 138, right: 1408, bottom: 938 }))
      .toEqual({ left: 12, top: 12, right: 412, bottom: 762 });
  });
});
