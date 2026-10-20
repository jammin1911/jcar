<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();
</script>

<SubHeader title="Charts" />

{#snippet tile(t: (typeof data.fuelTiles)[number])}
  {#if t.href}
    <a class="chart-tile" href={t.href}>
      <div class="box">
        {#if t.cmp}
          <svg viewBox="0 0 100 80" preserveAspectRatio="none">
            <rect x="22" y={80 - (t.cmp.first / t.cmp.max) * 68} width="16" height={(t.cmp.first / t.cmp.max) * 68} fill="#7e57c2" />
            <rect x="58" y={80 - (t.cmp.second / t.cmp.max) * 68} width="16" height={(t.cmp.second / t.cmp.max) * 68} fill="#42a5f5" />
          </svg>
        {:else}
          <svg viewBox="0 0 100 80" preserveAspectRatio="none">
            <polyline points={t.points} fill="none" stroke="#33691e" stroke-width="1" />
          </svg>
        {/if}
      </div>
      <div class="cap">{t.cap}</div>
    </a>
  {:else}
    <div class="chart-tile">
      <div class="box"><span class="nodata">No data available!</span></div>
      <div class="cap">{t.cap}</div>
    </div>
  {/if}
{/snippet}

<div class="chart-section">Fuel-Ups</div>
<div class="chart-grid">
  {#each data.fuelTiles as t}
    {@render tile(t)}
  {/each}
</div>

<div class="chart-section">Services &amp; Expenses</div>
<div class="chart-grid">
  {#each data.seTiles as t}
    {@render tile(t)}
  {/each}
</div>

<div class="chart-section">Overall</div>
<div class="chart-grid">
  {#each data.overallTiles as t}
    {@render tile(t)}
  {/each}
</div>

<style>
  a.chart-tile { text-decoration: none; color: inherit; display: block; cursor: pointer; }
</style>
