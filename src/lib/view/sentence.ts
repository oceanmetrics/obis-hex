// the title sentence: what the map shows, in the pipeline order dataset → place → method, as
// parts the app renders as Chips (and as plain text for the PNG stamp and the figures log):
//
//   Seabirds (EOV), all years, worldwide, ~12,400 km² hexagons: ES(50)
//   (the OBIS snapshot and the resolution live in the footer: `releaseLine()`)
//   9,196 of 26,361 hexagons have ≥ 50 records
import { getHexagonAreaAvg } from "h3-js";
import { EOVS, INDICATORS, type Indicator, type LayerSel } from "../data/layers";
import { commonName } from "../data/taxa";
import { fmt } from "../format";

/** one bold, clickable word group and the plain qualifier after it, e.g. "Seabirds" + "(EOV)" */
export interface SentencePart {
  label: string;
  qual: string;
}

export interface SentenceParts {
  taxon: SentencePart;
  period: SentencePart;
  place: SentencePart;
  scale: SentencePart;
  indicator: SentencePart;
}

/** the average area of an H3 cell, rounded for reading: 3 significant digits from 1,000 km², whole
 * km² below (609,788 → "~610,000 km²", 12,393 → "~12,400 km²", 5.16 → "~5 km²"). */
export function hexAreaLabel(res: number): string {
  const a = getHexagonAreaAvg(res, "km2");
  const r = a >= 1000 ? Number(a.toPrecision(3)) : Math.max(1, Math.round(a));
  return `~${r.toLocaleString("en-US")} km²`;
}

/** the taxon chip: the common name first when there is one ("Birds" (class Aves)) */
export function taxonPart(sel: LayerSel, aphia?: { name: string; rank: string } | null): SentencePart {
  if (sel.kind === "all") return { label: "All taxa", qual: "" };
  if (sel.kind === "eov")
    return { label: EOVS.find((e) => e.id === sel.eov)?.label ?? sel.eov, qual: "(EOV)" };
  if (sel.kind === "aphia") {
    if (!aphia) return { label: `AphiaID ${sel.id}`, qual: "(WoRMS)" };
    const cn = commonName(aphia.name);
    return cn
      ? { label: cap(cn), qual: `(${aphia.rank.toLowerCase()} ${aphia.name}, WoRMS)` }
      : { label: aphia.name, qual: `(${aphia.rank.toLowerCase()}, WoRMS)` };
  }
  const cn = commonName(sel.taxon);
  return cn
    ? { label: cap(cn), qual: `(${sel.rank} ${sel.taxon})` }
    : { label: sel.taxon, qual: `(${sel.rank})` };
}

export function periodPart(decade: number | null): SentencePart {
  return { label: decade === null ? "all years" : `${decade}s`, qual: "" };
}

/** "worldwide" when the whole layer is loaded (one file, the counts cover the globe); "in view"
 * when only the parent partitions (or the live bbox) covering the map were loaded. */
export function placePart(inView: boolean, parts?: { loaded: number; total: number } | null): SentencePart {
  if (!inView) return { label: "worldwide", qual: "" };
  return {
    label: "in view",
    qual: parts && parts.total ? `(${fmt(parts.loaded)} of ${fmt(parts.total)} partitions)` : "",
  };
}

export function scalePart(res: number): SentencePart {
  return { label: `${hexAreaLabel(res)} hexagons`, qual: "" };
}

/** the resolution detail the sentence leaves out, for the footer: "res 3 (auto)" / "res 3 (fixed)" */
export function resNote(res: number, auto: boolean): string {
  return `res ${res} (${auto ? "auto" : "fixed"})`;
}

export function indicatorPart(ind: Indicator): SentencePart {
  return { label: INDICATORS.find((i) => i.id === ind)?.short ?? ind, qual: "" };
}

export function sentenceParts(o: {
  sel: LayerSel;
  aphia?: { name: string; rank: string } | null;
  decade: number | null;
  inView: boolean;
  parts?: { loaded: number; total: number } | null;
  res: number;
  indicator: Indicator;
}): SentenceParts {
  return {
    taxon: taxonPart(o.sel, o.aphia),
    period: periodPart(o.decade),
    place: placePart(o.inView, o.parts),
    scale: scalePart(o.res),
    indicator: indicatorPart(o.indicator),
  };
}

const join = (p: SentencePart) => (p.qual ? `${p.label} ${p.qual}` : p.label);

/** the sentence as one line of plain text */
export function sentenceText(s: SentenceParts): string {
  return `${join(s.taxon)}, ${join(s.period)}, ${join(s.place)}, ${join(s.scale)}: ${join(s.indicator)}`;
}

/** the second line's count: for ES(50), how many hexagons have a value (≥ 50 records), the
 * coverage caveat that must stay visible; for the other indicators, the hexagon count. */
export function coverageText(
  indicator: Indicator,
  v: { cells: number; valued: number } | null,
  esn = 50,
): string {
  if (!v) return "";
  if (indicator === "es")
    return `${fmt(v.valued)} of ${fmt(v.cells)} hexagons have ≥ ${esn} records`;
  if (v.valued !== v.cells) return `${fmt(v.valued)} of ${fmt(v.cells)} hexagons have a value`;
  return `${fmt(v.cells)} hexagons`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
