<script lang="ts">
  // the always-loaded stub of the Place panel: asks the app to load the gazetteer (manifest, index and
  // the picker, a lazy chunk) when it opens, and shows the picker once that chunk is here.
  import { onMount, type Component } from "svelte";
  import type { PlaceData, PlaceRow } from "../lib/places/index";
  import type { Region } from "../lib/view/regions";

  let {
    panel = null,
    note,
    onneed,
    ...rest
  }: {
    panel?: Component<any> | null;
    note: string;
    onneed: () => void;
    maxHeight?: string;
    placeId?: string | null;
    placeColl?: string | null;
    data?: PlaceData | null;
    error?: string;
    onsea: (r: Region) => void;
    onplace: (row: PlaceRow) => void;
  } = $props();

  onMount(() => onneed());
</script>

{#if panel}
  {@const Panel = panel}
  <Panel {note} {...rest} />
{:else}
  <div class="place">
    <p class="note">{note}</p>
    <p class="note">Loading the Ocean Metrics gazetteer (14,000+ places)…</p>
  </div>
{/if}

<style>
  .place { display: flex; flex-direction: column; gap: var(--space-2); }
  .note { margin: 0; font: var(--type-small); color: var(--text-body); }
</style>
