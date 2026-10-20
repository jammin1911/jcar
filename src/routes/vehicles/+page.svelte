<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();
</script>

<SubHeader title="Manage Vehicles" backHref="/settings" />

<p class="mv-intro">
  Disabled vehicles stay stored with all their records - they just stop appearing in
  the vehicle selector. Deleting a vehicle removes it and all of its records permanently.
</p>

{#if form?.error}<div class="form-banner-error">{form.error}</div>{/if}

{#if data.vehicles.length === 0}
  <p class="mv-empty">You don't own any vehicles yet.</p>
{/if}

{#each data.vehicles as v}
  <div class="mv-row" class:off={!v.active}>
    <div class="mv-main">
      <div class="mv-name">
        {v.name}
        <span class="mv-status" class:on={v.active}>{v.active ? 'Enabled' : 'Disabled'}</span>
        {#if v.costTracking}<span class="mv-status ct">Cost Tracking</span>{/if}
      </div>
      <div class="mv-sub">
        {[v.sub, `${v.recordCount} record${v.recordCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
      </div>
    </div>
    <div class="mv-actions">
      <form method="POST" action="?/edit">
        <input type="hidden" name="vehicleId" value={v.id} />
        <button type="submit" class="mv-btn">Edit</button>
      </form>
      <form method="POST" action="?/toggle">
        <input type="hidden" name="vehicleId" value={v.id} />
        <button type="submit" class="mv-btn">{v.active ? 'Disable' : 'Enable'}</button>
      </form>
      <form
        method="POST"
        action="?/delete"
        onsubmit={(e) => {
          if (!confirm(`Delete ${v.name} and ALL of its records? This can't be undone.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="vehicleId" value={v.id} />
        <button type="submit" class="mv-btn danger">Delete</button>
      </form>
    </div>
  </div>
{/each}

<style>
  .mv-intro { color: #999; text-align: center; font-size: 15px; padding: 12px 22px 4px; line-height: 1.45; }
  .mv-empty { text-align: center; color: #999; font-size: 16px; margin-top: 28px; }
  .mv-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-bottom: 1px solid #eee;
  }
  .mv-row.off .mv-name, .mv-row.off .mv-sub { color: #aaa; }
  .mv-main { flex: 1; min-width: 0; }
  .mv-name { font-size: 17.5px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 8px; }
  .mv-name, .mv-sub { overflow-wrap: anywhere; }
  .mv-status {
    font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 2.5px 7px; border-radius: 999px; background: #eee; color: #888;
  }
  .mv-status.on { background: #e0f2f1; color: #00796b; }
  .mv-status.ct { background: #e3f0fb; color: var(--teal-dark); }
  .mv-sub { color: #999; font-size: 14px; margin-top: 1px; }
  .mv-actions { display: flex; gap: 8px; flex: 0 0 auto; }
  .mv-btn {
    padding: 8px 12px; font-size: 14.5px; font-weight: 700; border-radius: 4px; cursor: pointer;
    border: 1.5px solid var(--teal); background: #fff; color: var(--teal-dark); font-family: inherit;
  }
  .mv-btn.danger { border-color: #e53935; color: #e53935; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .mv-name { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .mv-row { border-bottom-color: #2c3036; }
  :global(.phone[data-theme="dark"]) .mv-btn { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .mv-status { background: #2c3036; color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .mv-status.on { background: #14403c; color: #6fd3c7; }
  :global(.phone[data-theme="dark"]) .mv-status.ct { background: #22314a; color: #a9c8f2; }
</style>
