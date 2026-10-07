// what can be mapped: indicators, and the layer selection (all taxa, an EOV, a taxon group from
// the release, or any WoRMS AphiaID subtree served live by the h3t subtree endpoint).

export type Indicator = "n" | "sp" | "shannon" | "simpson" | "es";

export const INDICATORS: { id: Indicator; label: string; short: string }[] = [
  { id: "es", label: "ES(50) — expected species per 50 records", short: "ES(50)" },
  { id: "sp", label: "Species richness", short: "Richness" },
  { id: "shannon", label: "Shannon diversity (H′)", short: "Shannon" },
  { id: "simpson", label: "Simpson index (Σp²)", short: "Simpson" },
  { id: "n", label: "Number of records", short: "Records" },
];

/** one line of meaning per indicator (the Indicator tab and chip) */
export const INDICATOR_HELP: Record<Indicator, string> = {
  es: "Hurlbert's expected number of species in 50 records drawn at random; comparable across effort, blank where a hexagon has fewer than 50 records.",
  sp: "Distinct species recorded in the hexagon; grows with sampling effort.",
  shannon: "H′ = −Σ pᵢ ln pᵢ over species: richness and evenness together.",
  simpson: "Σ pᵢ², the chance two records are the same species (lower = more diverse).",
  n: "OBIS occurrence records in the hexagon: where sampling happened.",
};

export function isIndicator(x: unknown): x is Indicator {
  return INDICATORS.some((i) => i.id === x);
}

export function indicatorLabel(id: Indicator): string {
  return INDICATORS.find((i) => i.id === id)?.label ?? id;
}

/** the 7 Essential Ocean Variables, keyed as in obisindicators::obis_eov_seeds() (and the release's
 * eov=<key> partitions). */
export const EOVS: { id: string; label: string }[] = [
  { id: "fish", label: "Fish" },
  { id: "hardCorals", label: "Hard corals" },
  { id: "mangroves", label: "Mangroves" },
  { id: "marineMammals", label: "Marine mammals" },
  { id: "seabirds", label: "Seabirds" },
  { id: "seagrasses", label: "Seagrasses" },
  { id: "seaTurtles", label: "Sea turtles" },
];

export type LayerSel =
  | { kind: "all" }
  | { kind: "eov"; eov: string }
  | { kind: "taxon"; rank: string; taxon: string }
  /** children of a WoRMS AphiaID (any rank), from the live subtree endpoint, not the release */
  | { kind: "aphia"; id: number };

/** the release's manifest layers (files.parquet `layer`, stats.parquet `layer`). */
export type ManifestLayer = "all" | "eov" | "taxon" | "decade_all" | "decade_eov";

/** `all` · `eov:fish` · `taxon:class:Aves` · `aphia:137092` — the layer's id in the URL (taxon
 * percent-encoded). */
export function layerKey(sel: LayerSel): string {
  if (sel.kind === "all") return "all";
  if (sel.kind === "eov") return `eov:${sel.eov}`;
  if (sel.kind === "aphia") return `aphia:${sel.id}`;
  return `taxon:${encodeURIComponent(sel.rank)}:${encodeURIComponent(sel.taxon)}`;
}

export function parseLayerKey(key: string | null | undefined): LayerSel | null {
  if (!key) return null;
  if (key === "all") return { kind: "all" };
  const parts = key.split(":");
  try {
    if (parts[0] === "eov" && parts.length === 2 && EOVS.some((e) => e.id === parts[1]))
      return { kind: "eov", eov: parts[1] };
    if (parts[0] === "aphia" && parts.length === 2 && /^[1-9][0-9]{0,9}$/.test(parts[1]))
      return { kind: "aphia", id: Number(parts[1]) };
    if (parts[0] === "taxon" && parts.length === 3 && parts[1] && parts[2])
      return {
        kind: "taxon",
        rank: decodeURIComponent(parts[1]),
        taxon: decodeURIComponent(parts[2]),
      };
  } catch {
    return null; // malformed percent-encoding
  }
  return null;
}

/** which manifest layer serves a selection and period; null when the release has no such layer
 * (taxon groups have no decade partitions; AphiaID subtrees are never in the release). */
export function manifestLayer(sel: LayerSel, decade: number | null): ManifestLayer | null {
  if (sel.kind === "aphia") return null;
  if (decade === null) return sel.kind;
  if (sel.kind === "all") return "decade_all";
  if (sel.kind === "eov") return "decade_eov";
  return null;
}

/** the `key` / `rank` columns of stats.parquet for a selection. */
export function statsKey(sel: LayerSel): { key: string; rank: string } {
  if (sel.kind === "eov") return { key: sel.eov, rank: "" };
  if (sel.kind === "taxon") return { key: sel.taxon, rank: sel.rank };
  return { key: "", rank: "" };
}

export function layerLabel(sel: LayerSel): string {
  if (sel.kind === "all") return "All taxa";
  if (sel.kind === "eov") return `EOV: ${EOVS.find((e) => e.id === sel.eov)?.label ?? sel.eov}`;
  if (sel.kind === "aphia") return `AphiaID ${sel.id}`;
  return `${sel.taxon} (${sel.rank})`;
}
