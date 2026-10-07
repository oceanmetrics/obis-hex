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
  // the clicked hexagon's values, every indicator, with where it sits in the loaded hexagons.
  import { INDICATORS } from "../lib/data/layers";
  import { fmt } from "../lib/format";
  import { hexAreaLabel } from "../lib/view/sentence";

  let {
    cell,
    indicator,
    p50,
  }: { cell: SelectedCell | null; indicator: Indicator; p50: number | null } = $props();
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
  </div>
{:else}
  <p class="dim">Click a hexagon on the map to see all five indicators for it.</p>
{/if}

<style>
  .cell { display: flex; flex-direction: column; gap: var(--space-1); }
  p { margin: 0; }
  .mono { font: var(--fw-semibold) var(--text-sm) / 1.3 var(--font-mono); color: var(--text-strong); }
  .dim { color: var(--text-muted); font: var(--type-small); }
  table { border-collapse: collapse; width: 100%; margin: var(--space-1) 0; }
  td { padding: 2px 4px; font: var(--type-small); }
  td:last-child { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  tr.on td { font-weight: var(--fw-semibold); color: var(--text-strong); background: var(--selected-bg); }
</style>
