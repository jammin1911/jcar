<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { armEagerPreload, installPreloadGuard } from '$lib/preloadGuard';

  let { data, children } = $props();

  // Eager preloading with the freshness probe, see $lib/preloadGuard.
  // Off unless the layout data says so (signed in, not the demo).
  onMount(() => {
    if (data.eagerPreload) {
      installPreloadGuard();
      armEagerPreload(location.pathname);
    }
  });
  afterNavigate((nav) => {
    if (data.eagerPreload) armEagerPreload(nav.to?.url.pathname ?? location.pathname);
  });
</script>

<svelte:head>
  {#if data.umami}
    <script defer src={data.umami.scriptUrl} data-website-id={data.umami.websiteId}></script>
  {/if}
</svelte:head>

<div class="phone" data-theme={data.theme}>
  <main>
    {@render children()}
  </main>
</div>
