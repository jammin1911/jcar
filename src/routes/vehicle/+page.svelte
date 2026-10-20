<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();
</script>

<SubHeader title="Vehicle Details" />

{#if data.isOwner}
  <div class="active-note">This vehicle is active. <a class="edit-link" href="/vehicle/new?edit={data.vehicleId}">Edit</a></div>
{:else}
  <div class="active-note">Shared with you by {data.ownerName}.</div>
{/if}

<div class="kv">
  {#each data.top as [k, val]}
    <div class="kv-row"><span>{k}</span><span class="v">{val}</span></div>
  {/each}
  <div class="kv-sep"></div>
  {#each data.units as [k, val]}
    <div class="kv-row"><span>{k}</span><span class="v">{val}</span></div>
  {/each}
  <div class="kv-sep"></div>
  {#each data.rest as [k, val]}
    <div class="kv-row"><span>{k}</span><span class="v">{val}</span></div>
  {/each}
</div>

<div class="stat-head">Purchased</div>
<div class="kv">
  {#each data.purchased as [k, val]}
    <div class="kv-row"><span>{k}</span><span class="v">{val}</span></div>
  {/each}
</div>

<div class="stat-head">Sold</div>
<div class="kv">
  {#each data.sold as [k, val]}
    <div class="kv-row"><span>{k}</span><span class="v">{val}</span></div>
  {/each}
</div>

<div class="parts-head">
  <span>Vehicle Parts</span>
  <a class="parts-add" href="/vehicle/parts/new" aria-label="Add vehicle part">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg>
  </a>
</div>

{#if data.parts.length === 0}
  <p class="parts-empty">Here you can record the specification of your vehicle parts for later reference...</p>
  <p class="parts-empty">You've not entered any parts for this vehicle yet.</p>
{:else}
  <div class="parts-list">
    {#each data.parts as p}
      <div class="part-row">
        <span class="part-main">
          <span class="part-name">{p.name}</span>
          {#if p.detail}<span class="part-detail">{p.detail}</span>{/if}
        </span>
        {#if data.isOwner}
          <a class="part-edit" href="/vehicle/parts/new?edit={p.id}">Edit</a>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if data.isOwner}
  <form method="POST" action="?/deleteVehicle" class="delete-form" onsubmit={(e) => { if (!confirm('Delete this vehicle and ALL its records and parts? This cannot be undone.')) e.preventDefault(); }}>
    <button type="submit" class="delete-btn">Delete Vehicle</button>
  </form>
{/if}

<style>
  .parts-head {
    position: relative;
    text-align: center;
    font-weight: 700;
    font-size: 17px;
    color: #444;
    padding: 10px 0 8px;
    border-bottom: 1px solid var(--line);
  }
  .parts-add {
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
  .parts-add svg { width: 15px; height: 15px; display: block; }
  .parts-empty {
    text-align: center;
    color: #999;
    font-size: 16px;
    line-height: 1.45;
    margin: 26px 34px 0;
  }
  .parts-list { padding: 4px 16px 10px; }
  .part-row { padding: 9px 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .part-edit {
    flex: 0 0 auto;
    color: var(--teal-dark);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid var(--teal);
    border-radius: 4px;
    padding: 4px 14px;
    margin-top: 2px;
  }
  .part-main { min-width: 0; overflow-wrap: anywhere; }
  .part-name { display: block; font-size: 16.5px; font-weight: 700; }
  .part-detail { display: block; color: #999; font-size: 14.5px; margin-top: 1px; }
  .edit-link { color: var(--teal-dark); margin-left: 6px; }
  .delete-form { padding: 22px 16px 30px; text-align: center; }
  .delete-btn { background: none; border: 0; color: #c62828; font-size: 15.5px; cursor: pointer; font-family: inherit; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .parts-head { color: #c9ccd1; }
</style>
