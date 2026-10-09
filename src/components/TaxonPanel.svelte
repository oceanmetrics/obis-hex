<script lang="ts">
  // ① Metric, Taxon sub-tab: one Picker of every layer (All taxa, the EOVs, taxon groups by rank) with record
  // counts on a log bar, and the live WoRMS search. Shown in the Controls tab and the taxon Chip.
  import { Picker } from "@marinebon/ui";
  import { parseLayerKey, layerKey, type LayerSel } from "../lib/data/layers";
  import { isAphiaSearch, logBar, type TaxonItem } from "../lib/data/taxa";
  import { wormsUrl, type TaxonInfo } from "../lib/aphia/h3t";
  import { fmt } from "../lib/format";
  import type { AppState } from "../lib/state/url";
  import AphiaSearch from "./AphiaSearch.svelte";

  let {
    st = $bindable(),
    items,
    h3tBase,
    h3tHealth,
    aphiaInfo,
    aphiaAccepted,
    maxHeight = "16rem",
    fill = false,
    onpicked,
  }: {
    st: AppState;
    items: TaxonItem[];
    h3tBase: string;
    h3tHealth: "probing" | "ok" | "down";
    aphiaInfo: TaxonInfo | null;
    aphiaAccepted: TaxonInfo | null;
    maxHeight?: string;
    /** in the fill Controls the list takes the pane's height (the kit's Picker `fill`) */
    fill?: boolean;
    /** called after a layer is chosen (the Chip closes its popover) */
    onpicked?: () => void;
  } = $props();

  const sel: LayerSel = $derived(parseLayerKey(st.layer) ?? { kind: "all" });
  const maxCount = $derived(Math.max(1, ...items.map((i) => i.count ?? 0)));
  let searching = $state(false);
  const showSearch = $derived(searching || sel.kind === "aphia");
  let value = $state<string | null>(null);
  $effect(() => {
    value = st.layer;
  });
  // bring the selected row into view when the list opens (the kit's Picker v0.1.0 scrolls by
  // offsetTop minus the list's own offset, which lands short when the list sits low in a pane)
  let host: HTMLDivElement;
  $effect(() => {
    void value;
    void items.length;
    const t = setTimeout(() => {
      const list = host?.querySelector<HTMLElement>(".list");
      const opt = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      if (list && opt) list.scrollTop = Math.max(0, opt.offsetTop - list.clientHeight / 3);
    }, 60);
    return () => clearTimeout(t);
  });

  function pick(it: { id: string }) {
    if (isAphiaSearch(it.id)) {
      searching = true;
      value = st.layer;
      return;
    }
    searching = false;
    if (parseLayerKey(it.id)) {
      st.layer = it.id;
      if (it.id.startsWith("taxon:")) st.decade = null; // taxon groups have no decade layers
      st.cell = null;
      onpicked?.();
    }
  }
</script>

<div class="taxon-panel" class:mbon-fill={fill} bind:this={host}>
  <Picker {items} bind:value label="taxa" placeholder="Search taxa, EOVs, common names…" {maxHeight} {fill} onselect={pick}>
    {#snippet row(it)}
      <span class="lab">{it.label}</span>
      {#if it.count != null}
        <span class="logbar" aria-hidden="true"><span style:width="{logBar(it.count, maxCount) * 100}%"></span></span>
        <span class="n">{fmt(it.count)}</span>
      {/if}
    {/snippet}
  </Picker>
  {#if sel.kind === "eov"}
    <a class="small" href="https://github.com/ioos/marine_life_data_network/tree/main/eov_taxonomy" target="_blank" rel="noopener"
      >what defines each EOV? ↗</a>
  {/if}
  {#if showSearch}
    <div class="aphia">
      <span class="mbon-label">any taxon (WoRMS, live)</span>
      {#if h3tHealth === "down"}
        <p class="hint">The WoRMS subtree service (h3t) is unavailable.</p>
      {:else}
        <AphiaSearch base={h3tBase} onpick={(id) => { st.layer = layerKey({ kind: "aphia", id }); st.cell = null; searching = false; onpicked?.(); }} />
      {/if}
      {#if sel.kind === "aphia"}
        <div class="taxon-line">
          {#if aphiaInfo && aphiaInfo.id === sel.id}
            <i>{aphiaInfo.scientificName}</i> ({aphiaInfo.rank.toLowerCase()}{aphiaInfo.status && aphiaInfo.status !== "accepted" ? `, ${aphiaInfo.status}` : ""})
            {#if aphiaAccepted && aphiaAccepted.id !== aphiaInfo.id}→ <i>{aphiaAccepted.scientificName}</i>{/if}
            {#if aphiaInfo.records != null}· {fmt(aphiaInfo.records)} records{/if}
          {:else}
            AphiaID {sel.id}
          {/if}
          <a href={wormsUrl(sel.id)} target="_blank" rel="noopener">in WoRMS ↗</a>
        </div>
        <p class="hint">Children of the AphiaID, computed live by the h3t subtree service.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .taxon-panel { display: flex; flex-direction: column; gap: var(--space-2); }
  .lab { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .logbar { flex: none; width: 3.5rem; height: 6px; border-radius: 3px; background: var(--bg-tint); overflow: hidden; }
  .logbar span { display: block; height: 100%; background: var(--accent); opacity: 0.75; }
  .n { flex: none; width: 5.2em; text-align: right; font: var(--text-xs) / 1 var(--font-mono); color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .aphia { display: flex; flex-direction: column; gap: var(--space-1); }
  .small { font: var(--type-small); }
</style>
