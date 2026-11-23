<script lang="ts">
  // The green saved pop-up. It floats over the page - the layout under
  // it never moves - and the CSS animation in app.css fades it out on
  // its own after a few seconds. No JS involved.
  let { message, detail }: { message: string; detail?: string | null } = $props();
</script>

<div class="save-toast" role="status">
  <span>{message}</span>
  {#if detail}
    <span class="save-toast-detail">{detail}</span>
  {/if}
</div>
