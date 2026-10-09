<script lang="ts">
  // the title sentence: each bold part is a Chip whose popover holds the same control as the Controls
  // tab (passed in as snippets, so both read and write one state), coloured by that tab's pipeline step
  // (0.8.0): the taxon and the indicator are ① Metric (dataset); the period, place and hexagon size
  // are ② Place.
  //   Seabirds (EOV), all years, worldwide, ~12,400 km² hexagons: ES(50)
  import { Chip, Sentence } from "@marinebon/ui";
  import type { Snippet } from "svelte";
  import type { SentenceParts } from "../lib/view/sentence";

  let {
    parts,
    taxon,
    period,
    place,
    scale,
    indicator,
    line2,
    size = "md",
  }: {
    parts: SentenceParts;
    taxon: Snippet<[() => void]>;
    period: Snippet<[() => void]>;
    place: Snippet<[() => void]>;
    scale: Snippet<[() => void]>;
    indicator: Snippet<[() => void]>;
    line2: Snippet;
    size?: "md" | "lg";
  } = $props();
</script>

<div class="view-title">
  <Sentence {size}>
    <Chip label={parts.taxon.label} facet="dataset" title="choose a taxon" width="24rem">
      {#snippet children(close)}{@render taxon(close)}{/snippet}
    </Chip>{#if parts.taxon.qual}<span class="q">{parts.taxon.qual}</span>{/if},
    <Chip label={parts.period.label} facet="place" title="choose a period" width="20rem">
      {#snippet children(close)}{@render period(close)}{/snippet}
    </Chip>,
    <Chip label={parts.place.label} facet="place" title="choose a place" width="20rem">
      {#snippet children(close)}{@render place(close)}{/snippet}
    </Chip>{#if parts.place.qual}<span class="q">{parts.place.qual}</span>{/if},
    <Chip label={parts.scale.label} facet="place" title="choose the hexagon size" width="20rem">
      {#snippet children(close)}{@render scale(close)}{/snippet}
    </Chip>:
    <Chip label={parts.indicator.label} facet="dataset" title="choose an indicator" width="22rem">
      {#snippet children(close)}{@render indicator(close)}{/snippet}
    </Chip>
    {#snippet sub()}{@render line2()}{/snippet}
  </Sentence>
</div>

<style>
  .q { margin-left: 0.25em; font-weight: var(--fw-regular); color: var(--text-body); }
</style>
