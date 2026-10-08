<script lang="ts">
  // where: a sea or ocean (a camera), or one of the gazetteer's 14,000+ places (outlined on the map,
  // credited, the map fitted to its bounds). One kit Picker: the "Seas & oceans" presets first, then a
  // group per gazetteer collection in the manifest's order. The Picker's own search box is the one
  // search box; its text is read off the input so the list can be ranked and capped here
  // (`groupsFor`), and every item carries that text as `keywords` so the Picker's own substring filter
  // lets them all through. The index loads the first time this panel opens (PlaceGate).
  import { Picker } from "@marinebon/ui";
  import type { PickerItem } from "@marinebon/ui";
  import { REGIONS, type Region } from "../lib/view/regions";
  import { fold, groupsFor, placeKey, resolvePlace, type PlaceData, type PlaceRow } from "../lib/places/index";

  let {
    note,
    maxHeight = "12rem",
    placeId = null,
    placeColl = null,
    data = null,
    error = "",
    onsea,
    onplace,
  }: {
    note: string;
    maxHeight?: string;
    /** the outlined place (`pl=`) and its collection (`pc=`) */
    placeId?: string | null;
    placeColl?: string | null;
    /** the manifest and index, once loaded */
    data?: PlaceData | null;
    /** why the gazetteer could not be loaded */
    error?: string;
    onsea: (r: Region) => void;
    onplace: (row: PlaceRow) => void;
  } = $props();

  let value = $state<string | null>(null);
  let q = $state("");
  let host: HTMLDivElement;

  const SEA = "s:";
  const PLACE = "p:";
  const MORE = "m:";

  const selected = $derived(data && placeId ? resolvePlace(placeId, data.rows, placeColl) : null);
  // a link with pl= (or a hash change) selects its place in the picker; a sea stays picked until another is
  $effect(() => {
    if (selected) value = PLACE + placeKey(selected.collection, selected.place_id);
  });

  const built = $derived.by(() => {
    const kw = q.trim().toLowerCase();
    const words = fold(q).split(/\s+/).filter(Boolean);
    const rows = new Map<string, PlaceRow>();
    const items: PickerItem[] = REGIONS.filter((r) => words.every((w) => fold(r.label).includes(w))).map((r) => ({
      id: SEA + r.id,
      label: r.label,
      group: r.group,
      keywords: kw,
    }));
    if (data) {
      for (const g of groupsFor(data.rows, data.layers, q, { selected })) {
        for (const r of g.items) {
          const id = PLACE + placeKey(r.collection, r.place_id);
          rows.set(id, r);
          items.push({ id, label: r.name, group: g.title, keywords: kw });
        }
        if (g.more > 0)
          items.push({ id: MORE + g.slug, label: `… ${g.more.toLocaleString()} more, type to search`, group: g.title, keywords: kw, disabled: true });
      }
    }
    return { items, rows };
  });

  // the Picker's search text, read off its input (it exposes no query); Esc clears it without an event
  $effect(() => {
    const input = host?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) return;
    const sync = () => (q = input.value);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimeout(sync, 0);
    };
    input.addEventListener("input", sync);
    input.addEventListener("keydown", esc);
    return () => {
      input.removeEventListener("input", sync);
      input.removeEventListener("keydown", esc);
    };
  });

  // bring the selected row into view when the list opens (see TaxonPanel)
  $effect(() => {
    void value;
    void built.items.length;
    if (q) return;
    const t = setTimeout(() => {
      const list = host?.querySelector<HTMLElement>(".list");
      const opt = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      if (list && opt) list.scrollTop = Math.max(0, opt.offsetTop - list.clientHeight / 3);
    }, 60);
    return () => clearTimeout(t);
  });

  function pick(it: PickerItem) {
    if (it.id.startsWith(SEA)) {
      const r = REGIONS.find((x) => x.id === it.id.slice(SEA.length));
      if (r) onsea(r);
    } else if (it.id.startsWith(PLACE)) {
      const row = built.rows.get(it.id);
      if (row) onplace(row);
    }
  }
</script>

<div class="place" bind:this={host}>
  <p class="note">{note}</p>
  <p class="note">
    {#if data}
      {data.rows.length.toLocaleString()} places from the Ocean Metrics gazetteer; the one you pick is outlined and credited.
    {:else if error}
      The gazetteer could not be loaded ({error}); seas and oceans still work.
    {:else}
      Loading the Ocean Metrics gazetteer (14,000+ places)…
    {/if}
  </p>
  <Picker items={built.items} bind:value label="places" placeholder="Search a sea, sanctuary, lease, line…" {maxHeight} modeToggle={false}
    onselect={pick}>
    {#snippet row(it)}
      {@const r = built.rows.get(it.id)}
      <span class="lab">{it.label}</span>
      {#if r && r.place_id !== r.name}<span class="pid" title={r.place_id}>{r.place_id}</span>{/if}
    {/snippet}
  </Picker>
</div>

<style>
  .place { display: flex; flex-direction: column; gap: var(--space-2); }
  .note { margin: 0; font: var(--type-small); color: var(--text-body); }
  .lab { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pid { flex: none; max-width: 38%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--text-xs) / 1 var(--font-mono); color: var(--text-muted); }
</style>
