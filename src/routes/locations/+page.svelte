<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  // Reached two ways: from a record form's Location field
  // (?from=/service), where tapping a location sends it back to the
  // form filled in, and from Settings, Manage Locations (no ?from),
  // where tapping opens it for editing.
  let { data } = $props();
  const from = data.from;
</script>

<SubHeader title="Locations" backHref={data.backHref} />

<div class="loc-head">
  <span>Locations</span>
  <a class="loc-add" href="/locations/new{from ? `?from=${encodeURIComponent(from)}` : ''}" aria-label="Add location">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg>
  </a>
</div>

{#if data.locations.length === 0}
  <p class="loc-empty">You've not added any locations yet.</p>
{:else}
  <div class="loc-list">
    {#each data.locations as l}
      {#if from}
        <a class="loc-item" href="{from}{from.includes('?') ? '&' : '?'}locationId={l.id}">
          <span class="loc-name">{l.label}</span>
          {#if l.sub}<span class="loc-notes">{l.sub}</span>{/if}
          {#if l.notes}<span class="loc-notes">{l.notes}</span>{/if}
        </a>
      {:else}
        <a class="loc-item" href="/locations/{l.id}">
          <span class="loc-name">{l.label}</span>
          {#if l.sub}<span class="loc-notes">{l.sub}</span>{/if}
          {#if l.notes}<span class="loc-notes">{l.notes}</span>{/if}
        </a>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .loc-head {
    position: relative;
    text-align: center;
    font-weight: 700;
    font-size: 17px;
    color: #444;
    padding: 10px 0 8px;
    border-bottom: 1px solid var(--line);
  }
  .loc-add {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--teal);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .loc-add svg { width: 15px; height: 15px; display: block; }
  .loc-empty {
    text-align: center;
    color: #999;
    font-size: 16px;
    line-height: 1.45;
    margin: 26px 34px 0;
  }
  .loc-list { padding: 4px 16px 24px; }
  .loc-item {
    display: block;
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
    color: var(--ink);
  }
  .loc-name { display: block; font-size: 16.5px; font-weight: 700; }
  .loc-name { overflow-wrap: anywhere; }
  .loc-notes { display: block; color: #999; font-size: 14.5px; margin-top: 2px; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .loc-head { color: #c9ccd1; }
</style>
