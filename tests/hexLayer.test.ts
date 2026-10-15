import { describe, expect, it } from "vitest";
import { DEFAULT_MARK_COLOR } from "../src/lib/feedback/colors";
import { SELECTED_COLOR, SELECTED_WIDTH_PX, selectedLayer } from "../src/lib/map/hexLayer";

describe("selectedLayer", () => {
  it("outlines the one selected hexagon in pink, above the cells, without taking their clicks", () => {
    const l = selectedLayer("872834c65ffffff");
    expect(l.id).toBe("hex-selected");
    expect(l.props.data).toEqual(["872834c65ffffff"]);
    expect(l.props.filled).toBe(false);
    expect(l.props.stroked).toBe(true);
    expect(l.props.pickable).toBe(false);
    expect(l.props.getLineColor).toEqual(SELECTED_COLOR);
    expect(l.props.getLineWidth).toBe(SELECTED_WIDTH_PX);
    expect(l.props.lineWidthUnits).toBe("pixels");
  });

  it("is the feedback marks' pink, opaque, and thick", () => {
    const hex = DEFAULT_MARK_COLOR.slice(1);
    expect(SELECTED_COLOR).toEqual([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255));
    expect(SELECTED_WIDTH_PX).toBeGreaterThanOrEqual(3);
  });
});
