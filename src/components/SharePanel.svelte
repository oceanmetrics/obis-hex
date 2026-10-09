<script lang="ts">
  // ③ Share: everything that leaves the app. Copy link, the PNG with the title stamped (the one
  // coral call to action), Cite, and "SQL & timing": the query, the cost and the full stats that
  // used to sit over the map and in the footer.
  import { Button } from "@marinebon/ui";
  import type { Snippet } from "svelte";
  import SqlPanel from "./SqlPanel.svelte";

  let {
    permalink,
    cite,
    onpng,
    sql,
    statsQuery,
    isUrl,
    timing,
    stats,
  }: {
    permalink: string;
    cite: string;
    onpng: () => void;
    sql: string;
    statsQuery: string;
    isUrl: boolean;
    timing: Snippet;
    stats: Snippet;
  } = $props();

  let copied = $state("");
  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ""), 1500);
    } catch {
      copied = "";
    }
  }
</script>

<div class="share">
  <div class="row">
    <Button variant="action" size="sm" onclick={onpng}>Download PNG</Button>
    <Button variant="quiet" size="sm" onclick={() => copy("link", permalink)}>{copied === "link" ? "link copied" : "Copy link"}</Button>
  </div>
  <p class="hint">The PNG carries the title, the colour scale, the release and this link.</p>

  <div>
    <span class="mbon-label">cite this data</span>
    <pre class="cite">{cite}</pre>
    <Button variant="quiet" size="sm" onclick={() => copy("cite", cite)}>{copied === "cite" ? "copied" : "Copy citation"}</Button>
  </div>

  <details class="sqlt">
    <summary>SQL &amp; timing</summary>
    <div class="body">
      <div class="timing">{@render timing()}</div>
      {@render stats()}
      <SqlPanel {sql} {statsQuery} {isUrl} />
    </div>
  </details>
</div>

<style>
  .share { display: flex; flex-direction: column; gap: var(--space-3); }
  .row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .cite { white-space: pre-wrap; overflow-wrap: anywhere; font: var(--text-xs) / 1.45 var(--font-mono); background: var(--bg-tint); border-radius: var(--radius-sm); padding: var(--space-2); margin: var(--space-1) 0; }
  .sqlt summary { cursor: pointer; font: var(--type-small); color: var(--link); }
  .body { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); }
  .timing { display: flex; flex-direction: column; gap: 2px; font: var(--text-xs) / 1.45 var(--font-mono); color: var(--text-body); word-break: break-all; }
</style>
