<script lang="ts">
  // legend (viridis ramp over the active domain) + stats of what is loaded.
  import { VIRIDIS, type Domain, type ViewStats } from "../lib/color/ramp";
  import type { StatsRow } from "../lib/release/release";
  import { fmt } from "../lib/format";

  let {
    title,
    link = null,
    domain,
    domainSource,
    vstats,
    releaseStats,
    loading,
    message,
  }: {
    title: string;
    /** an external link after the title (the WoRMS page of a live AphiaID layer) */
    link?: { href: string; text: string } | null;
    domain: Domain | null;
    domainSource: string;
    vstats: ViewStats | null;
    releaseStats: StatsRow | null;
    loading: boolean;
    message: string;
  } = $props();

  const gradient = `linear-gradient(to right, ${VIRIDIS.map((c) => `rgb(${c.join(",")})`).join(", ")})`;
</script>

<section class="panel stats" aria-live="polite">
  <div class="title">{title}{#if link}&nbsp;<a href={link.href} target="_blank" rel="noopener">{link.text}</a>{/if}{#if loading}<span class="spin" aria-label="loading"></span>{/if}</div>
  {#if message}<div class="msg">{message}</div>{/if}
  {#if domain}
    <div class="ramp" style:background={gradient}></div>
    <div class="ramp-labels"><span>≤ {fmt(domain[0])}</span><span>{domainSource}</span><span>≥ {fmt(domain[1])}</span></div>
  {/if}
  {#if vstats}
    <table>
      <tbody>
        <tr><td>cells</td><td>{fmt(vstats.cells)}{#if vstats.valued !== vstats.cells}&nbsp;({fmt(vstats.valued)} with a value){/if}</td></tr>
        <tr><td>min · max</td><td>{fmt(vstats.min)} · {fmt(vstats.max)}</td></tr>
        <tr><td>p02–p98</td><td>{fmt(vstats.p02)} – {fmt(vstats.p98)}</td></tr>
        {#if releaseStats}
          <tr class="dim"><td>release p02–p98</td><td>{fmt(releaseStats.p02)} – {fmt(releaseStats.p98)}</td></tr>
        {/if}
      </tbody>
    </table>
  {/if}
</section>
