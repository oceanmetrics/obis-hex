// the page's keyboard shortcuts (Help ▾ → Keyboard lists the same map). A shortcut never fires while
// the visitor types (input, textarea, select, contenteditable) or holds Ctrl/Alt/Meta, and only Esc
// works while a modal or the tour is open (they handle their own keys).
import { CONTROL_TABS, type ControlTab } from "../state/url";

export type Shortcut =
  | { kind: "tour" }
  | { kind: "theme" }
  | { kind: "projection" }
  | { kind: "tab"; tab: ControlTab }
  | { kind: "zoom"; by: 1 | -1 }
  | { kind: "escape" };

export const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["?"], what: "take the tour" },
  { keys: ["t"], what: "light or dark theme" },
  { keys: ["g"], what: "globe or flat map" },
  { keys: ["1", "2", "3"], what: "Controls tabs: ① Metric (taxon, indicator), ② Place, ③ Share" },
  { keys: ["+", "−"], what: "zoom in, out" },
  { keys: ["Esc"], what: "close the open menu, dialog or tour" },
];

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** the event target's tag name and whether it is editable */
  targetTag?: string;
  targetEditable?: boolean;
}

export function shortcutFor(e: KeyLike, opts: { busy?: boolean } = {}): Shortcut | null {
  if (e.key === "Escape") return { kind: "escape" };
  if (opts.busy) return null;
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const tag = (e.targetTag ?? "").toUpperCase();
  if (e.targetEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  switch (e.key) {
    case "?":
      return { kind: "tour" };
    case "t":
    case "T":
      return { kind: "theme" };
    case "g":
    case "G":
      return { kind: "projection" };
    case "+":
    case "=":
      return { kind: "zoom", by: 1 };
    case "-":
    case "_":
      return { kind: "zoom", by: -1 };
  }
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= CONTROL_TABS.length) return { kind: "tab", tab: CONTROL_TABS[n - 1] };
  return null;
}
