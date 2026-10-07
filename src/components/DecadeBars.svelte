<script lang="ts">
  // the Time strip's chart: records per decade for the current layer, the selected decade in the
  // accent colour. The strip around it (TimeStrip) owns the brush; the app snaps it to a decade.
  import { DECADES } from "../lib/state/url";
  import type { DecadeCount } from "../lib/release/decades";
  import { fmt } from "../lib/format";

  let {
    width,
    height,
    counts,
    decade,
    disabled,
    message,
  }: {
    width: number;
    height: number;
    counts: DecadeCount[] | null;
    decade: number | null;
    disabled: boolean;
    message: string;
  } = $props();

  const max = $derived(Math.max(1, ...(counts ?? []).map((c) => c.n)));
  const bw = $derived(width / DECADES.length);
  const axis = 14;
  const fmtN = (n: number) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : fmt(n);
</script>

<svg {width} {height} class:disabled role="img" aria-label={counts ? `records per decade: ${counts.map((c) => `${c.decade}s ${fmt(c.n)}`).join(", ")}` : "decades"}>
  {#each DECADES as d, i (d)}
    {@const c = counts?.find((x) => x.decade === d)}
    {@const h = c ? Math.max(c.n > 0 ? 2 : 0, (c.n / max) * (height - axis - 14)) : 0}
    {@const on = decade === d}
    <rect x={i * bw + 3} y={height - axis - h} width={Math.max(1, bw - 6)} height={h} class:on rx="2" />
    {#if c && bw > 44}
      <text x={i * bw + bw / 2} y={height - axis - h - 3} text-anchor="middle" class="n">{fmtN(c.n)}</text>
    {/if}
    <text x={i * bw + bw / 2} y={height - 2} text-anchor="middle" class="tick" class:on>{d}s</text>
  {/each}
</svg>
{#if message}<p class="msg" style:bottom="{axis + 2}px">{message}</p>{/if}

<style>
  svg { display: block; }
  rect { fill: var(--teal-600); opacity: 0.55; }
  rect.on { fill: var(--sun-400); opacity: 1; }
  .disabled rect { opacity: 0.2; }
  text { font: 10px var(--font-mono); fill: var(--text-muted); }
  .tick.on { fill: var(--text-strong); font-weight: 600; }
  .msg { position: absolute; left: 0; right: 0; top: 0; margin: 0; display: grid; place-items: center; text-align: center; padding: 0 var(--space-3); font: var(--type-small); color: var(--text-body); pointer-events: none; }
</style>
