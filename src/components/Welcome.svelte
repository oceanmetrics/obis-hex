<script lang="ts">
  // "Start here": a small card over the map on a first visit (and from Help ▾), with two doors and
  // three worked questions. Each is a link to a view (an href with the hash), so it can be opened in
  // a new tab, and a click on it closes the card.
  import { Button } from "@marinebon/ui";
  import { DOORS, QUESTIONS, type StartView } from "../lib/help/start";

  let {
    href,
    onclose,
    ontour,
  }: { href: (v: StartView) => string; onclose: () => void; ontour: () => void } = $props();

  let card: HTMLElement;
  $effect(() => {
    card?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  });
</script>

<!-- Esc closes it (App.svelte's key handler) -->
<section class="welcome" bind:this={card} aria-labelledby="welcome-t">
  <header>
    <h2 id="welcome-t" class="mbon-label">start here</h2>
    <button type="button" class="x" aria-label="Close the welcome card" onclick={onclose}>×</button>
  </header>
  <p class="lead">Where in the ocean have we recorded the most kinds of life? Each hexagon summarises the
    OBIS records inside it.</p>
  <div class="doors">
    {#each DOORS as d (d.label)}
      <a class="door" href={href(d)} onclick={onclose}>{d.label}</a>
    {/each}
  </div>
  <span class="mbon-label">or ask</span>
  <ul>
    {#each QUESTIONS as q (q.label)}
      <li><a href={href(q)} onclick={onclose}>{q.label}</a></li>
    {/each}
  </ul>
  <div class="row">
    <Button variant="quiet" size="sm" onclick={() => { onclose(); ontour(); }}>Take the tour</Button>
    <Button variant="quiet" size="sm" onclick={onclose}>Just the map</Button>
  </div>
</section>

<style>
  .welcome {
    position: absolute; z-index: 30; left: 50%; top: 18%; transform: translateX(-50%);
    width: min(25rem, calc(100% - 24px)); box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-3) var(--space-4) var(--space-4);
    background: var(--pane-bg); color: var(--text-body);
    border: 1px solid var(--pane-border); border-radius: var(--radius-md); box-shadow: var(--shadow-xl);
    font: var(--type-small);
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; }
  .x { border: 0; background: transparent; color: var(--text-muted); font-size: 1.3rem; line-height: 1; cursor: pointer; }
  .lead { margin: 0; font: var(--fw-medium) var(--text-base) / 1.35 var(--font-sans); color: var(--text-strong); }
  .doors { display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-1) 0 var(--space-2); }
  .door {
    display: block; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    background: var(--brand); color: var(--on-brand); font: var(--fw-semibold) var(--text-sm) / 1.3 var(--font-sans);
  }
  .door:hover { background: var(--brand-hover); text-decoration: none; }
  ul { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: var(--space-1); }
  .row { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-1); }
  @media (max-width: 640px) { .welcome { top: 12px; } }
</style>
