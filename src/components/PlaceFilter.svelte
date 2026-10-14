<script lang="ts">
  // the place filter and the per-place view (0.10.0; CalCOFI explore's Area filter and Regions lens,
  // on H3): "only hexagons in" everywhere, the outlined place, or every place of its collection; "view
  // as" hexagons or places; and, viewing places, one row per place (hexagons, area-weighted records,
  // the area-weighted mean of the hexagons' values) with a CSV. A row's box adds it to or takes it out
  // of the filter's set; a row's name outlines the place and fits the map to it. Lazy (PlacePanel).
  import { Button } from "@marinebon/ui";
  import { INDICATORS, type Indicator } from "../lib/data/layers";
  import { fmt } from "../lib/format";
  import { placeValue, summaryCsv, type PlaceStat } from "../lib/places/membership";
  import type { PlaceLayer, PlaceRow } from "../lib/places/index";
  import type { PlaceFilter } from "../lib/state/url";

  let {
    place = null,
    layers = [],
    filter = null,
    view = "hex",
    summary = null,
    status = "",
    onfilter,
    onview,
    onrow,
  }: {
    /** the outlined place (`pl=`), offered as the filter */
    place?: PlaceRow | null;
    layers?: PlaceLayer[];
    filter?: PlaceFilter | null;
    view?: "hex" | "places";
    /** per-place numbers over the loaded hexagons (viewing places) */
    summary?: { rows: PlaceStat[]; names: Map<string, string>; indicator: Indicator; res: number } | null;
    /** a line on the filter's state (loading, no membership, …) */
    status?: string;
    onfilter: (f: PlaceFilter | null) => void;
    onview: (v: "hex" | "places") => void;
    onrow: (coll: string, place_id: string) => void;
  } = $props();

  const title = (slug: string) => layers.find((l) => l.slug === slug)?.title ?? slug;
  const placeOn = $derived(!!(filter && place && filter.coll === place.collection && filter.ids?.length === 1 && filter.ids[0] === place.place_id));
  const collOn = $derived(!!filter && !filter.ids);
  const coll = $derived(filter?.coll ?? place?.collection ?? null);
  const short = $derived(summary ? (INDICATORS.find((i) => i.id === summary.indicator)?.short ?? summary.indicator) : "");

  type Key = "name" | "cells" | "records" | "value";
  let by = $state<Key>("value");
  let desc = $state(true);
  const sorted = $derived.by(() => {
    if (!summary) return [];
    const ind = summary.indicator;
    const k = (r: PlaceStat): number | string =>
      by === "name" ? (summary.names.get(r.place_id) ?? r.place_id) : by === "cells" ? r.cells : by === "records" ? r.records : placeValue(r, ind);
    return [...summary.rows].sort((a, b) => {
      const x = k(a), y = k(b);
      if (typeof x === "number" && Number.isNaN(x)) return 1;
      if (typeof y === "number" && Number.isNaN(y)) return -1;
      const c = typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y));
      return desc ? -c : c;
    });
  });
  const sortBy = (k: Key) => {
    if (k === by) desc = !desc;
    else {
      by = k;
      desc = k !== "name";
    }
  };
  const arrow = (k: Key) => (k === by ? (desc ? " ↓" : " ↑") : "");

  // a row's box: in the set (or in "all") → out; out → in; an empty set is no filter at all
  function toggle(id: string) {
    if (!filter || !summary) return;
    const cur = new Set(filter.ids ?? summary.rows.map((r) => r.place_id));
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    onfilter(cur.size ? { coll: filter.coll, ids: [...cur] } : null);
  }
  const inSet = (id: string) => !filter?.ids || filter.ids.includes(id);

  function download() {
    if (!summary || !filter) return;
    const csv = summaryCsv(sorted, summary.names, summary.indicator, filter.coll, summary.res);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `obis-hex_${filter.coll}_${summary.indicator}_res${summary.res}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
</script>

<div class="pf" data-tour="place-filter">
  <div>
    <span class="mbon-label">only hexagons in</span>
    <div class="seg" role="group" aria-label="only hexagons in">
      <Button variant="quiet" size="sm" pressed={!filter} onclick={() => onfilter(null)} title="every hexagon, wherever it is">everywhere</Button>
      <Button variant="quiet" size="sm" pressed={placeOn} disabled={!place}
        title={place ? `only the hexagons that overlap ${place.name} (≥ 1% of the hexagon, or of the place)` : "pick a place above first"}
        onclick={() => place && onfilter({ coll: place.collection, ids: [place.place_id] })}>this place</Button>
      <Button variant="quiet" size="sm" pressed={collOn} disabled={!coll}
        title={coll ? `only the hexagons inside any place of ${title(coll)}` : "pick a place above first"}
        onclick={() => coll && onfilter({ coll, ids: null })}>all of its collection</Button>
    </div>
    {#if filter}
      <p class="hint">
        {#if filter.ids === null}every place of {title(filter.coll)}{:else if filter.ids.length === 1}{summary?.names.get(filter.ids[0]) ?? filter.ids[0]} ({title(filter.coll)}){:else}{filter.ids.length} places of {title(filter.coll)}{/if}
        {#if status}· {status}{/if}
      </p>
    {:else if status}
      <p class="hint">{status}</p>
    {/if}
  </div>
  <div>
    <span class="mbon-label">view as</span>
    <div class="seg" role="group" aria-label="view as">
      <Button variant="quiet" size="sm" pressed={view === "hex" || !filter} onclick={() => onview("hex")}>hexagons</Button>
      <Button variant="quiet" size="sm" pressed={view === "places" && !!filter} disabled={!filter}
        title={filter ? "one colour and one table row per place" : "filter to some places first"} onclick={() => onview("places")}>places</Button>
    </div>
  </div>
  {#if view === "places" && filter && summary}
    <div class="sum">
      <div class="sum-head">
        <span class="hint">{fmt(summary.rows.length)} places with hexagons loaded</span>
        <Button variant="quiet" size="sm" onclick={download} title="the table as CSV, one row per place">CSV</Button>
      </div>
      <div class="tbl">
        <table>
          <thead>
            <tr>
              <th></th>
              <th><button type="button" onclick={() => sortBy("name")}>place{arrow("name")}</button></th>
              <th class="num"><button type="button" onclick={() => sortBy("cells")} title="hexagons with data that overlap the place">hex{arrow("cells")}</button></th>
              <th class="num"><button type="button" onclick={() => sortBy("records")} title="Σ records × share of the hexagon inside the place">records{arrow("records")}</button></th>
              {#if summary.indicator !== "n"}
                <th class="num"><button type="button" onclick={() => sortBy("value")} title="the area-weighted mean of the hexagons' {short}">{short}{arrow("value")}</button></th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each sorted as r (r.place_id)}
              <tr>
                <td><input type="checkbox" checked={inSet(r.place_id)} aria-label="keep {summary.names.get(r.place_id) ?? r.place_id} in the filter" onchange={() => toggle(r.place_id)} /></td>
                <td class="nm"><button type="button" class="link" title={r.place_id} onclick={() => filter && onrow(filter.coll, r.place_id)}>{summary.names.get(r.place_id) ?? r.place_id}</button></td>
                <td class="num">{fmt(r.cells)}</td>
                <td class="num">{fmt(Math.round(r.records))}</td>
                {#if summary.indicator !== "n"}<td class="num">{fmt(r.mean)}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="hint">
        Records add up: a place's records are Σ records × the share of each hexagon inside it.
        {#if summary.indicator !== "n"}{short} does not add up across hexagons, so a place's {short} here is the area-weighted mean of its hexagons' values, a statistic of the hexagons, not the place's own {short}.{/if}
      </p>
    </div>
  {/if}
</div>

<style>
  .pf { display: flex; flex-direction: column; gap: var(--space-3); }
  .seg { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
  .hint { margin: var(--space-1) 0 0; font: var(--text-xs) / 1.4 var(--font-sans); color: var(--text-body); }
  .sum { display: flex; flex-direction: column; gap: var(--space-1); }
  .sum-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .tbl { max-height: 16rem; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  table { width: 100%; border-collapse: collapse; font: var(--text-xs) / 1.3 var(--font-sans); color: var(--text-body); }
  th { position: sticky; top: 0; background: var(--bg-surface); text-align: left; font-weight: var(--fw-semibold); }
  th button { all: unset; cursor: pointer; padding: 2px var(--space-1); color: var(--text-heading); }
  td { padding: 2px var(--space-1); border-top: 1px solid var(--border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nm { max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .link { all: unset; cursor: pointer; color: var(--link); }
  .link:hover { text-decoration: underline; }
</style>
