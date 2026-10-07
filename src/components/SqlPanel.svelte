<script lang="ts">
  // the query behind the view, copyable (runs as-is in DuckDB CLI/R/Python against the same URL).
  let { sql, statsQuery }: { sql: string; statsQuery: string } = $props();
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
  <summary>SQL</summary>
  {#if sql}
    <pre><code>{sql}</code></pre>
    <button onclick={copy}>{copied ? "copied" : "copy"}</button>
    {#if statsQuery}
      <details>
        <summary>ramp domain query (stats.parquet, loaded as table <code>stats</code>)</summary>
        <pre><code>{statsQuery}</code></pre>
      </details>
    {/if}
  {:else}
    <p class="dim">no partition loaded</p>
  {/if}
</details>
