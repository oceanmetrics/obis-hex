<script lang="ts">
  // the query behind the view, copyable (runs as-is in DuckDB CLI/R/Python against the same URL).
  // For a live AphiaID layer it is the subtree request URL instead (`isUrl`).
  let { sql, statsQuery, isUrl = false }: { sql: string; statsQuery: string; isUrl?: boolean } = $props();
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<details class="sql">
  <summary>{isUrl ? "Request" : "SQL"}</summary>
  {#if sql}
    <pre><code>{sql}</code></pre>
    <button onclick={copy}>{copied ? "copied" : "copy"}</button>
    {#if isUrl}
      <p class="dim">Parquet from the h3t subtree service (h3, cell_id, n, sp, shannon, simpson, es);
        add <code>&amp;format=json</code> for JSON.</p>
    {:else if statsQuery}
      <details>
        <summary>ramp domain query (stats.parquet, loaded as table <code>stats</code>)</summary>
        <pre><code>{statsQuery}</code></pre>
      </details>
    {/if}
  {:else}
    <p class="dim">no partition loaded</p>
  {/if}
</details>
