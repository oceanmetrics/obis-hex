// the in-app tour: a focus ring on one part of the page and a small card (Back / Next / Done). The
// stops follow the page in the pipeline order of the docs (calcofi.io/explore's "Start the tour"):
// the sentence, the four Controls tabs with the legend and the Time strip and the Cell pill between
// method and delivery, then Help. No library: Tour.svelte draws the ring and the card, this file
// holds the stops and the keyboard rules, so both are tested.
import type { Tab } from "../state/url";

export interface TourStop {
  id: string;
  /** CSS selectors for the part to ring, tried in order; the first visible one wins */
  target: string[];
  title: string;
  text: string;
  /** open this Controls tab (and unfold Controls) before ringing it */
  tab?: Tab;
  /** unfold the Time strip first */
  time?: boolean;
}

const tabSel = (t: Tab) => [`#controls [role="tab"][id$="-tab-${t}"]`, `[role="tab"][id$="-tab-${t}"]`];

export const TOUR_STOPS: TourStop[] = [
  {
    id: "sentence",
    target: [".view-title"],
    title: "What is on the map",
    text: "This sentence says what the map shows: which taxa, which years, where, the hexagon size and the indicator. Click any bold word to change it.",
  },
  {
    id: "taxon",
    target: tabSel("taxon"),
    tab: "taxon",
    title: "① Taxon",
    text: "Choose what to count: all taxa, an Essential Ocean Variable such as seabirds, a phylum, class or order, or any taxon in WoRMS.",
  },
  {
    id: "place",
    target: tabSel("place"),
    tab: "place",
    title: "② Place & scale",
    text: "Go to a sea or a sanctuary (a sanctuary is outlined on the map), set the hexagon size and the decade, or turn the flat map into a globe.",
  },
  {
    id: "indicator",
    target: tabSel("indicator"),
    tab: "indicator",
    title: "③ Indicator",
    text: "Choose how diversity is measured. ES(50) is the number of species expected in 50 records, so a well-sampled place does not look richer just because it has more records.",
  },
  {
    id: "legend",
    target: [".view-title .sub", ".title-band .legend", ".title-band"],
    title: "The colour scale and coverage",
    text: "Yellow is high, purple is low. For ES(50) the line beside it counts the hexagons with the 50 records it needs; the others stay empty.",
  },
  {
    id: "time",
    target: [".mbon-timestrip"],
    time: true,
    title: "The Time strip",
    text: "Records per decade for this taxon. Drag across a decade to map only those years; click the strip to go back to all years.",
  },
  {
    id: "cell",
    target: [".mbon-pane-pill[aria-label='Show cell pane']", ".cell-pane"],
    title: "The Cell pill",
    text: "Click a hexagon and this pill lights up. Open it to see all five indicators for that hexagon.",
  },
  {
    id: "share",
    target: tabSel("share"),
    tab: "share",
    title: "④ Share",
    text: "Every view is a link. Download the map as a PNG with its title, copy the link, or copy the citation.",
  },
  {
    id: "help",
    target: [".mbon-header .mbon-menu .trigger"],
    title: "Help",
    text: "The guide, this tour, the data sources and the keyboard shortcuts are here. The speech bubble beside it sends us feedback (Send, or a GitHub issue if sending is not set up).",
  },
];

/** what a key does while the tour is open: move, close, or nothing (let the page have it) */
export type TourMove = "next" | "back" | "first" | "last" | "close" | null;

export function tourKey(key: string): TourMove {
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "back";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "close";
    default:
      return null;
  }
}

/** the stop after a move; -1 closes the tour (Next on the last stop is Done) */
export function tourStep(i: number, move: TourMove, n: number = TOUR_STOPS.length): number {
  if (n <= 0) return -1;
  switch (move) {
    case "next":
      return i + 1 >= n ? -1 : i + 1;
    case "back":
      return Math.max(0, i - 1);
    case "first":
      return 0;
    case "last":
      return n - 1;
    case "close":
      return -1;
    default:
      return i;
  }
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** where the card goes: below the ringed part if it fits, else above, else beside; always inside
 * the window (8 px margin) */
export function cardPosition(target: Rect, card: { width: number; height: number }, win: { width: number; height: number }, gap = 12): { left: number; top: number } {
  const m = 8;
  const clampX = (x: number) => Math.max(m, Math.min(x, win.width - card.width - m));
  const clampY = (y: number) => Math.max(m, Math.min(y, win.height - card.height - m));
  const below = target.top + target.height + gap;
  if (below + card.height <= win.height - m) return { left: clampX(target.left), top: below };
  const above = target.top - gap - card.height;
  if (above >= m) return { left: clampX(target.left), top: above };
  const right = target.left + target.width + gap;
  if (right + card.width <= win.width - m) return { left: right, top: clampY(target.top) };
  return { left: clampX(target.left - gap - card.width), top: clampY(target.top) };
}
