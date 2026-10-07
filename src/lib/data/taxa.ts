// the taxon picker: one list of every layer the release serves (all taxa, the 7 EOVs, the taxon
// groups by rank) plus the live WoRMS entry, with record counts from taxon_groups.parquet and
// common names for the groups people look for. The release has no vernacular names, so the
// common names are this short hand-made table; a taxon not in it shows its scientific name only.
import { EOVS, layerKey, type LayerSel } from "./layers";

/** scientific name → English common name (WoRMS names as they appear in taxon_groups.parquet) */
export const COMMON_NAMES: Record<string, string> = {
  // phyla
  Chordata: "chordates",
  Arthropoda: "arthropods",
  Mollusca: "molluscs",
  Annelida: "segmented worms",
  Echinodermata: "echinoderms",
  Cnidaria: "cnidarians",
  Foraminifera: "forams",
  Rhodophyta: "red algae",
  Porifera: "sponges",
  Chlorophyta: "green algae",
  Tracheophyta: "vascular plants",
  Bryozoa: "moss animals",
  Chaetognatha: "arrow worms",
  Ctenophora: "comb jellies",
  Nematoda: "roundworms",
  Nemertea: "ribbon worms",
  Platyhelminthes: "flatworms",
  Brachiopoda: "lamp shells",
  Cyanobacteria: "blue-green algae",
  Ochrophyta: "brown algae and kin",
  Myzozoa: "dinoflagellates and kin",
  // classes
  Teleostei: "bony fishes",
  Aves: "birds",
  Malacostraca: "crabs, shrimps and kin",
  Cephalopoda: "squids and octopuses",
  Mammalia: "mammals",
  Polychaeta: "bristle worms",
  Elasmobranchii: "sharks and rays",
  Holocephali: "chimaeras",
  Copepoda: "copepods",
  Bacillariophyceae: "diatoms",
  Phaeophyceae: "brown algae",
  Bivalvia: "clams and mussels",
  Dinophyceae: "dinoflagellates",
  Gastropoda: "snails and slugs",
  Hexacorallia: "stony corals and anemones",
  Octocorallia: "soft corals",
  Asteroidea: "sea stars",
  Echinoidea: "sea urchins",
  Florideophyceae: "red seaweeds",
  Chondrostei: "sturgeons",
  Ophiuroidea: "brittle stars",
  Demospongiae: "demosponges",
  Hydrozoa: "hydroids",
  Scyphozoa: "true jellyfish",
  Holothuroidea: "sea cucumbers",
  Crinoidea: "sea lilies",
  Magnoliopsida: "flowering plants",
  Gymnolaemata: "bryozoans",
  Ascidiacea: "sea squirts",
  Ulvophyceae: "green seaweeds",
  Coccolithophyceae: "coccolithophores",
  Thecostraca: "barnacles",
  Ostracoda: "seed shrimps",
  Branchiopoda: "water fleas",
  Pycnogonida: "sea spiders",
  Thaliacea: "salps",
  Appendicularia: "larvaceans",
  Reptilia: "reptiles",
  Polyplacophora: "chitons",
  Scaphopoda: "tusk shells",
  // orders
  Charadriiformes: "gulls, terns and auks",
  Gadiformes: "cods",
  Perciformes: "perch-like fishes",
  Decapoda: "crabs, shrimps and lobsters",
  Pleuronectiformes: "flatfishes",
  Clupeiformes: "herrings",
  Myopsida: "inshore squids",
  Calanoida: "calanoid copepods",
  Pelecaniformes: "pelicans and herons",
  Procellariiformes: "albatrosses and petrels",
  Carnivora: "seals, sea lions and otters",
  Salmoniformes: "salmons",
  Laminariales: "kelps",
  Cetartiodactyla: "whales and dolphins (and kin)",
  Scombriformes: "tunas and mackerels",
  Carcharhiniformes: "ground sharks",
  Anseriformes: "ducks and geese",
  Sphenisciformes: "penguins",
  Suliformes: "gannets and cormorants",
  Gaviiformes: "loons",
  Testudines: "turtles",
  Sirenia: "sea cows",
  Euphausiacea: "krill",
  Amphipoda: "amphipods",
  Isopoda: "isopods",
  Scleractinia: "stony corals",
  Alcyonacea: "soft corals",
  Actiniaria: "sea anemones",
  Octopoda: "octopuses",
  Lamniformes: "mackerel sharks",
  Myliobatiformes: "stingrays",
  Rajiformes: "skates",
  Squaliformes: "dogfish sharks",
  Alismatales: "seagrasses (and kin)",
  Fucales: "rockweeds",
  // WoRMS infraorder often searched live
  Cetacea: "whales and dolphins",
};

export function commonName(taxon: string): string | null {
  return COMMON_NAMES[taxon] ?? null;
}

export interface TaxonGroupRow {
  kind: string;
  rank: string;
  taxon: string;
  n: number;
}

/** a Picker row (shape of @marinebon/ui's PickerItem) */
export interface TaxonItem {
  id: string;
  label: string;
  group: string;
  count?: number;
  keywords?: string;
  disabled?: boolean;
}

const RANK_GROUP: Record<string, string> = {
  phylum: "Phyla",
  class: "Classes",
  order: "Orders",
  family: "Families",
};

/** the id of the Picker row that switches to the live WoRMS search */
export const APHIA_ITEM = "aphia:search";

/**
 * Every layer the release serves, as Picker rows grouped "All life" → "Essential Ocean Variables"
 * → Phyla → Classes → Orders → "Any taxon (WoRMS)", most records first within a group. Ids are
 * layer keys (`all`, `eov:fish`, `taxon:class:Aves`), so the picked id is the URL's `l=`.
 * Labels lead with the scientific name and carry the common name ("Aves — birds"); the common
 * name is also a search keyword.
 */
export function taxonItems(
  groups: TaxonGroupRow[],
  o: {
    hasEov?: boolean;
    hasTaxon?: boolean;
    hasAphia?: boolean;
    totalRecords?: number | null;
    /** the current live layer, listed under WoRMS so the picker shows it selected */
    aphia?: { id: number; name: string } | null;
  } = {},
): TaxonItem[] {
  const out: TaxonItem[] = [
    {
      id: "all",
      label: "All taxa",
      group: "All life",
      count: o.totalRecords ?? undefined,
      keywords: "everything all records",
    },
  ];
  const eovN = new Map(groups.filter((g) => g.kind === "eov").map((g) => [g.taxon, g.n]));
  const eovs = EOVS.map((e) => ({ e, n: eovN.get(e.id) }));
  eovs.sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  for (const { e, n } of eovs)
    out.push({
      id: layerKey({ kind: "eov", eov: e.id }),
      label: e.label,
      group: "Essential Ocean Variables",
      count: n,
      keywords: "eov",
      disabled: o.hasEov === false,
    });
  const ranks = [...new Set(groups.filter((g) => g.kind === "taxon").map((g) => g.rank))];
  const order = ["phylum", "class", "order", "family"];
  ranks.sort((a, b) => (order.indexOf(a) + 99 * +(order.indexOf(a) < 0)) - (order.indexOf(b) + 99 * +(order.indexOf(b) < 0)));
  for (const rank of ranks) {
    const rows = groups.filter((g) => g.kind === "taxon" && g.rank === rank).sort((a, b) => b.n - a.n);
    for (const g of rows) {
      const cn = commonName(g.taxon);
      out.push({
        id: layerKey({ kind: "taxon", rank: g.rank, taxon: g.taxon }),
        label: cn ? `${g.taxon} — ${cn}` : g.taxon,
        group: RANK_GROUP[rank] ?? rank,
        count: g.n,
        keywords: `${rank}${cn ? ` ${cn}` : ""}`,
        disabled: o.hasTaxon === false,
      });
    }
  }
  if (o.aphia)
    out.push({
      id: layerKey({ kind: "aphia", id: o.aphia.id }),
      label: o.aphia.name,
      group: "Any taxon (WoRMS, live)",
      keywords: "worms aphia",
    });
  out.push({
    id: APHIA_ITEM,
    label: "Search any WoRMS taxon…",
    group: "Any taxon (WoRMS, live)",
    keywords: "worms aphia species genus family search",
    disabled: o.hasAphia === false,
  });
  return out;
}

/** a log-scale bar width (0–1) for a record count against the largest count in the list */
export function logBar(n: number | undefined, max: number): number {
  if (!n || n <= 0 || !(max > 1)) return 0;
  return Math.min(1, Math.log10(n + 1) / Math.log10(max + 1));
}

/** the selection a picked id stands for (null for the WoRMS search row) */
export function isAphiaSearch(id: string): boolean {
  return id === APHIA_ITEM;
}

export type { LayerSel };
