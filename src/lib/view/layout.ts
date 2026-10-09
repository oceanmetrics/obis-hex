// the panes' layout over the map (0.8.0, #2): the Controls run the stage's full height at the left, so
// the taxon list has room, and the Time strip starts to their right instead of spanning the stage
// under them. The Controls stay a kit Pane (dragged, resized, folded), so the strip's left edge is
// read off where the pane actually is.

/** the gap between a pane and the stage edge or another pane, px (the kit Pane's `margin`) */
export const PANE_GAP = 12;
/** the narrowest Time strip worth drawing beside the Controls; below it the strip spans the stage */
export const STRIP_MIN_WIDTH = 320;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** the Time strip's left edge in stage px: right of the Controls when they sit at the left and reach
 * down beside the strip (`stripTop`, the strip's top edge), else the stage gap. Boxes are relative to
 * the stage; `pane` is null when the Controls are folded or hidden. */
export function stripLeft(stageWidth: number, pane: Box | null, stripTop: number): number {
  if (!pane) return PANE_GAP;
  const atLeft = pane.left < stageWidth / 2;
  const beside = pane.bottom > stripTop;
  const left = Math.round(pane.right + PANE_GAP);
  if (!atLeft || !beside || stageWidth - left - PANE_GAP < STRIP_MIN_WIDTH) return PANE_GAP;
  return left;
}

/** a DOM rect relative to the stage's rect */
export const relBox = (r: Box, to: Box): Box => ({
  left: r.left - to.left,
  top: r.top - to.top,
  right: r.right - to.left,
  bottom: r.bottom - to.top,
});
