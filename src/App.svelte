<script lang="ts">
  // the app shell. ALL view state is `st` (an AppState), mirrored to the URL hash both ways;
  // everything else here is derived from it or is loaded data (release, manifest, partition).
  import { onMount, untrack } from "svelte";
  import type { PickingInfo } from "@deck.gl/core";
  import { Engine, type Partition } from "./lib/engine/engine";
  import { displaySql, displayUnionSql } from "./lib/engine/sql";
  import {
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
  import { formatHash, hashHas, parseHash, TABS, type AppState, type Tab } from "./lib/state/url";
  import { legacyQuery, legacyToState } from "./lib/state/legacy";
  import { effectiveRes, zoomToRes } from "./lib/state/resolution";
  import { chooseDomain, domainFromStats, viewStats } from "./lib/color/ramp";
  import { createMap, type MapHandle } from "./lib/map/map";
  import { cellColors, hexLayer } from "./lib/map/hexLayer";
  import { fmt, fmtBytes } from "./lib/format";
  import {
    errorLine,
    loadAphiaView,
    parseTaxonInfo,
    probeH3t,
    resolveH3tBase,
    subtreeBbox,
    taxonUrl,
    wormsUrl,
    BBOX_MIN_RES,
    type AphiaView,
    type TaxonInfo,
  } from "./lib/aphia/h3t";
  import {
    applyTheme,
    Controls,
    Footer,
    Header,
    Kbd,
    Legend,
    Notice,
    onThemeChange,
    Pane,
    storedTheme,
    TimeStrip,
    urlTheme,
  } from "@marinebon/ui";
  import CellPanel, { type SelectedCell } from "./components/CellPanel.svelte";
  import TitleSentence from "./components/TitleSentence.svelte";
  import TaxonPanel from "./components/TaxonPanel.svelte";
  import PeriodPicker from "./components/PeriodPicker.svelte";
  import PlacePanel from "./components/PlacePanel.svelte";
  import ScalePanel from "./components/ScalePanel.svelte";
  import IndicatorPanel from "./components/IndicatorPanel.svelte";
  import SharePanel from "./components/SharePanel.svelte";
  import DecadeBars from "./components/DecadeBars.svelte";
  import { taxonItems, type TaxonGroupRow } from "./lib/data/taxa";
  import { coverageText, hexAreaLabel, sentenceParts, sentenceText } from "./lib/view/sentence";
  import {
    decadeAt,
    decadeCountsSql,
    decadeFiles,
    decadeSpan,
    normalizeCounts,
    DECADE_DOMAIN,
    type DecadeCount,
  } from "./lib/release/decades";
  import type { Region } from "./lib/view/regions";
  import { downloadCanvas, pngName, stampPng } from "./lib/export/png";
  import { citeText } from "./lib/export/cite";
  import { RES_DECADE_MAX } from "./lib/state/resolution";
  import { VIRIDIS } from "./lib/color/ramp";

  const base = resolveDataBase(location.search, import.meta.env.VITE_DATA_BASE, location.href);
  const h3tBase = resolveH3tBase(location.search, import.meta.env.VITE_H3T_BASE, location.href);
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
  const initial = fromLegacy?.state ?? parseHash(location.hash);
  // the theme is the kit's (header toggle, stored choice) and drives the basemap; a link's `t=`
  // still wins, so every old link opens in the theme it was made in; with no `t=` the app keeps
  // its dark default unless the visitor chose a theme (?theme= or the stored toggle)
  if (!fromLegacy && !hashHas(location.hash, "t"))
    initial.theme = urlTheme(location.search) ?? storedTheme() ?? "dark";
  // on a phone the map is the page: the Controls start folded unless the link says otherwise
  if (!fromLegacy && !hashHas(location.hash, "cc") && matchMedia("(max-width: 640px)").matches)
    initial.ctlFolded = true;
  let st = $state<AppState>(initial);
  let helpOpen = $state(false);
  let helpTopic = $state<"about" | "sources" | "keys">("about");
  let wide = $state(matchMedia("(min-width: 1600px)").matches);
  let wideEnough = $state(!matchMedia("(max-width: 640px)").matches);
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
  let decadeCounts = $state.raw<{ key: string; decades: DecadeCount[]; total: number | null; ms: number } | null>(null);
  const decadeCache = new Map<string, { key: string; decades: DecadeCount[]; total: number | null; ms: number }>();
  let brush = $state<[number, number] | null>(null);
  let stageH = $state(600);
  let stripH = $state(76);
  // the live AphiaID layer (h3t subtree service) ----
  let h3tHealth = $state<"probing" | "ok" | "down">("probing");
  let aphiaView = $state.raw<AphiaView | null>(null);
  let aphiaInfo = $state.raw<TaxonInfo | null>(null);
  let aphiaAccepted = $state.raw<TaxonInfo | null>(null);
  let mapEl: HTMLDivElement;
  let handle = $state.raw<MapHandle | null>(null);

  // derived view ----
  const sel: LayerSel = $derived(parseLayerKey(st.layer) ?? { kind: "all" });
  const live = $derived(sel.kind === "aphia");
  const reqRes = $derived(effectiveRes(st.resMode, st.res, st.zoom, st.decade, live));
  // the view plan: a whole file, or the parent partitions covering the viewport (layout v2), with
  // a fallback to a coarser res when a split res would need more than MAX_PARENTS partitions
  const plan = $derived(meta && !live ? planView(meta.manifest, sel, st.decade, reqRes, bounds) : null);
  const res = $derived(live ? (aphiaView?.res ?? reqRes) : (plan?.res ?? reqRes));
  const urls = $derived(plan ? plan.files.map((f) => fileUrl(base, f)) : []);
  // the live layer's request: one per (id, res, decade), plus the rounded viewport bbox from res 6
  const aphiaKey = $derived.by(() => {
    if (sel.kind !== "aphia" || h3tHealth === "down") return "";
    const bb = reqRes >= BBOX_MIN_RES && bounds ? subtreeBbox(bounds) : null;
    if (reqRes >= BBOX_MIN_RES && !bb) return ""; // wait for the map's bounds
    return [sel.id, reqRes, st.decade ?? "", bb ? bb.join(",") : ""].join("|");
  });
  // a string, so the load effect re-runs only when the set of files changes (not on every pan)
  const loadKey = $derived(
    live
      ? aphiaKey
        ? `aphia\n${aphiaKey}`
        : ""
      : urls.length
        ? `${plan?.split ? "split" : "whole"}\n${urls.join("\n")}`
        : "",
  );
  const fileRow = $derived(plan && !plan.split ? plan.files[0] : null);
  const planBytes = $derived(plan ? plan.files.reduce((a, f) => a + f.bytes, 0) : 0);
  const vstats = $derived(partition ? viewStats(partition.values[st.indicator]) : null);
  const domain = $derived(chooseDomain(st.domain, domainFromStats(releaseStats), vstats));
  const colors = $derived(partition ? cellColors(partition.values[st.indicator], domain) : null);
  const sqlText = $derived(
    live
      ? (aphiaView?.url ?? "")
      : !plan
        ? ""
        : plan.split
          ? displayUnionSql(urls, st.indicator)
          : displaySql(urls[0], st.indicator),
  );
  /** the layer in words: the WoRMS name and rank for a live AphiaID layer */
  const layerText = $derived.by(() => {
    if (sel.kind !== "aphia" || !aphiaInfo || aphiaInfo.id !== sel.id) return layerLabel(sel);
    const acc =
      aphiaAccepted && aphiaAccepted.id !== aphiaInfo.id ? ` → ${aphiaAccepted.scientificName}` : "";
    return `${aphiaInfo.scientificName}${acc} (${aphiaInfo.rank.toLowerCase()})`;
  });
  const noDataReason = $derived.by(() => {
    if (live) {
      if (h3tHealth === "down")
        return "The WoRMS subtree service (h3t) is unavailable: choose another layer.";
      if (partition && !loading && partition.rows === 0)
        return `No OBIS records for this taxon${st.decade === null ? "" : ` in the ${st.decade}s`}${res >= BBOX_MIN_RES ? " in this view" : ""}.`;
      return "";
    }
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
    if (mode === "aphia") {
      const [id, r, d] = list[0].split("|");
      loadAphiaView(engine, h3tBase, {
        aphiaid: Number(id),
        res: Number(r),
        decade: d ? Number(d) : null,
        bounds: untrack(() => bounds),
      })
        .then((v) => {
          if (cancelled) return;
          aphiaView = v;
          partition = v.partition;
          loading = false;
        })
        .catch((err) => {
          if (cancelled) return;
          loading = false;
          loadError = errorLine(err);
          aphiaView = null;
          partition = null;
        });
      return () => {
        cancelled = true;
      };
    }
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
  const statsQ = $derived.by(() => {
    const layer = manifestLayer(sel, st.decade);
    return meta?.statsLoaded && layer && plan ? statsSql(layer, sel, st.decade, res, st.indicator) : "";
  });
  /** the stats query that has settled (resolved or failed), so the ready flag waits for the ramp */
  let statsSettled = $state("");
  $effect(() => {
    const q = statsQ;
    if (!q) {
      releaseStats = null;
      statsQuery = "";
      return;
    }
    let cancelled = false;
    engine
      .rows<StatsRow>(q)
      .then((rows) => {
        if (cancelled) return;
        releaseStats = rows[0] ?? null;
        statsQuery = q;
        statsSettled = q;
      })
      .catch(() => {
        if (cancelled) return;
        releaseStats = null;
        statsSettled = q;
      });
    return () => {
      cancelled = true;
    };
  });

  // the selected AphiaID's name and rank (and its accepted name when it is a synonym) ----
  $effect(() => {
    if (sel.kind !== "aphia" || h3tHealth === "down") return;
    const id = sel.id;
    if (aphiaInfo?.id === id) return;
    const ctl = new AbortController();
    const get = async (x: number) => {
      const r = await fetch(taxonUrl(h3tBase, x), { signal: ctl.signal });
      return r.ok ? parseTaxonInfo(await r.json()) : null;
    };
    (async () => {
      try {
        const info = await get(id);
        const acc = info && info.accepted_id !== info.id ? await get(info.accepted_id) : null;
        aphiaInfo = info;
        aphiaAccepted = acc;
      } catch {
        /* the title falls back to "AphiaID <id>" */
      }
    })();
    return () => ctl.abort();
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
    if (document.documentElement.dataset.theme !== st.theme) applyTheme(st.theme);
  });
  $effect(() => {
    handle?.setLabels(st.labels);
  });
  // keep the map's centre above the Time strip (laptop and wider; on a phone the panes are sheets)
  $effect(() => {
    const bottom = wideEnough ? (st.timeFolded ? 56 : stripH + 64) : 0;
    handle?.map.setPadding({ top: 0, left: 0, right: 0, bottom });
  });


  // the decades: release decade layers exist for all taxa and the EOVs at res <= 5; a live
  // WoRMS layer filters decades on the server at any res ----
  const hasDecadeLayer = $derived(
    live || (meta ? meta.manifest.hasLayer(sel.kind === "eov" ? "decade_eov" : "decade_all") : false),
  );
  const decadesAllowed = $derived(
    hasDecadeLayer && sel.kind !== "taxon" && (live || !(st.resMode === "manual" && st.res > RES_DECADE_MAX)),
  );
  const decadeReason = $derived(
    sel.kind === "taxon"
      ? "Decades: all taxa and the EOVs only (taxon groups are all years)."
      : !hasDecadeLayer
        ? "This release has no decade layers."
        : decadesAllowed
          ? ""
          : `Decades: hexagons of res ${RES_DECADE_MAX} (${hexAreaLabel(RES_DECADE_MAX)}) or larger.`,
  );
  const resMax = $derived(st.decade === null || live ? 7 : RES_DECADE_MAX);
  const autoResNow = $derived(Math.min(zoomToRes(st.zoom), st.decade === null || live ? 7 : 5));

  // the title sentence ----
  const inView = $derived(live ? !!aphiaView?.url.includes("bbox=") : !!plan?.split);
  const parts = $derived(
    sentenceParts({
      sel,
      aphia:
        sel.kind === "aphia" && aphiaInfo && aphiaInfo.id === sel.id
          ? { name: (aphiaAccepted && aphiaAccepted.id !== aphiaInfo.id ? aphiaAccepted : aphiaInfo).scientificName, rank: aphiaInfo.rank }
          : null,
      decade: st.decade,
      snapshot: release?.obis_snapshot ?? null,
      inView,
      parts: !live && plan?.split ? { loaded: plan.files.length, total: plan.parentsTotal } : null,
      res,
      auto: st.resMode === "auto",
      indicator: st.indicator,
    }),
  );
  const titleText = $derived(sentenceText(parts));
  const coverage = $derived(
    partition && vstats && !loading ? coverageText(st.indicator, vstats, Number(release?.esn ?? 50)) : "",
  );
  const message = $derived(
    loadError ||
      noDataReason ||
      (live ? aphiaView?.notice : plan?.notice) ||
      (live && h3tHealth === "probing" ? "Checking the WoRMS subtree service…" : "") ||
      (!live && health === "probing" ? "Loading release…" : ""),
  );

  // the taxon picker's rows ----
  const items = $derived(
    taxonItems(
      [
        ...(meta?.taxonGroups ?? []),
        ...Object.entries(meta?.eovCounts ?? {}).map(([taxon, n]): TaxonGroupRow => ({ kind: "eov", rank: "eov", taxon, n })),
      ],
      {
        hasEov: meta ? meta.manifest.hasLayer("eov") : undefined,
        hasTaxon: meta ? meta.manifest.hasLayer("taxon") : undefined,
        hasAphia: h3tHealth !== "down",
        totalRecords: decadeCache.get("all")?.total ?? (sel.kind === "all" ? decadeCounts?.total : null) ?? null,
        aphia: sel.kind === "aphia" && aphiaInfo && aphiaInfo.id === sel.id ? { id: sel.id, name: aphiaInfo.scientificName } : null,
      },
    ),
  );

  // records per decade for the Time strip: one cheap query per layer, after the map has loaded ----
  const decadeKey = $derived(sel.kind === "all" || sel.kind === "eov" ? st.layer : "");
  const mapLoaded = $derived(!!partition);
  $effect(() => {
    const key = decadeKey;
    if (!key || !meta || !mapLoaded) {
      if (!key) decadeCounts = null;
      return;
    }
    const hit = decadeCache.get(key);
    if (hit) {
      decadeCounts = hit;
      return;
    }
    const files = decadeFiles(meta.manifest, untrack(() => sel), key === "all");
    if (!files.length) return;
    let cancelled = false;
    const t0 = performance.now();
    engine
      .rows<{ decade: number | null; n: number }>(decadeCountsSql(base, files))
      .then((rows) => {
        const v = { key, ...normalizeCounts(rows), ms: performance.now() - t0 };
        decadeCache.set(key, v);
        if (!cancelled) decadeCounts = v;
      })
      .catch(() => {
        if (!cancelled) decadeCounts = null;
      });
    return () => {
      cancelled = true;
    };
  });
  const stripCounts = $derived(decadeCounts && decadeCounts.key === decadeKey ? decadeCounts.decades : null);
  const stripMessage = $derived(
    sel.kind === "taxon"
      ? `${decadeReason}${meta ? ` ${fmt(meta.taxonGroups.find((g) => layerKeyOf(g) === st.layer)?.n ?? NaN)} records in all.` : ""}`
      : live
        ? "Live WoRMS layer: records per decade are not precomputed; drag to filter by decade."
        : !decadesAllowed
          ? decadeReason
          : "",
  );
  function layerKeyOf(g: { rank: string; taxon: string }) {
    return `taxon:${encodeURIComponent(g.rank)}:${encodeURIComponent(g.taxon)}`;
  }
  // the brush mirrors the decade
  $effect(() => {
    brush = st.decade === null ? null : decadeSpan(st.decade);
  });
  function onBrushEnd(r: { v0?: number; v1?: number }) {
    if (!decadesAllowed || r.v0 === undefined || r.v1 === undefined) {
      brush = st.decade === null ? null : decadeSpan(st.decade);
      return;
    }
    const d = decadeAt(r.v0, r.v1);
    brush = decadeSpan(d);
    if (st.decade !== d) {
      st.decade = d;
      st.cell = null;
    }
  }

  // the selected cell (URL `x=`) in the loaded partition ----
  const selected = $derived.by((): SelectedCell | null => {
    const p = partition;
    if (!p || !st.cell) return null;
    const i = p.h3.indexOf(st.cell);
    if (i < 0) return null;
    return {
      h3: p.h3[i],
      res,
      layer: layerText,
      period: st.decade === null ? "All years" : `${st.decade}s`,
      values: Object.fromEntries(INDICATORS.map((ind) => [ind.id, p.values[ind.id][i]])) as SelectedCell["values"],
    };
  });

  // timing and bytes (the footer) ----
  const viewBytes = $derived(
    live ? (aphiaView?.meta.bytes ?? 0) : plan ? (plan.split ? planBytes : (fileRow?.bytes ?? 0)) : 0,
  );

  const releaseInfo = $derived(release);
  function placeNote(): string {
    if (live)
      return inView
        ? "In view: the live layer is requested for the map's bounding box (res 6 and finer)."
        : "Worldwide: the live layer is requested for the whole globe at this resolution.";
    if (!plan) return "";
    return plan.split
      ? `In view: ${plan.files.length} of ${fmt(plan.parentsTotal)} partitions cover the map; the counts are for those.`
      : "Worldwide: the whole layer is one file at this resolution; the counts cover the globe.";
  }

  function goTo(r: Region) {
    handle?.map.flyTo({ center: [r.lon, r.lat], zoom: r.zoom, essential: true });
  }

  async function savePng() {
    if (!handle) return;
    const c = stampPng(handle.snapshot(), {
      title: titleText,
      sub: coverage,
      indicator: parts.indicator.label,
      domain,
      footer: `OBIS ${release?.obis_snapshot ?? ""} · release ${release?.release ?? ""} · obis-hex v${__APP_VERSION__} · ${location.href}`,
      dark: st.theme === "dark",
    });
    await downloadCanvas(c, pngName(st.layer, st.decade, res, st.indicator));
  }

  const cite = $derived(
    citeText({
      release: release?.release ?? null,
      snapshot: release?.obis_snapshot ?? null,
      obisindicators: (release?.obisindicators_version as string | undefined) ?? null,
      appVersion: __APP_VERSION__,
      url: `${location.origin}${location.pathname}${formatHash(st)}`,
    }),
  );
  const permalink = $derived(`${location.origin}${location.pathname}${formatHash(st)}`);
  const gradient = VIRIDIS.map((c) => `rgb(${c.join(",")})`);
  const tabs = TABS.map((id) => ({ id, label: { taxon: "Taxon", place: "Place & scale", indicator: "Indicator", share: "Share" }[id] }));

  // map interaction ----
  function cellAt(info: PickingInfo): SelectedCell | null {
    const p = partition;
    if (!p || !info.picked || info.index < 0 || info.index >= p.rows) return null;
    const i = info.index;
    return {
      h3: p.h3[i],
      res,
      layer: layerText,
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
      labels: st.labels,
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
        st.cell = cellAt(info)?.h3 ?? null;
      },
    });
    bounds = handle.bounds();
    window.addEventListener("hashchange", onHashChange);
    const offTheme = onThemeChange((t) => {
      if (t !== st.theme) st.theme = t;
    });
    const mq = matchMedia("(min-width: 1600px)");
    const mqPhone = matchMedia("(max-width: 640px)");
    const onMq = () => {
      wide = mq.matches;
      wideEnough = !mqPhone.matches;
    };
    mq.addEventListener("change", onMq);
    mqPhone.addEventListener("change", onMq);
    probeH3t(h3tBase).then((ok) => (h3tHealth = ok ? "ok" : "down"));

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
      offTheme();
      mq.removeEventListener("change", onMq);
      mqPhone.removeEventListener("change", onMq);
      handle?.destroy();
      engine.dispose();
    };
  });
</script>

<div class="shell" data-ready={partition && !loading && (health === "ok" || live) && (live || !statsQ || statsSettled === statsQ) ? "1" : "0"}>
  <Header appName="OBIS hex" tagline="biodiversity indicators on H3 hexagons, from Parquet in your browser" appHref="./">
    {#snippet help(close)}
      <button type="button" onclick={() => { helpTopic = "about"; helpOpen = true; close(); }}>About</button>
      <button type="button" onclick={() => { helpTopic = "sources"; helpOpen = true; close(); }}>Data sources</button>
      <button type="button" onclick={() => { helpTopic = "keys"; helpOpen = true; close(); }}>Keyboard</button>
      <a href="https://github.com/ioos/marine_life_data_network/tree/main/eov_taxonomy" target="_blank" rel="noopener" onclick={close}>What defines each EOV? ↗</a>
      <button type="button" disabled title="coming">Guide (coming)</button>
      <button type="button" disabled title="coming">Take the tour (coming)</button>
    {/snippet}
  </Header>

  <section class="title-band">
    <TitleSentence {parts} size={wide ? "lg" : "md"}>
      {#snippet taxon(close)}
        <TaxonPanel bind:st {items} {h3tBase} {h3tHealth} {aphiaInfo} {aphiaAccepted} maxHeight="14rem" onpicked={close} />
      {/snippet}
      {#snippet period(close)}
        <PeriodPicker bind:st allowed={decadesAllowed} reason={decadeReason} onpicked={close} />
      {/snippet}
      {#snippet place(close)}
        <PlacePanel note={placeNote()} maxHeight="12rem" ongo={(r) => { goTo(r); close(); }} />
      {/snippet}
      {#snippet scale()}
        <ScalePanel bind:st autoRes={autoResNow} {res} {resMax} />
      {/snippet}
      {#snippet indicator(close)}
        <IndicatorPanel bind:st {live} more={false} onpicked={close} />
      {/snippet}
      {#snippet line2()}
        {#if domain}
          <div class="legend">
            <Legend colors={gradient} {domain} format={(v: number) => fmt(v)}
              title={`${parts.indicator.label} · ${st.domain === "release" && releaseStats && !live ? "release" : "view"} p02–p98`} />
          </div>
        {/if}
        {#if coverage}<span class="coverage">{coverage}</span>{/if}
        {#if loading}<span class="spin" aria-label="loading"></span>{/if}
        {#if message}<span class="msg">{message}</span>{/if}
        {#if sel.kind === "aphia"}<a href={wormsUrl(sel.id)} target="_blank" rel="noopener">in WoRMS ↗</a>{/if}
      {/snippet}
    </TitleSentence>
  </section>

  <main class="stage" data-cell={selected ? "1" : "0"} bind:clientHeight={stageH}
    style:--ctl-max="{Math.max(160, stageH - 24 - (st.timeFolded ? 56 : stripH + 64))}px">
    <div class="map" bind:this={mapEl}></div>

    <div class="map-tools">
      <button type="button" class="tool" aria-pressed={st.proj === "globe"}
        title={st.proj === "globe" ? "Flat map" : "Globe"} aria-label={st.proj === "globe" ? "Switch to the flat map" : "Switch to the globe"}
        onclick={() => (st.proj = st.proj === "globe" ? "flat" : "globe")}>
        {#if st.proj === "globe"}
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M2 8h12M8 3.5v9" stroke="currentColor" stroke-width="1" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4" /><ellipse cx="8" cy="8" rx="2.6" ry="6" fill="none" stroke="currentColor" stroke-width="1" /><path d="M2 8h12" stroke="currentColor" stroke-width="1" /></svg>
        {/if}
      </button>
    </div>

    {#if legacyNotice || health === "down"}
      <div class="notices">
        {#if legacyNotice}<Notice kind="info" ondismiss={() => (legacyNotice = "")}>{legacyNotice}</Notice>{/if}
        {#if health === "down"}<Notice kind="error">Data release unavailable: {healthError} ({base})</Notice>{/if}
      </div>
    {/if}

    <Controls id="controls" title="controls" {tabs} width={400}
      bind:active={() => st.tab, (v) => (st.tab = ((TABS as readonly string[]).includes(v ?? "") ? v : "taxon") as Tab)}
      bind:collapsed={st.ctlFolded}>
      {#snippet panel(id)}
        {#if id === "taxon"}
          <TaxonPanel bind:st {items} {h3tBase} {h3tHealth} {aphiaInfo} {aphiaAccepted} />
        {:else if id === "place"}
          <div class="tab">
            <PlacePanel note={placeNote()} maxHeight="9rem" ongo={goTo} />
            <div>
              <span class="mbon-label">hexagon size</span>
              <ScalePanel bind:st autoRes={autoResNow} {res} {resMax} />
            </div>
            <div>
              <span class="mbon-label">period</span>
              <PeriodPicker bind:st allowed={decadesAllowed} reason={decadeReason} />
            </div>
            <div>
              <span class="mbon-label">projection</span>
              <div class="seg">
                <button type="button" class="segb" aria-pressed={st.proj === "flat"} onclick={() => (st.proj = "flat")}>flat</button>
                <button type="button" class="segb" aria-pressed={st.proj === "globe"} onclick={() => (st.proj = "globe")}>globe</button>
              </div>
            </div>
          </div>
        {:else if id === "indicator"}
          <IndicatorPanel bind:st {live} />
        {:else}
          <SharePanel {permalink} {cite} onpng={savePng} sql={sqlText} statsQuery={live ? "" : statsQuery} isUrl={live}>
            {#snippet timing()}
              {#if live && partition && aphiaView}
                <span title={aphiaView.url}>h3t subtree aphiaid={sel.kind === "aphia" ? sel.id : ""} res {aphiaView.res}{st.decade === null ? "" : ` ${st.decade}s`}{aphiaView.url.includes("bbox=") ? " (view bbox)" : ""}</span>
                <span>{fmtBytes(aphiaView.meta.bytes)} · {fmt(aphiaView.meta.rows ?? partition.rows)} rows</span>
                <span>server {aphiaView.meta.queryMs === null ? "—" : `${fmt(aphiaView.meta.queryMs)} ms`} · {aphiaView.fetched ? `${fmt(Math.round(aphiaView.meta.fetchMs))} ms round trip` : "cached"} · {Math.round(partition.ms)} ms</span>
              {:else if partition && plan?.split}
                <span title={plan.files.map((f) => f.path).join("\n")}>{plan.files.length} of {fmt(plan.parentsTotal)} partitions (res {res} by parent cell)</span>
                <span>{fmtBytes(planBytes)} · {fmt(partition.rows)} cells · {Math.round(partition.ms)} ms</span>
                <span>{fetchedLast} fetched · {engine.partsCached} cached</span>
              {:else if partition && fileRow}
                <span title={partition.url}>{fileRow.path}</span>
                <span>{fmtBytes(fileRow.bytes)} · {fmt(partition.rows)} cells · {Math.round(partition.ms)} ms</span>
              {/if}
              {#if decadeCounts}<span>records per decade: {Math.round(decadeCounts.ms)} ms (sum of n over the res-1 decade files)</span>{/if}
              <span>DuckDB-WASM 1.32.0</span>
            {/snippet}
            {#snippet stats()}
              {#if vstats}
                <table class="stats">
                  <tbody>
                    <tr><td>hexagons</td><td>{fmt(vstats.cells)}{#if vstats.valued !== vstats.cells}&nbsp;({fmt(vstats.valued)} with a value){/if}</td></tr>
                    <tr><td>min · max</td><td>{fmt(vstats.min)} · {fmt(vstats.max)}</td></tr>
                    <tr><td>view p02–p98</td><td>{fmt(vstats.p02)} – {fmt(vstats.p98)}</td></tr>
                    {#if releaseStats}
                      <tr><td>release p02–p98</td><td>{fmt(releaseStats.p02)} – {fmt(releaseStats.p98)}</td></tr>
                    {/if}
                  </tbody>
                </table>
              {/if}
            {/snippet}
          </SharePanel>
        {/if}
      {/snippet}
    </Controls>

    <Pane title="cell" id="cell" anchor="top-right" offset={{ x: 0, y: 128 }} width={260}
      pillLabel={selected ? "cell ●" : "cell"}
      bind:collapsed={() => !st.cellOpen, (v) => (st.cellOpen = !v)}>
      <CellPanel cell={selected} indicator={st.indicator} p50={vstats ? vstats.p50 : null} />
    </Pane>

    {#if helpOpen}
      <Pane title={helpTopic === "about" ? "about" : helpTopic === "sources" ? "data sources" : "keyboard"} id="help"
        anchor="top-right" offset={{ x: 280, y: 0 }} width={380} closable collapsible={false} bind:open={helpOpen}>
        <div class="help">
          {#if helpTopic === "about"}
            <p><b>OBIS hex</b> maps biodiversity indicators (ES(50), species richness, Shannon, Simpson, records) of
              OBIS occurrence records on H3 hexagons. The indicators are precomputed by
              <a href="https://github.com/marinebon/obisindicators" target="_blank" rel="noopener">obisindicators</a> into a
              Parquet release; your browser reads only the files the view needs, with DuckDB-WASM, and nothing runs on a server
              (except the live <i>Any taxon (WoRMS)</i> layer).</p>
            <p>The title is the control: click a bold word to change it. Every view is a link.</p>
            <p>A product of the <a href="https://marinebon.org" target="_blank" rel="noopener">Marine Biodiversity Observation Network</a>,
              built by <a href="https://oceanmetrics.io" target="_blank" rel="noopener">Ocean Metrics</a>. v{__APP_VERSION__}.</p>
          {:else if helpTopic === "sources"}
            <ul>
              <li><a href="https://obis.org" target="_blank" rel="noopener">OBIS</a>, the Ocean Biodiversity Information System:
                occurrence records{release?.obis_snapshot ? `, snapshot ${release.obis_snapshot}` : ""}; release {release?.release ?? "…"}.</li>
              <li><a href="https://www.marinespecies.org" target="_blank" rel="noopener">WoRMS</a>, the World Register of Marine
                Species: the taxonomy behind taxon groups, EOVs and the live AphiaID layer.</li>
              <li>Essential Ocean Variables as defined by the
                <a href="https://github.com/ioos/marine_life_data_network/tree/main/eov_taxonomy" target="_blank" rel="noopener">IOOS Marine
                Life Data Network</a>: root AphiaIDs per EOV, every descendant included
                (<a href="https://github.com/ioos/marine_life_data_network/tree/main/eov_taxonomy" target="_blank" rel="noopener">what defines each EOV?</a>).</li>
              <li><a href="https://h3geo.org" target="_blank" rel="noopener">H3</a> hexagons; basemap © CARTO, © OpenStreetMap contributors.</li>
            </ul>
          {:else}
            <ul>
              <li><Kbd>Tab</Kbd> moves between controls; <Kbd>←</Kbd> <Kbd>→</Kbd> move between the Controls tabs.</li>
              <li>In a title chip, <Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>Enter</Kbd> pick; <Kbd>Esc</Kbd> closes.</li>
              <li>On a pane title, arrow keys move it, <Kbd>Home</Kbd> sends it home; <Kbd>Esc</Kbd> restores an expanded pane.</li>
              <li>On the Time strip, <Kbd>←</Kbd> <Kbd>→</Kbd> move the decade; <Kbd>Esc</Kbd> returns to all years.</li>
              <li>The map: drag to pan, scroll or <Kbd>+</Kbd> <Kbd>−</Kbd> to zoom.</li>
            </ul>
          {/if}
        </div>
      </Pane>
    {/if}

    <TimeStrip title="records per decade" domain={DECADE_DOMAIN} bind:height={stripH} minHeight={48} maxHeight={240}
      bind:brush bind:collapsed={st.timeFolded}
      onbrushend={onBrushEnd}
      onclear={() => { if (st.decade !== null) { st.decade = null; st.cell = null; } }}>
      {#snippet children({ width, height })}
        <DecadeBars {width} {height} counts={stripCounts} decade={st.decade} disabled={!decadesAllowed} message={stripMessage} />
      {/snippet}
    </TimeStrip>
  </main>

  <Footer sourceHref="https://github.com/oceanmetrics/obis-hex">
    {#snippet release()}{#if releaseInfo}OBIS {releaseInfo.obis_snapshot ?? ""} · release {releaseInfo.release} · v{__APP_VERSION__}{:else}v{__APP_VERSION__}{/if}{/snippet}
    {#snippet timing()}{#if partition}{fmtBytes(viewBytes)} · {Math.round(partition.ms)} ms{:else}…{/if}{/snippet}
  </Footer>
</div>
