<script lang="ts" module>
  import type { Indicator } from "../lib/data/layers";
  export interface SelectedCell {
    h3: string;
    res: number;
    layer: string;
    period: string;
    values: Record<Indicator, number>;
  }
</script>

<script lang="ts">
  // the clicked hexagon's values, every indicator, with where it sits in the loaded hexagons; then the
  // species behind its records (CellSpecies, a lazy chunk loaded once the pane first has a list to show).
  import type { Component } from "svelte";
  import type { SpeciesState } from "../lib/cell/species";
  import { INDICATORS } from "../lib/data/layers";
  import { fmt } from "../lib/format";
  import { hexAreaLabel } from "../lib/view/sentence";

  let {
    cell,
    indicator,
    p50,
    species = { status: "idle" },
    layerKey = "all",
    decade = null,
    release = null,
    expanded = false,
    onexpand,
  }: {
    cell: SelectedCell | null;
    indicator: Indicator;
    p50: number | null;
    species?: SpeciesState;
    layerKey?: string;
    decade?: number | null;
    release?: string | null;
    expanded?: boolean;
    onexpand?: (v: boolean) => void;
  } = $props();

  let Species = $state.raw<Component<any> | null>(null);
  $effect(() => {
    if (species.status !== "idle" && !Species)
      import("./CellSpecies.svelte").then((m) => (Species = m.default)).catch(() => {});
  });
</script>

{#if cell}
  <div class="cell">
    <p class="mono">{cell.h3}</p>
    <p class="dim">res {cell.res} ({hexAreaLabel(cell.res)}) · {cell.layer} · {cell.period}</p>
    <table>
      <tbody>
        {#each INDICATORS as ind (ind.id)}
          <tr class:on={ind.id === indicator}><td>{ind.short}</td><td>{fmt(cell.values[ind.id])}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if p50 !== null}<p class="dim">median of the loaded hexagons: {fmt(p50)}</p>{/if}
    {#if Species && species.status !== "idle"}
      <div class="sp" data-tour="cell-species">
        <Species {species} h3={cell.h3} {layerKey} {decade} {release} {expanded} {onexpand} />
      </div>
    {/if}
  </div>
{:else}
  <p class="dim">Click a hexagon on the map to see all five indicators and the species recorded in it.</p>
{/if}

<style>
  .cell { display: flex; flex-direction: column; gap: var(--space-1); }
  p { margin: 0; }
  .mono { font: var(--fw-semibold) var(--text-sm) / 1.3 var(--font-mono); color: var(--text-strong); }
  .dim { color: var(--text-muted); font: var(--type-small); }
  table { border-collapse: collapse; width: 100%; max-width: 24rem; margin: var(--space-1) 0; }
  td { padding: 2px 4px; font: var(--type-small); }
  td:last-child { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  tr.on td { font-weight: var(--fw-semibold); color: var(--text-strong); background: var(--selected-bg); }
  .sp { margin-top: var(--space-2); }
</style>
