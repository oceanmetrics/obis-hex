<script lang="ts">
  // "Any taxon (WoRMS)": a debounced name search against the h3t taxon endpoint; choosing a row
  // calls onpick(id). Logic (URLs, parsing) lives in src/lib/aphia/h3t.ts.
  import { isSynonym, parseTaxonSearch, SEARCH_MIN, searchUrl, type TaxonHit } from "../lib/aphia/h3t";
  import { fmt } from "../lib/format";

  let { base, onpick }: { base: string; onpick: (id: number) => void } = $props();

  let q = $state("");
  let hits = $state.raw<TaxonHit[]>([]);
  let busy = $state(false);
  let error = $state("");

  $effect(() => {
    const term = q.trim();
    if (term.length < SEARCH_MIN) {
      hits = [];
      error = "";
      busy = false;
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      busy = true;
      try {
        const res = await fetch(searchUrl(base, term), { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        hits = parseTaxonSearch(await res.json());
        error = hits.length ? "" : "no match";
      } catch (err) {
        if (ctl.signal.aborted) return;
        hits = [];
        error = `search failed: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        if (!ctl.signal.aborted) busy = false;
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  });

  function pick(h: TaxonHit) {
    onpick(h.id);
    q = "";
  }
</script>

<div class="aphia-search">
  <input type="search" placeholder="search WoRMS names (≥ 2 letters)…" bind:value={q} aria-label="search WoRMS taxa" />
  {#if busy}<span class="spin" aria-label="searching"></span>{/if}
  {#if hits.length}
    <ul class="hits" role="listbox">
      {#each hits as h (h.id)}
        <li>
          <button class:syn={isSynonym(h)} onclick={() => pick(h)} title={`AphiaID ${h.id}`}>
            <i>{h.scientificName}</i> · {h.rank.toLowerCase()} · {h.status}{#if isSynonym(h)}&nbsp;→ {h.accepted_id}{/if}
            {#if h.records !== null}<span class="rec">{fmt(h.records)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if error}
    <small class="hint">{error}</small>
  {/if}
</div>
