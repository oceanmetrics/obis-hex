<script lang="ts">
  // the left-panel controls; every input writes straight into the bound AppState.
  import { EOVS, INDICATORS, layerKey, parseLayerKey, type LayerSel } from "../lib/data/layers";
  import type { Manifest } from "../lib/release/manifest";
  import type { TaxonGroup } from "../lib/release/release";
  import type { AppState } from "../lib/state/url";
  import { DECADES } from "../lib/state/url";
  import { RES_DECADE_MAX, RES_MAX } from "../lib/state/resolution";
  import { wormsUrl, type TaxonInfo } from "../lib/aphia/h3t";
  import AphiaSearch from "./AphiaSearch.svelte";

  let {
    st = $bindable(),
    autoRes,
    res,
    manifest,
    taxonGroups,
    h3tBase,
    h3tHealth,
    aphiaInfo,
    aphiaAccepted,
  }: {
    st: AppState;
    autoRes: number;
    res: number;
    manifest: Manifest | null;
    taxonGroups: TaxonGroup[];
    /** the h3t subtree service (live AphiaID layers) */
    h3tBase: string;
    h3tHealth: "probing" | "ok" | "down";
    /** the selected AphiaID's details, and its accepted name when it is a synonym */
    aphiaInfo: TaxonInfo | null;
    aphiaAccepted: TaxonInfo | null;
  } = $props();

  const sel: LayerSel = $derived(parseLayerKey(st.layer) ?? { kind: "all" });
  const hasEov = $derived(manifest?.hasLayer("eov") ?? false);
  const hasTaxon = $derived((manifest?.hasLayer("taxon") ?? false) && taxonGroups.length > 0);
  const live = $derived(sel.kind === "aphia");
  const hasAphia = $derived(h3tHealth !== "down");
  const hasDecade = $derived(
    live || (manifest ? manifest.hasLayer(sel.kind === "eov" ? "decade_eov" : "decade_all") : false),
  );
  // the live layer filters decades on the server at any res; release decades stop at res 5
  const decadesAllowed = $derived(
    hasDecade &&
      sel.kind !== "taxon" &&
      (live || !(st.resMode === "manual" && st.res > RES_DECADE_MAX)),
  );
  const resMax = $derived(st.decade === null || live ? RES_MAX : RES_DECADE_MAX);
  const aphiaHint = $derived.by(() => {
    if (sel.kind !== "aphia") return "";
    const parts = [`AphiaID ${sel.id}`];
    const i = aphiaInfo && aphiaInfo.id === sel.id ? aphiaInfo : null;
    if (i?.records != null) parts.push(`${i.records.toLocaleString("en-US")} records`);
    if (i?.children_accepted) parts.push(`${i.children_accepted} accepted children`);
    parts.push("computed live (h3t subtree)");
    return parts.join(" · ");
  });
  /** the last AphiaID chosen, so toggling back to "Any taxon" restores it (Cetacea at first) */
  let lastAphia = $state(2688);
  $effect(() => {
    if (sel.kind === "aphia") lastAphia = sel.id;
  });

  let taxonFilter = $state("");
  const ranks = $derived([...new Set(taxonGroups.map((g) => g.rank))]);
  const filtered = $derived.by(() => {
    const f = taxonFilter.trim().toLowerCase();
    return f ? taxonGroups.filter((g) => g.taxon.toLowerCase().includes(f)) : taxonGroups;
  });

  function setKind(kind: LayerSel["kind"]) {
    if (kind === "all") st.layer = "all";
    else if (kind === "eov") st.layer = layerKey({ kind: "eov", eov: EOVS[0].id });
    else if (kind === "aphia") st.layer = layerKey({ kind: "aphia", id: lastAphia });
    else if (taxonGroups.length) {
      const g = taxonGroups[0];
      st.layer = layerKey({ kind: "taxon", rank: g.rank, taxon: g.taxon });
      st.decade = null;
    }
  }

  function setPeriod(v: string) {
    st.decade = v === "all" ? null : Number(v);
  }

  function setManualRes(v: number) {
    st.res = v;
    st.resMode = "manual";
  }
</script>

<section class="controls">
  <label class="field">
    <span>Indicator</span>
    <select bind:value={st.indicator}>
      {#each INDICATORS as ind (ind.id)}
        <option value={ind.id}>{ind.label}</option>
      {/each}
    </select>
  </label>

  <fieldset class="field">
    <legend>Layer</legend>
    <div class="seg">
      <button class:on={sel.kind === "all"} onclick={() => setKind("all")}>All taxa</button>
      <button class:on={sel.kind === "eov"} disabled={!hasEov} onclick={() => setKind("eov")}
        title={hasEov ? "" : "not in this release"}>EOV</button>
      <button class:on={sel.kind === "taxon"} disabled={!hasTaxon} onclick={() => setKind("taxon")}
        title={hasTaxon ? "" : "not in this release"}>Taxon group</button>
    </div>
    <div class="seg">
      <button class:on={sel.kind === "aphia"} disabled={!hasAphia} onclick={() => setKind("aphia")}
        title={hasAphia
          ? "children of any WoRMS AphiaID, computed live by the h3t subtree service"
          : "the subtree service is unavailable"}>Any taxon (WoRMS){h3tHealth === "down" ? " — offline" : ""}</button>
    </div>
    {#if sel.kind === "eov"}
      <select
        value={sel.eov}
        onchange={(e) => (st.layer = layerKey({ kind: "eov", eov: e.currentTarget.value }))}
      >
        {#each EOVS as e (e.id)}
          <option value={e.id}>{e.label}</option>
        {/each}
      </select>
    {:else if sel.kind === "taxon"}
      <input type="search" placeholder="filter taxa…" bind:value={taxonFilter} />
      <select
        size="6"
        value={st.layer}
        onchange={(e) => (st.layer = e.currentTarget.value)}
      >
        {#each ranks as rank (rank)}
          <optgroup label={rank}>
            {#each filtered.filter((g) => g.rank === rank) as g (g.rank + g.taxon)}
              <option value={layerKey({ kind: "taxon", rank: g.rank, taxon: g.taxon })}
                >{g.label || g.taxon}</option
              >
            {/each}
          </optgroup>
        {/each}
      </select>
      <small class="hint">{sel.taxon} ({sel.rank})</small>
    {:else if sel.kind === "aphia"}
      <AphiaSearch base={h3tBase} onpick={(id) => (st.layer = layerKey({ kind: "aphia", id }))} />
      <div class="taxon-line">
        {#if aphiaInfo && aphiaInfo.id === sel.id}
          <i>{aphiaInfo.scientificName}</i> ({aphiaInfo.rank.toLowerCase()}{aphiaInfo.status && aphiaInfo.status !== "accepted" ? `, ${aphiaInfo.status}` : ""})
          {#if aphiaAccepted && aphiaAccepted.id !== aphiaInfo.id}→ <i>{aphiaAccepted.scientificName}</i>{/if}
        {:else}
          AphiaID {sel.id}
        {/if}
        <a href={wormsUrl(sel.id)} target="_blank" rel="noopener">▸ in WoRMS</a>
      </div>
      <small class="hint">{aphiaHint}</small>
    {/if}
  </fieldset>

  <label class="field">
    <span>Period</span>
    <select value={st.decade === null ? "all" : String(st.decade)} onchange={(e) => setPeriod(e.currentTarget.value)}>
      <option value="all">All years</option>
      {#each DECADES as d (d)}
        <option value={String(d)} disabled={!decadesAllowed}>{d}s</option>
      {/each}
    </select>
    {#if !decadesAllowed}
      <small class="hint">
        {sel.kind === "taxon"
          ? "decades: all taxa and EOVs only"
          : !hasDecade
            ? "no decade layers in this release"
            : `decades: resolution ≤ ${RES_DECADE_MAX}`}
      </small>
    {/if}
  </label>

  <fieldset class="field">
    <legend>Resolution <b>{res}</b></legend>
    <label class="check">
      <input
        type="checkbox"
        checked={st.resMode === "auto"}
        onchange={(e) => {
          st.resMode = e.currentTarget.checked ? "auto" : "manual";
          if (!e.currentTarget.checked) st.res = autoRes;
        }}
      />
      auto from zoom
    </label>
    <input
      type="range"
      min="1"
      max={resMax}
      step="1"
      value={st.resMode === "auto" ? autoRes : Math.min(st.res, resMax)}
      oninput={(e) => setManualRes(Number(e.currentTarget.value))}
      aria-label="H3 resolution"
    />
  </fieldset>

  <label class="field">
    <span>Fill opacity {Math.round(st.opacity * 100)}%</span>
    <input type="range" min="0" max="1" step="0.05" bind:value={st.opacity} />
  </label>

  <fieldset class="field">
    <legend>Colour ramp domain</legend>
    <div class="seg">
      <button class:on={st.domain === "release" && !live} disabled={live} onclick={() => (st.domain = "release")}
        title={live
          ? "a live AphiaID layer has no release stats"
          : "p02–p98 of this layer, period and resolution across the whole release"}>release</button>
      <button class:on={st.domain === "view" || live} onclick={() => (st.domain = "view")}
        title="p02–p98 of the cells loaded for this view">loaded cells</button>
    </div>
    {#if live}<small class="hint">live AphiaID layer: no release stats, the ramp comes from the loaded cells</small>{/if}
  </fieldset>

  <fieldset class="field">
    <legend>Projection</legend>
    <div class="seg">
      <button class:on={st.proj === "flat"} onclick={() => (st.proj = "flat")}>flat</button>
      <button class:on={st.proj === "globe"} onclick={() => (st.proj = "globe")}>globe</button>
    </div>
  </fieldset>

  <fieldset class="field">
    <legend>Basemap</legend>
    <div class="seg">
      <button class:on={st.theme === "dark"} onclick={() => (st.theme = "dark")}>dark</button>
      <button class:on={st.theme === "light"} onclick={() => (st.theme = "light")}>light</button>
    </div>
  </fieldset>
</section>
