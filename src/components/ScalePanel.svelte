<script lang="ts">
  // hexagon size: auto from the zoom (the Shiny app's breaks) or a pinned H3 resolution.
  import { Slider, Toggle } from "@marinebon/ui";
  import { hexAreaLabel } from "../lib/view/sentence";
  import type { AppState } from "../lib/state/url";

  let {
    st = $bindable(),
    autoRes,
    res,
    resMax,
  }: { st: AppState; autoRes: number; res: number; resMax: number } = $props();

  let auto = $state(true);
  $effect(() => {
    auto = st.resMode === "auto";
  });
  let value = $state(1);
  $effect(() => {
    value = st.resMode === "auto" ? autoRes : Math.min(st.res, resMax);
  });
</script>

<div class="scale">
  <Toggle
    bind:checked={auto}
    label="auto from zoom"
    hint={`now res ${res}, ${hexAreaLabel(res)} per hexagon`}
    onchange={(on: boolean) => {
      st.resMode = on ? "auto" : "manual";
      if (!on) st.res = autoRes;
      st.cell = null;
    }}
  />
  <Slider
    label="H3 resolution"
    bind:value
    min={1}
    max={resMax}
    step={1}
    ticks={Array.from({ length: resMax }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
    format={(v) => `res ${v} · ${hexAreaLabel(v)}`}
    oninput={(v: number) => {
      st.res = v;
      st.resMode = "manual";
      st.cell = null;
    }}
  />
</div>

<style>
  .scale { display: flex; flex-direction: column; gap: var(--space-3); }
</style>
