// map zoom → H3 resolution, ported from the Shiny app (MarineSensitivity/apps/h3-db/app.R, itself a
// port of the h3t server's zoom_to_res):
//   ZOOM_BREAKS <- b <- 1 + (13 - 1) * (0:10) / 10; b[1] <- 0; b[11] <- 22
//   zoom_to_res <- function(z) max(1, min(10, findInterval(z, ZOOM_BREAKS)))
// i.e. breaks 0, 2.2, 3.4, 4.6, 5.8, 7, 8.2, 9.4, 10.6, 11.8, 22, and the store caps it at 7.

export const RES_MAX = 7;
/** decade partitions exist only for res 1..5 */
export const RES_DECADE_MAX = 5;

export const ZOOM_BREAKS: readonly number[] = Array.from({ length: 11 }, (_, i) =>
  i === 0 ? 0 : i === 10 ? 22 : 1 + ((13 - 1) * i) / 10,
);

/** R's findInterval(z, ZOOM_BREAKS) clamped to 1..10. */
export function zoomToRes(zoom: number): number {
  let k = 0;
  for (const b of ZOOM_BREAKS) if (zoom >= b) k++;
  return Math.max(1, Math.min(10, k));
}

/** the resolution actually served in auto mode, capped (7, or 5 when a decade is selected). */
export function autoRes(zoom: number, cap: number = RES_MAX): number {
  return Math.min(zoomToRes(zoom), cap);
}

/** the resolution cap: 7, or 5 with a decade (the release's decade partitions stop at 5); a live
 * AphiaID layer (`live`) filters decades on the server, so it keeps 7. */
export function resCap(decade: number | null, live = false): number {
  return decade === null || live ? RES_MAX : RES_DECADE_MAX;
}

/** the resolution a view uses: auto follows the zoom, manual is the pinned value; both capped. */
export function effectiveRes(
  mode: "auto" | "manual",
  manualRes: number,
  zoom: number,
  decade: number | null,
  live = false,
): number {
  const cap = resCap(decade, live);
  if (mode === "auto") return autoRes(zoom, cap);
  return Math.max(1, Math.min(cap, Math.round(manualRes)));
}
