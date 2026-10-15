<script lang="ts">
  // the species behind the selected hexagon's records (the h3t cell endpoint, fetched by App while the
  // Cell pane is open): the top ones in the pane, all of them with filter, sort and CSV when the pane is
  // expanded. A lazy chunk: CellPanel reaches it only by import(), with lib/cell/species.ts.
  import { Button, Notice } from "@marinebon/ui";
  import { wormsUrl } from "../lib/aphia/h3t";
  import {
    filterSpecies,
    MAX_ROWS,
    obisChecklistUrl,
    share,
    sortSpecies,
    speciesCsv,
    speciesCsvName,
    TOP_SPECIES,
    yearsText,
    type SpeciesSortKey,
    type SpeciesState,
  } from "../lib/cell/species";
  import { fmt } from "../lib/format";

  let {
    species,
    h3,
    layerKey,
    decade,
    release,
    expanded = false,
    onexpand,
  }: {
    species: SpeciesState;
    h3: string;
    layerKey: string;
    decade: number | null;
    release: string | null;
    expanded?: boolean;
    onexpand?: (v: boolean) => void;
  } = $props();

  let q = $state("");
  let by = $state<SpeciesSortKey>("records");
  let desc = $state(true);

  const list = $derived(species.status === "ok" ? species.list : null);
  const found = $derived(list ? filterSpecies(list.species, q) : []);
  const rows = $derived(
    !list ? [] : expanded ? sortSpecies(found, by, desc).slice(0, MAX_ROWS) : list.species.slice(0, TOP_SPECIES),
  );

  const sortBy = (k: SpeciesSortKey) => {
    if (k === by) desc = !desc;
    else {
      by = k;
      desc = k === "records" || k === "year_max";
    }
  };
  const arrow = (k: SpeciesSortKey) => (k === by ? (desc ? " ↓" : " ↑") : "");
  const ariaSort = (k: SpeciesSortKey) => (k === by ? (desc ? "descending" : "ascending") : "none");
  const pct = (x: number) => (x >= 0.001 ? `${(x * 100).toFixed(1)}%` : "<0.1%");

  function download() {
    if (!list) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([speciesCsv(list)], { type: "text/csv" }));
    a.download = speciesCsvName(list.h3, layerKey, decade, release);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
</script>

<section class="sp" class:wide={expanded} aria-label="species in this hexagon">
  <div class="sp-head">
    <span class="mbon-label">species</span>
    {#if list}<span class="dim">{fmt(list.sp)} species · {fmt(list.n)} records</span>{/if}
  </div>

  {#if species.status === "loading"}
    <p class="dim">Loading species…</p>
  {:else if species.status === "error"}
    <Notice kind="warn">
      {species.message}
      <a href={obisChecklistUrl(h3, decade)} target="_blank" rel="noopener">OBIS checklist for this hexagon</a>
      (live OBIS, so its counts differ)
    </Notice>
  {:else if list}
    {#if species.status === "ok" && species.note}<Notice kind="info">{species.note}</Notice>{/if}
    {#if expanded}
      <div class="tools">
        <input type="search" bind:value={q} placeholder="filter by name, class, family…" aria-label="filter species" />
        <Button variant="quiet" size="sm" onclick={download} title="every species, as CSV">CSV</Button>
      </div>
      {#if q || found.length > MAX_ROWS}
        <p class="dim">
          {fmt(found.length)} of {fmt(list.sp)} species{#if found.length > MAX_ROWS}; showing the first {MAX_ROWS} (the CSV has all){/if}
        </p>
      {/if}
    {/if}
    {#if list.sp === 0}
      <p class="dim">No species records in this hexagon for this taxon and period.</p>
    {:else}
      <div class="tbl">
        <table>
          {#if expanded}
            <thead>
              <tr>
                <th aria-sort={ariaSort("species")}><button type="button" onclick={() => sortBy("species")}>species{arrow("species")}</button></th>
                <th aria-sort={ariaSort("class")}><button type="button" onclick={() => sortBy("class")}>class{arrow("class")}</button></th>
                <th aria-sort={ariaSort("family")}><button type="button" onclick={() => sortBy("family")}>family{arrow("family")}</button></th>
                <th class="num" aria-sort={ariaSort("records")}><button type="button" onclick={() => sortBy("records")}>records{arrow("records")}</button></th>
                <th class="num">share</th>
                <th class="num" aria-sort={ariaSort("year_min")}><button type="button" onclick={() => sortBy("year_min")} title="first year with a record">first{arrow("year_min")}</button></th>
                <th class="num" aria-sort={ariaSort("year_max")}><button type="button" onclick={() => sortBy("year_max")} title="last year with a record">last{arrow("year_max")}</button></th>
              </tr>
            </thead>
          {:else}
            <colgroup><col /><col class="c-rec" /><col class="c-yrs" /></colgroup>
            <thead class="sr"><tr><th>species</th><th>records</th><th>years</th></tr></thead>
          {/if}
          <tbody>
            {#each rows as r (r.species)}
              <tr>
                <td class="nm" title={r.species}>
                  {#if r.aphiaid !== null}
                    <a href={wormsUrl(r.aphiaid)} target="_blank" rel="noopener"><i>{r.species}</i></a>
                  {:else}<i>{r.species}</i>{/if}
                </td>
                {#if expanded}
                  <td>{r.class ?? "—"}</td>
                  <td>{r.family ?? "—"}</td>
                  <td class="num">{fmt(r.records)}</td>
                  <td class="num">{pct(share(r, list.n))}</td>
                  <td class="num">{r.year_min ?? "—"}</td>
                  <td class="num">{r.year_max ?? "—"}</td>
                {:else}
                  <td class="num">{fmt(r.records)}</td>
                  <td class="num yrs" title="first and last year with a record">{yearsText(r.year_min, r.year_max)}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if !expanded && list.sp > 0}
      <Button variant="quiet" size="sm" onclick={() => onexpand?.(true)}
        title="every species with its class, family, share and years; filter, sort, CSV">
        {list.sp > TOP_SPECIES ? `All ${fmt(list.sp)} species` : "Table and CSV"} ▸
      </Button>
    {/if}
  {/if}
</section>

<style>
  .sp { display: flex; flex-direction: column; gap: var(--space-2); }
  p { margin: 0; }
  .dim { color: var(--text-muted); font: var(--type-small); }
  .sp-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
  .tools { display: flex; gap: var(--space-2); align-items: center; }
  .tools input {
    flex: 1; min-width: 0; box-sizing: border-box; padding: 0.4em 0.75em; font: var(--type-small); color: var(--text-strong);
    background: var(--control-bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font: var(--text-xs) / 1.3 var(--font-sans); color: var(--text-body); }
  td { padding: 2px var(--space-1); border-top: 1px solid var(--border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .yrs { font-family: var(--font-mono); }
  .c-rec { width: 3.6rem; }
  .c-yrs { width: 4.8rem; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* expanded: every species, the pane fills the map; the table stays readable on a wide screen */
  .wide { max-width: 64rem; }
  .wide .tbl { overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .wide table { table-layout: auto; }
  .wide th { position: sticky; top: 0; background: var(--bg-surface); text-align: left; font-weight: var(--fw-semibold); }
  .wide th.num { text-align: right; }
  .wide th button { all: unset; cursor: pointer; padding: 2px var(--space-1); color: var(--text-heading); }
  .wide th button:focus-visible { outline: 2px solid var(--link); outline-offset: 1px; }
  .wide .nm { max-width: 22rem; }
</style>
