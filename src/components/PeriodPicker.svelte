<script lang="ts">
  // the period: all years or one decade. Decades exist for all taxa and the EOVs at res ≤ 5 in the
  // release, and at any res for a live WoRMS layer; the reason is stated once when they are off.
  import { DECADES, type AppState } from "../lib/state/url";
  import { Button } from "@marinebon/ui";

  let {
    st = $bindable(),
    allowed,
    reason,
    onpicked,
  }: { st: AppState; allowed: boolean; reason: string; onpicked?: () => void } = $props();

  function set(d: number | null) {
    st.decade = d;
    st.cell = null;
    onpicked?.();
  }
</script>

<div class="period" role="group" aria-label="period">
  <Button variant="quiet" size="sm" pressed={st.decade === null} onclick={() => set(null)}>all years</Button>
  {#each DECADES as d (d)}
    <Button variant="quiet" size="sm" pressed={st.decade === d} disabled={!allowed} onclick={() => set(d)}>{d}s</Button>
  {/each}
</div>
{#if !allowed && reason}<p class="hint">{reason}</p>{/if}

<style>
  .period { display: flex; flex-wrap: wrap; gap: var(--space-1); }
</style>
