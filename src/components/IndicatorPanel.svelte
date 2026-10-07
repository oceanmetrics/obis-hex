<script lang="ts">
  // ③ Indicator: which column of the loaded hexagons to colour by (switching never refetches);
  // under More options the colour ramp domain, the fill opacity and the basemap labels.
  import { Button, Slider, Toggle } from "@marinebon/ui";
  import { INDICATORS, INDICATOR_HELP } from "../lib/data/layers";
  import type { AppState } from "../lib/state/url";

  let {
    st = $bindable(),
    live,
    more = true,
    onpicked,
  }: { st: AppState; live: boolean; more?: boolean; onpicked?: () => void } = $props();

  let opacity = $state(0.85);
  $effect(() => {
    opacity = st.opacity;
  });
  let labels = $state(true);
  $effect(() => {
    labels = st.labels;
  });
</script>

<div class="ind" role="radiogroup" aria-label="indicator">
  {#each INDICATORS as ind (ind.id)}
    <button
      type="button"
      role="radio"
      aria-checked={st.indicator === ind.id}
      class="opt"
      onclick={() => {
        st.indicator = ind.id;
        onpicked?.();
      }}
    >
      <span class="name">{ind.label}</span>
      {#if st.indicator === ind.id}<span class="help">{INDICATOR_HELP[ind.id]}</span>{/if}
    </button>
  {/each}
</div>

{#if more}
  <details class="more">
    <summary>More options</summary>
    <div class="more-body">
      <div>
        <span class="mbon-label">colour ramp domain</span>
        <div class="seg" role="group" aria-label="colour ramp domain">
          <Button variant="quiet" size="sm" pressed={st.domain === "release" && !live} disabled={live}
            title="p02–p98 of this layer, period and resolution across the whole release"
            onclick={() => (st.domain = "release")}>whole release</Button>
          <Button variant="quiet" size="sm" pressed={st.domain === "view" || live}
            title="p02–p98 of the hexagons loaded for this view"
            onclick={() => (st.domain = "view")}>loaded hexagons</Button>
        </div>
        {#if live}<p class="hint">A live WoRMS layer has no release stats: the ramp spans the loaded hexagons.</p>{/if}
      </div>
      <Slider label="fill opacity" bind:value={opacity} min={0} max={1} step={0.05} buttons={false}
        format={(v) => `${Math.round(v * 100)}%`} oninput={(v: number) => (st.opacity = v)} />
      <Toggle bind:checked={labels} label="basemap labels" hint="place names over the hexagons"
        onchange={(on: boolean) => (st.labels = on)} />
    </div>
  </details>
{/if}

<style>
  .ind { display: flex; flex-direction: column; gap: 2px; }
  .opt {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
    padding: 0.45em var(--space-2); border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-heading); font: var(--type-small); cursor: pointer;
  }
  .opt:hover { background: var(--control-hover); }
  .opt[aria-checked="true"] { background: var(--selected-bg); color: var(--text-strong); }
  .opt[aria-checked="true"] .name { font-weight: var(--fw-semibold); }
  .help { font: var(--text-xs) / 1.4 var(--font-sans); color: var(--text-body); }
  .more { margin-top: var(--space-3); }
  .more summary { cursor: pointer; font: var(--type-small); color: var(--link); }
  .more-body { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-3); }
  .seg { display: flex; gap: var(--space-1); margin-top: var(--space-1); }
</style>
