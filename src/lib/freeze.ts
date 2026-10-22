// the freeze banner (2026-10-22): obis-hex moves to the Ocean Metrics Atlas. The words, the session
// dismissal and the link live here so they are tested; App.svelte only draws them. Nothing here redirects:
// the map is src/lib/redirect.ts and it is not activated.

/** sessionStorage key: set once the banner is closed, so it stays closed for the session */
export const FREEZE_KEY = "om-freeze-dismissed";

export const FREEZE_TEXT =
  "OBIS hex is frozen. Its layers move to the OceanMetrics Atlas in build week 4 (2026-11-20 to 11-26), when this address redirects.";
export const FREEZE_LINK = "Open in the Atlas ↗";
/** the freeze paragraph of the About modal */
export const FREEZE_ABOUT =
  "Frozen since 2026-10-22: OBIS hex is moving to the Ocean Metrics Atlas (https://oceanmetrics.io/atlas/); bug fixes only.";

type Store = Pick<Storage, "getItem" | "setItem">;

/** the session's storage, or null where it throws (private windows, blocked site data, node) */
function session(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** has the banner been closed in this session? Without storage it shows (and cannot be remembered). */
export function freezeDismissed(store: Store | null = session()): boolean {
  try {
    return store?.getItem(FREEZE_KEY) === "1";
  } catch {
    return false;
  }
}

/** remember the close for the session; a storage that throws only means it comes back on reload */
export function dismissFreeze(store: Store | null = session()): void {
  try {
    store?.setItem(FREEZE_KEY, "1");
  } catch {
    /* ignore */
  }
}
