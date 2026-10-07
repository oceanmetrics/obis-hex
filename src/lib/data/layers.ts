// what can be mapped: indicators, and the layer selection (all taxa, an EOV, a taxon group).

export type Indicator = "n" | "sp" | "shannon" | "simpson" | "es";

export const INDICATORS: { id: Indicator; label: string; short: string }[] = [
  { id: "es", label: "ES(50) — expected species per 50 records", short: "ES(50)" },
  { id: "sp", label: "Species richness", short: "Richness" },
  { id: "shannon", label: "Shannon diversity (H′)", short: "Shannon" },
  { id: "simpson", label: "Simpson index (Σp²)", short: "Simpson" },
  { id: "n", label: "Number of records", short: "Records" },
];

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
  | { kind: "taxon"; rank: string; taxon: string };

/** the release's manifest layers (files.parquet `layer`, stats.parquet `layer`). */
export type ManifestLayer = "all" | "eov" | "taxon" | "decade_all" | "decade_eov";

/** `all` · `eov:fish` · `taxon:class:Aves` — the layer's id in the URL (taxon percent-encoded). */
export function layerKey(sel: LayerSel): string {
  if (sel.kind === "all") return "all";
  if (sel.kind === "eov") return `eov:${sel.eov}`;
  return `taxon:${encodeURIComponent(sel.rank)}:${encodeURIComponent(sel.taxon)}`;
}

export function parseLayerKey(key: string | null | undefined): LayerSel | null {
  if (!key) return null;
  if (key === "all") return { kind: "all" };
  const parts = key.split(":");
  try {
    if (parts[0] === "eov" && parts.length === 2 && EOVS.some((e) => e.id === parts[1]))
      return { kind: "eov", eov: parts[1] };
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
 * (taxon groups have no decade partitions). */
export function manifestLayer(sel: LayerSel, decade: number | null): ManifestLayer | null {
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
  return `${sel.taxon} (${sel.rank})`;
}
