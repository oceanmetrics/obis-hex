/** The map's camera padding: the part of the stage the panes cover, so the map's centre (and a globe)
 * sits in the middle of what stays visible rather than of the whole stage. */

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** a pane's horizontal extent, in px from the stage's left edge */
export interface PaneSpan {
  left: number;
  right: number;
}

/** the least share of the stage's width the padding may leave the map (an expanded or very wide pane
 * covers the map; centring in a sliver would only push the view off screen) */
export const MIN_OPEN_SHARE = 0.4;

/** Padding for a stage `width` px wide with the Controls pane at `pane` (null when folded, a sheet or
 * not drawn) and `bottom` px of Time strip. A pane whose centre is in the left half pads the left up
 * to its right edge; one dragged into the right half pads the right from its left edge. Nothing is
 * padded sideways when that would leave less than `MIN_OPEN_SHARE` of the width. */
export function mapPadding(width: number, pane: PaneSpan | null, bottom: number): Padding {
  const pad: Padding = { top: 0, right: 0, bottom: Math.max(0, bottom), left: 0 };
  if (!pane || !(width > 0)) return pad;
  const left = Math.max(0, Math.min(width, pane.left));
  const right = Math.max(left, Math.min(width, pane.right));
  const onLeft = (left + right) / 2 < width / 2;
  const side = onLeft ? right : width - left;
  if (side <= 0 || width - side < MIN_OPEN_SHARE * width) return pad;
  if (onLeft) pad.left = side;
  else pad.right = side;
  return pad;
}
