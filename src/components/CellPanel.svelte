<script lang="ts" module>
  import type { Indicator } from "../lib/data/layers";
  export interface SelectedCell {
    url: string;
    h3: string;
    res: number;
    layer: string;
    period: string;
    values: Record<Indicator, number>;
  }
</script>

<script lang="ts">
  // the clicked cell's values.
  import { INDICATORS } from "../lib/data/layers";
  import { fmt } from "../lib/format";

  let {
    cell,
    indicator,
    onclose,
  }: { cell: SelectedCell; indicator: Indicator; onclose: () => void } = $props();
</script>

<section class="panel cell">
  <button class="close" onclick={onclose} aria-label="close">×</button>
  <div class="title">Cell <code>{cell.h3}</code></div>
  <div class="dim">res {cell.res} · {cell.layer} · {cell.period}</div>
  <table>
    <tbody>
      {#each INDICATORS as ind (ind.id)}
        <tr class:on={ind.id === indicator}><td>{ind.label}</td><td>{fmt(cell.values[ind.id])}</td></tr>
      {/each}
    </tbody>
  </table>
</section>
