// "Cite this data" (④ Share and the About modal): the release citation (this map, the H3 release,
// the OBIS snapshot it was computed from, the obisindicators version, the app version and the view's
// link), then OBIS's own citation line as the OBIS manual asks (manual.obis.org/citing.html).
export interface CiteInput {
  release?: string | null;
  /** the release's `built_at` (ISO UTC); the citation states its date */
  builtAt?: string | null;
  snapshot?: string | null;
  obisindicators?: string | null;
  appVersion: string;
  url: string;
}

/** the UTC calendar date (YYYY-MM-DD) of the release's `built_at`, or null when absent/malformed */
export function dataDateText(release: { built_at?: unknown } | null | undefined): string | null {
  const b = release?.built_at;
  if (typeof b !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(b.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** the year a citation carries: the OBIS snapshot's, else the given fallback */
export function citeYear(snapshot: string | null | undefined, fallback = "2026"): string {
  const y = (snapshot ?? "").slice(0, 4);
  return /^\d{4}$/.test(y) ? y : fallback;
}

/** OBIS's recommended citation for the database as a whole */
export function obisCitation(year: string): string {
  return `OBIS (${year}) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org`;
}

/** the release citation: this app, the release and its inputs, and the view's link */
export function releaseCitation(c: CiteInput): string {
  const year = citeYear(c.snapshot);
  const inputs = [
    c.snapshot ? `OBIS snapshot ${c.snapshot}` : "",
    `indicators by obisindicators${c.obisindicators ? ` ${c.obisindicators}` : ""} (https://github.com/marinebon/obisindicators)`,
  ].filter(Boolean);
  return (
    `Ocean Metrics for MBON (${year}). OBIS hex v${c.appVersion}: OBIS biodiversity indicators on H3 hexagons` +
    `${c.release ? `, release ${c.release}` : ""}${c.builtAt ? `, data built ${c.builtAt}` : ""} (${inputs.join("; ")}). ${c.url}`
  );
}

/** the full "Cite this data" text: the release citation, a blank line, OBIS's own line */
export function citeText(c: CiteInput): string {
  return `${releaseCitation(c)}\n\n${obisCitation(citeYear(c.snapshot))}`;
}
