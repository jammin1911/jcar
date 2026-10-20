<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();
</script>

<SubHeader title="Predictions" />

<p class="disclaimer">Disclaimer: The calculated values here are just estimations. Use them at your own risk!</p>

<div class="kv">
  {#each data.rows as r}
    <div class="kv-row">
      <span>{r.k}</span>
      <span class="v">{r.v}{#if r.small}<small>{r.small}</small>{/if}</span>
    </div>
  {/each}
</div>
