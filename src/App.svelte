<script lang="ts">
  // the app shell. ALL view state is `st` (an AppState), mirrored to the URL hash both ways;
  // everything else here is derived from it or is loaded data (release, manifest, partition).
  import { onMount } from "svelte";
  import type { PickingInfo } from "@deck.gl/core";
  import { Engine, type Partition } from "./lib/engine/engine";
  import { displaySql, displayUnionSql } from "./lib/engine/sql";
  import {
    indicatorLabel,
    INDICATORS,
    layerLabel,
    manifestLayer,
    parseLayerKey,
    type LayerSel,
  } from "./lib/data/layers";
  import { fileUrl } from "./lib/release/manifest";
  import { planView, type Bounds } from "./lib/view/viewport";
  import {
    loadMeta,
    probeRelease,
    resolveDataBase,
    statsSql,
    type ReleaseJson,
    type ReleaseMeta,
    type StatsRow,
  } from "./lib/release/release";
  import { formatHash, parseHash, type AppState } from "./lib/state/url";
  import { legacyQuery, legacyToState } from "./lib/state/legacy";
  import { effectiveRes, zoomToRes } from "./lib/state/resolution";
  import { chooseDomain, domainFromStats, viewStats } from "./lib/color/ramp";
  import { createMap, type MapHandle } from "./lib/map/map";
  import { cellColors, hexLayer } from "./lib/map/hexLayer";
  import { fmt, fmtBytes } from "./lib/format";
  import Controls from "./components/Controls.svelte";
  import StatsPanel from "./components/StatsPanel.svelte";
  import CellPanel, { type SelectedCell } from "./components/CellPanel.svelte";
  import SqlPanel from "./components/SqlPanel.svelte";

  const base = resolveDataBase(location.search, import.meta.env.VITE_DATA_BASE, location.href);
  const engine = new Engine();

  // an old h3-db link (Caddy 302s /h3-db/?<query> to ?legacy=<query>): map it to the hash state
  // once, then drop ?legacy= from the address bar so the page URL is a normal obis-hex link
  const legacy = legacyQuery(location.search);
  const fromLegacy = legacy ? legacyToState(legacy) : null;
  if (fromLegacy) {
    const keep = location.search.replace(/^\?/, "").split(/&?legacy=/)[0];
    history.replaceState(null, "", `${location.pathname}${keep ? `?${keep}` : ""}${formatHash(fromLegacy.state)}`);
  }

  // state ----
  let st = $state<AppState>(fromLegacy?.state ?? parseHash(location.hash));
  let legacyNotice = $state(fromLegacy?.notice ?? "");
  let health = $state<"probing" | "ok" | "down">("probing");
  let healthError = $state("");
  let release = $state.raw<ReleaseJson | null>(null);
  let meta = $state.raw<ReleaseMeta | null>(null);
  let partition = $state.raw<Partition | null>(null);
  /** parent partitions fetched by the last split load (the rest came from the DuckDB cache) */
  let fetchedLast = $state(0);
  let bounds = $state.raw<Bounds | null>(null);
  let loading = $state(false);
  let loadError = $state("");
  let releaseStats = $state.raw<StatsRow | null>(null);
  let statsQuery = $state("");
  let selected = $state.raw<SelectedCell | null>(null);
  let mapEl: HTMLDivElement;
  let handle = $state.raw<MapHandle | null>(null);

  // derived view ----
  const sel: LayerSel = $derived(parseLayerKey(st.layer) ?? { kind: "all" });
  const reqRes = $derived(effectiveRes(st.resMode, st.res, st.zoom, st.decade));
  // the view plan: a whole file, or the parent partitions covering the viewport (layout v2), with
  // a fallback to a coarser res when a split res would need more than MAX_PARENTS partitions
  const plan = $derived(meta ? planView(meta.manifest, sel, st.decade, reqRes, bounds) : null);
  const res = $derived(plan?.res ?? reqRes);
  const urls = $derived(plan ? plan.files.map((f) => fileUrl(base, f)) : []);
  // a string, so the load effect re-runs only when the set of files changes (not on every pan)
  const loadKey = $derived(urls.length ? `${plan?.split ? "split" : "whole"}\n${urls.join("\n")}` : "");
  const fileRow = $derived(plan && !plan.split ? plan.files[0] : null);
  const planBytes = $derived(plan ? plan.files.reduce((a, f) => a + f.bytes, 0) : 0);
  const vstats = $derived(partition ? viewStats(partition.values[st.indicator]) : null);
  const domain = $derived(chooseDomain(st.domain, domainFromStats(releaseStats), vstats));
  const colors = $derived(partition ? cellColors(partition.values[st.indicator], domain) : null);
  const sqlText = $derived(
    !plan ? "" : plan.split ? displayUnionSql(urls, st.indicator) : displaySql(urls[0], st.indicator),
  );
  // the view described in words, so a screenshot explains itself
  const viewTitle = $derived(
    `${indicatorLabel(st.indicator)} · ${layerLabel(sel)} · ` +
      `${st.decade === null ? "all years" : `${st.decade}–${st.decade + 9}`}` +
      `${release?.obis_snapshot ? ` (OBIS ${release.obis_snapshot})` : ""} · H3 res ${res}`,
  );
  const noDataReason = $derived.by(() => {
    if (!meta) return "";
    if (plan) return plan.split && !plan.files.length ? "No cells in this view." : "";
    if (sel.kind === "taxon" && st.decade !== null)
      return "Taxon groups have no decade partitions: choose All years.";
    if (!meta.manifest.hasLayer(manifestLayer(sel, st.decade) ?? ""))
      return "This release has no partitions for this layer.";
    return `No partition for ${layerLabel(sel)} at resolution ${res}.`;
  });

  // URL hash ⇄ state ----
  $effect(() => {
    const h = formatHash(st);
    if (h !== location.hash) history.replaceState(null, "", h);
  });
  function onHashChange() {
    const next = parseHash(location.hash);
    st = next;
    handle?.map.jumpTo({ center: [next.lon, next.lat], zoom: next.zoom });
  }

  // load the view: one whole file (cached by URL), or the union of the parent partitions
  // covering the viewport (each fetched once into DuckDB, refetched only when new ones appear) ----
  $effect(() => {
    const key = loadKey;
    if (!key) {
      partition = null;
      return;
    }
    const [mode, ...list] = key.split("\n");
    let cancelled = false;
    loading = true;
    loadError = "";
    const job =
      mode === "split"
        ? engine.loadUnion(list).then((p) => {
            if (!cancelled) fetchedLast = p.fetched.length;
            return p as Partition;
          })
        : engine.loadPartition(list[0]);
    job
      .then((p) => {
        if (cancelled) return;
        partition = p;
        loading = false;
      })
      .catch((err) => {
        if (cancelled) return;
        loading = false;
        loadError = err instanceof Error ? err.message : String(err);
      });
    return () => {
      cancelled = true;
    };
  });

  // the release's precomputed stats row for the view (the default ramp domain) ----
  $effect(() => {
    const layer = manifestLayer(sel, st.decade);
    if (!meta?.statsLoaded || !layer || !plan) {
      releaseStats = null;
      statsQuery = "";
      return;
    }
    const q = statsSql(layer, sel, st.decade, res, st.indicator);
    let cancelled = false;
    engine
      .rows<StatsRow>(q)
      .then((rows) => {
        if (cancelled) return;
        releaseStats = rows[0] ?? null;
        statsQuery = q;
      })
      .catch(() => {
        if (!cancelled) releaseStats = null;
      });
    return () => {
      cancelled = true;
    };
  });

  // push layers / theme to the map ----
  $effect(() => {
    if (!handle) return;
    handle.setLayers(
      partition && colors ? [hexLayer(partition, st.indicator, colors, st.opacity)] : [],
    );
  });
  $effect(() => {
    handle?.setProjection(st.proj);
  });
  $effect(() => {
    handle?.setTheme(st.theme);
    document.documentElement.dataset.theme = st.theme;
  });
  $effect(() => {
    if (selected && partition && selected.url !== partition.url) selected = null;
  });

  // map interaction ----
  function cellAt(info: PickingInfo): SelectedCell | null {
    const p = partition;
    if (!p || !info.picked || info.index < 0 || info.index >= p.rows) return null;
    const i = info.index;
    return {
      url: p.url,
      h3: p.h3[i],
      res,
      layer: layerLabel(sel),
      period: st.decade === null ? "All years" : `${st.decade}s`,
      values: Object.fromEntries(INDICATORS.map((ind) => [ind.id, p.values[ind.id][i]])) as SelectedCell["values"],
    };
  }

  function tooltip(info: PickingInfo) {
    const c = cellAt(info);
    if (!c) return null;
    const rows = INDICATORS.map(
      (ind) =>
        `<tr${ind.id === st.indicator ? ' class="on"' : ""}><td>${ind.short}</td><td>${fmt(c.values[ind.id])}</td></tr>`,
    ).join("");
    return { html: `<div class="tip"><code>${c.h3}</code><table>${rows}</table></div>` };
  }

  onMount(() => {
    handle = createMap(mapEl, {
      theme: st.theme,
      projection: st.proj,
      center: [st.lon, st.lat],
      zoom: st.zoom,
      onView: (v) => {
        st.lon = v.lon;
        st.lat = v.lat;
        st.zoom = v.zoom;
        bounds = handle?.bounds() ?? null;
      },
      getTooltip: tooltip,
      onClick: (info) => {
        selected = cellAt(info);
      },
    });
    bounds = handle.bounds();
    window.addEventListener("hashchange", onHashChange);

    (async () => {
      const probe = await probeRelease(base);
      if (!probe.ok) {
        health = "down";
        healthError = probe.error;
        return;
      }
      release = probe.release;
      try {
        meta = await loadMeta(engine, base);
        health = "ok";
      } catch (err) {
        health = "down";
        healthError = err instanceof Error ? err.message : String(err);
      }
    })();

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      handle?.destroy();
      engine.dispose();
    };
  });
</script>

<div class="shell" data-ready={partition && !loading && health === "ok" ? "1" : "0"}>
  <aside class="side">
    <header>
      <h1>OBIS hex</h1>
      <p class="sub">Biodiversity indicators on H3 hexagons, computed from Parquet in your browser.</p>
    </header>
    {#if legacyNotice}
      <div class="banner notice" role="status">
        {legacyNotice}
        <button class="close" aria-label="dismiss" onclick={() => (legacyNotice = "")}>×</button>
      </div>
    {/if}
    {#if health === "down"}
      <div class="banner" role="alert">
        Data release unavailable: {healthError}<br /><small>{base}</small>
      </div>
    {/if}
    <Controls
      bind:st
      autoRes={Math.min(zoomToRes(st.zoom), st.decade === null ? 7 : 5)}
      {res}
      manifest={meta?.manifest ?? null}
      taxonGroups={meta?.taxonGroups ?? []}
    />
    <SqlPanel sql={sqlText} {statsQuery} />
  </aside>

  <main class="stage">
    <div class="map" bind:this={mapEl}></div>
    <div class="overlay-top">
      <StatsPanel
        title={viewTitle}
        {domain}
        domainSource={st.domain === "release" && releaseStats ? "release p02–p98" : "view p02–p98"}
        {vstats}
        {releaseStats}
        {loading}
        message={loadError || noDataReason || plan?.notice || (health === "probing" ? "Loading release…" : "")}
      />
    </div>
    {#if selected}
      <CellPanel cell={selected} indicator={st.indicator} onclose={() => (selected = null)} />
    {/if}
    <footer class="foot">
      {#if partition && plan?.split}
        <span title={plan.files.map((f) => f.path).join("\n")}
          >{plan.files.length} of {fmt(plan.parentsTotal)} partitions (res {res} by parent cell)</span>
        <span>{fmtBytes(planBytes)}</span>
        <span>{fmt(partition.rows)} cells</span>
        <span>{fetchedLast} fetched · {engine.partsCached} cached</span>
        <span>{Math.round(partition.ms)} ms</span>
      {:else if partition && fileRow}
        <span title={partition.url}>{fileRow.path}</span>
        <span>{fmtBytes(fileRow.bytes)}</span>
        <span>{fmt(partition.rows)} cells</span>
        <span>{Math.round(partition.ms)} ms</span>
      {/if}
      <span>DuckDB-WASM 1.32.0</span>
      {#if release}<span>release {release.release}{release.obis_snapshot ? ` (OBIS ${release.obis_snapshot})` : ""}</span>{/if}
      <span>v{__APP_VERSION__}</span>
      <a href="https://github.com/oceanmetrics/obis-hex" target="_blank" rel="noopener">source</a>
    </footer>
  </main>
</div>
