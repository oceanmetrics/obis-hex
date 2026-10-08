// Help ▾ → Data sources and attribution (also `?modal=sources`): one row per source, with its
// citation, licence and DOI where it has one.
export interface Source {
  name: string;
  href: string;
  role: string;
  citation?: string;
  licence?: string;
  doi?: string;
}

export function sources(o: { snapshot?: string | null; release?: string | null; year: string }): Source[] {
  return [
    {
      name: "OBIS",
      href: "https://obis.org",
      role: `The occurrence records${o.snapshot ? ` (full snapshot ${o.snapshot})` : ""}, aggregated to H3 hexagons in release ${o.release ?? "…"}.`,
      citation: `OBIS (${o.year}) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org`,
      licence: "CC0, CC BY or CC BY-NC, per dataset (cite the datasets you use: manual.obis.org/citing.html)",
    },
    {
      name: "WoRMS",
      href: "https://www.marinespecies.org",
      role: "The taxonomy behind the taxon groups, the EOVs and the live Any taxon (WoRMS) layer.",
      citation: `WoRMS Editorial Board (${o.year}). World Register of Marine Species. https://www.marinespecies.org`,
      licence: "CC BY 4.0",
      doi: "10.14284/170",
    },
    {
      name: "IOOS Marine Life Data Network: EOV definitions",
      href: "https://github.com/ioos/marine_life_data_network/tree/main/eov_taxonomy",
      role: "Which WoRMS taxa make up each biological Essential Ocean Variable (every descendant of the root AphiaIDs is included).",
    },
    {
      name: "CARTO basemaps",
      href: "https://carto.com/attributions",
      role: "Dark Matter and Positron basemaps.",
      citation: "© CARTO, © OpenStreetMap contributors",
      licence: "OpenStreetMap data: ODbL",
    },
    {
      name: "Software",
      href: "https://github.com/oceanmetrics/obis-hex",
      role: "H3 (Uber, Apache-2.0) hexagons; deck.gl (MIT) and MapLibre GL (BSD-3-Clause) draw them; DuckDB-WASM (MIT) reads the Parquet in your browser; obisindicators (MIT) computes the indicators.",
    },
  ];
}
