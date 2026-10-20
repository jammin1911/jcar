<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();
</script>

<SubHeader title="Statistics" />

<div class="stat-head">Overall ({data.overallCount})</div>

<div class="kv">
  {#each data.groups as g, gi}
    {#if gi > 0}<div class="kv-sep"></div>{/if}
    {#each g as [k, v]}
      <div class="kv-row"><span>{k}</span><span class="v">{v}</span></div>
    {/each}
  {/each}
</div>

<div class="stat-head">Fuel-Ups ({data.fuelCount})</div>

<div class="stat-grid">
  {#each data.fuelUps as [k1, v1, k2, v2]}
    <div class="stat-cell"><span>{k1}</span><b>{v1}</b></div>
    <div class="stat-cell"><span>{k2}</span><b>{v2}</b></div>
  {/each}
</div>

<div class="stat-head">Services &amp; Expenses ({data.seCount})</div>

<div class="stat-grid">
  {#each data.servicesExpenses as [k1, v1, k2, v2]}
    <div class="stat-cell"><span>{k1}</span><b>{v1}</b></div>
    <div class="stat-cell"><span>{k2}</span><b>{v2}</b></div>
  {/each}
</div>

<style>
  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 2px 16px 8px;
    row-gap: 13px;
  }
  .stat-cell {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 15.5px;
    min-width: 0;
  }
  .stat-cell b { font-size: 16.5px; }
</style>
