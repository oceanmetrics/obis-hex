// first visit: the welcome card ("Start here") with two doors and three worked questions, and the
// page-URL switches that drive it. `?tour=off` suppresses the welcome card and the tour (for
// deterministic screenshots), `?tour=on` replays the tour, `?modal=about|sources|keys` opens a Help
// modal. These are query parameters, not view state, so they never enter the hash.
import type { AppState } from "../state/url";

export const WELCOME_SEEN_KEY = "obis-hex-welcome";

export type HelpModal = "about" | "sources" | "keys";
export const HELP_MODALS: readonly HelpModal[] = ["about", "sources", "keys"];

export interface HelpQuery {
  tour: "on" | "off" | null;
  modal: HelpModal | null;
}

export function parseHelpQuery(search: string): HelpQuery {
  const q = new URLSearchParams(search);
  const t = (q.get("tour") ?? "").toLowerCase();
  const tour = t === "on" || t === "1" ? "on" : t === "off" || t === "0" ? "off" : null;
  const m = (q.get("modal") ?? "").toLowerCase();
  const modal = (HELP_MODALS as readonly string[]).includes(m) ? (m as HelpModal) : null;
  return { tour, modal };
}

/** what opens on load: `?tour=off` nothing; `?tour=on` the tour; a `?modal=` that modal;
 * otherwise the welcome card on a first visit only */
export function onLoad(q: HelpQuery, seen: boolean): { welcome: boolean; tour: boolean; modal: HelpModal | null } {
  if (q.tour === "off") return { welcome: false, tour: false, modal: q.modal };
  if (q.tour === "on") return { welcome: false, tour: true, modal: null };
  if (q.modal) return { welcome: false, tour: false, modal: q.modal };
  return { welcome: !seen, tour: false, modal: null };
}

/** a view to open from the welcome card: the parts of AppState it sets (the rest is kept) */
export interface StartView {
  label: string;
  patch: Partial<AppState>;
}

const reset: Partial<AppState> = { decade: null, cell: null, cellOpen: false, domain: "release" };

export const DOORS: StartView[] = [
  {
    label: "Show me seabird diversity",
    patch: { ...reset, layer: "eov:seabirds", indicator: "es", resMode: "manual", res: 3, proj: "flat", lon: -20, lat: 5, zoom: 1.4 },
  },
  {
    label: "Zoom into a sanctuary",
    patch: { ...reset, layer: "taxon:class:Aves", indicator: "es", resMode: "manual", res: 7, proj: "flat", lon: -122.05, lat: 36.75, zoom: 9.2 },
  },
];

export const QUESTIONS: StartView[] = [
  {
    label: "Where have hard corals been recorded most?",
    patch: { ...reset, layer: "eov:hardCorals", indicator: "n", resMode: "manual", res: 3, proj: "flat", lon: 135, lat: -5, zoom: 2.6 },
  },
  {
    label: "Where were sea turtles recorded in the 2010s?",
    patch: { ...reset, layer: "eov:seaTurtles", indicator: "n", resMode: "manual", res: 3, proj: "flat", lon: -20, lat: 5, zoom: 1.4, decade: 2010 },
  },
  {
    label: "How diverse is the Caribbean, sampling effort aside?",
    patch: { ...reset, layer: "all", indicator: "es", resMode: "manual", res: 4, proj: "flat", lon: -75, lat: 16, zoom: 4.2 },
  },
];

/** the state a start view opens: the current one (theme, layout) with the view's parts set */
export function startState(st: AppState, v: StartView): AppState {
  return { ...st, ...v.patch };
}
