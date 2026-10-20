<script lang="ts">
  import '../app.css';
  let { data, children } = $props();
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
