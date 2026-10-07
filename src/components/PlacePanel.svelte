<script lang="ts">
  // where: go to a named region (moves the map; the viewport still decides what loads) and what
  // the counts cover (worldwide = the whole layer loaded; in view = the partitions covering the map).
  import { Picker } from "@marinebon/ui";
  import { REGIONS, type Region } from "../lib/view/regions";

  let {
    note,
    maxHeight = "12rem",
    ongo,
  }: { note: string; maxHeight?: string; ongo: (r: Region) => void } = $props();

  const items = REGIONS.map((r) => ({ id: r.id, label: r.label, group: r.group }));
  let value = $state<string | null>(null);
</script>

<div class="place">
  <p class="note">{note}</p>
  <Picker {items} bind:value label="places" placeholder="Go to a sea or sanctuary…" {maxHeight} modeToggle={false}
    onselect={(it) => {
      const r = REGIONS.find((x) => x.id === it.id);
      if (r) ongo(r);
    }} />
</div>

<style>
  .place { display: flex; flex-direction: column; gap: var(--space-2); }
  .note { margin: 0; font: var(--type-small); color: var(--text-body); }
</style>
