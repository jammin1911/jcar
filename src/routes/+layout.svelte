<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { afterNavigate, onNavigate } from '$app/navigation';
  import { armEagerPreload, installPreloadGuard } from '$lib/preloadGuard';

  let { data, children } = $props();

  // Page slide transitions (the CSS lives in app.css). The browser
  // snapshots the old and new page and slides the snapshots on the
  // compositor, so it runs at full frame rate with no script per
  // frame. The direction is stamped on the root element first:
  // heading to the dashboard is a back slide (this page slides away
  // to the right and reveals it), anything else is a forward slide
  // (the new page slides in from the right). Browsers without view
  // transitions, and anyone with reduced motion set, just get the
  // plain instant swap like before.
  onNavigate((navigation) => {
    if (!data.inApp) return;
    // Phone width screens only. On anything wider the column sits
    // in a big window and the slide looks wrong, so desktop keeps
    // the plain instant swap. Matches the CSS media query in
    // app.css, which also covers full page loads.
    if (window.innerWidth > 480) return;
    if (!('startViewTransition' in document)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigation.willUnload) return;
    const from = navigation.from?.url.pathname;
    const to = navigation.to?.url.pathname;
    if (!to || from === to) return;
    document.documentElement.dataset.nav = to === '/' ? 'back' : 'forward';
    return new Promise<void>((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

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

<div class="phone" class:vt={data.inApp} data-theme={data.theme}>
  <main>
    {@render children()}
  </main>
</div>
