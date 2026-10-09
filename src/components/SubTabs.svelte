<script lang="ts">
  // the sub-tabs inside one Controls tab (① Metric: Taxon | Indicator). The kit's TabStrip is
  // internal, so this is its markup and keyboard rules (role=tablist/tab, roving tabindex, ← → Home
  // End with automatic activation, ids `<idPrefix>-tab-<id>`) at one step smaller and unfilled, so it
  // reads as a level below the numbered tabs. A candidate for the kit once a second app needs it.
  let {
    tabs,
    active = $bindable(),
    idPrefix,
    panelId,
    label,
  }: {
    tabs: { id: string; label: string }[];
    active: string;
    idPrefix: string;
    panelId: string;
    label: string;
  } = $props();

  let els = $state<HTMLButtonElement[]>([]);
  function select(i: number, focus = false) {
    const t = tabs[i];
    if (!t) return;
    active = t.id;
    if (focus) els[i]?.focus();
  }
  function onkeydown(e: KeyboardEvent, i: number) {
    const n = tabs.length;
    const next = ({ ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // the Controls tab strip is an ancestor's sibling, but keep the keys here
    select(next, true);
  }
</script>

<div class="subtabs" role="tablist" aria-label={label}>
  {#each tabs as t, i (t.id)}
    <button bind:this={els[i]} type="button" role="tab" id="{idPrefix}-tab-{t.id}" aria-selected={t.id === active}
      aria-controls={panelId} tabindex={t.id === active ? 0 : -1} onclick={() => select(i)} onkeydown={(e) => onkeydown(e, i)}
      >{t.label}</button>
  {/each}
</div>

<style>
  .subtabs { display: flex; gap: 2px; padding: 2px; align-self: flex-start; background: var(--bg-tint); border-radius: var(--radius-sm); }
  [role="tab"] {
    padding: 0.35em 0.9em;
    border: 0;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--text-body);
    font: var(--fw-medium) var(--text-xs) / 1.1 var(--font-sans);
    cursor: pointer;
  }
  [role="tab"]:hover { color: var(--text-strong); }
  [role="tab"][aria-selected="true"] {
    background: var(--bg-surface);
    color: var(--link);
    font-weight: var(--fw-semibold);
    box-shadow: var(--shadow-xs), inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  }
</style>
