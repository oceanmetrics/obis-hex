// the Cite block of the Share tab: OBIS (the data), obisindicators (the indicators) and the
// release the view was computed from, plus the permalink.
export interface CiteInput {
  release?: string | null;
  snapshot?: string | null;
  obisindicators?: string | null;
  appVersion: string;
  url: string;
}

export function citeText(c: CiteInput): string {
  const year = (c.snapshot ?? "").slice(0, 4) || "2026";
  const lines = [
    `OBIS (${year}). Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org${c.snapshot ? ` (snapshot ${c.snapshot})` : ""}.`,
    `Indicators: obisindicators${c.obisindicators ? ` ${c.obisindicators}` : ""}, https://github.com/marinebon/obisindicators${c.release ? `; H3 release ${c.release}` : ""}.`,
    `Map: OBIS hex v${c.appVersion} (Ocean Metrics for MBON), ${c.url}`,
  ];
  return lines.join("\n");
}
