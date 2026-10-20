<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();
</script>

<SubHeader title="Sharing" />

<p class="sh-intro">
  Share your vehicles with other jCar users. They get an invite here and on their
  Sharing page - nothing is shared until they accept.
</p>

{#if form?.ok}<div class="form-banner-info">{form.ok}</div>{/if}
{#if form?.error}<div class="form-banner-error">{form.error}</div>{/if}

<div class="stat-head">Shared with me</div>
<div class="sh-list">
  {#if data.incoming.length === 0}
    <p class="sh-empty">No vehicles have been shared with you.</p>
  {/if}
  {#each data.incoming as s}
    <div class="sh-row">
      <div class="sh-main">
        <div class="sh-name">
          {s.vehicleName}
          {#if s.status === 'pending'}<span class="sh-status pending">Invited</span>{/if}
          {#if !s.vehicleActive}<span class="sh-status">Disabled</span>{/if}
        </div>
        <div class="sh-sub">shared by {s.ownerName}</div>
      </div>
      <div class="sh-actions">
        {#if s.status === 'pending'}
          <form method="POST" action="?/accept">
            <input type="hidden" name="shareId" value={s.shareId} />
            <button type="submit" class="sh-btn solid">Accept</button>
          </form>
          <form method="POST" action="?/deny">
            <input type="hidden" name="shareId" value={s.shareId} />
            <button type="submit" class="sh-btn">Deny</button>
          </form>
        {:else}
          <form method="POST" action="?/leave">
            <input type="hidden" name="shareId" value={s.shareId} />
            <button type="submit" class="sh-btn">Remove</button>
          </form>
        {/if}
      </div>
    </div>
  {/each}
</div>

<div class="stat-head">My vehicles</div>
<div class="sh-list">
  {#if data.mine.length === 0}
    <p class="sh-empty">You don't own any vehicles yet.</p>
  {/if}
  {#each data.mine as v}
    <div class="sh-veh">
      <div class="sh-row">
        <div class="sh-main">
          <div class="sh-name">
            {v.name}
            {#if !v.active}<span class="sh-status">Disabled</span>{/if}
          </div>
          {#if v.sub}<div class="sh-sub">{v.sub}</div>{/if}
        </div>
        <div class="sh-actions">
          <details class="sh-details">
            <summary class="sh-btn">Share</summary>
            <form method="POST" action="?/share" class="sh-share-form">
              <input type="hidden" name="vehicleId" value={v.id} />
              <input
                type="email"
                name="email"
                placeholder="Their email address"
                autocomplete="off"
                required
              />
              <button type="submit" class="sh-btn solid">Send Invite</button>
            </form>
          </details>
        </div>
      </div>
      {#each v.shares as s}
        <div class="sh-sharee">
          <span class="sh-sharee-name">{s.displayName} <span class="sh-sharee-email">({s.email})</span></span>
          <span class="sh-status" class:pending={s.status === 'pending'}>{s.status === 'pending' ? 'Invited' : 'Accepted'}</span>
          <form method="POST" action="?/revoke">
            <input type="hidden" name="shareId" value={s.shareId} />
            <button type="submit" class="sh-remove">Remove</button>
          </form>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .sh-intro { color: #999; text-align: center; font-size: 15px; padding: 12px 22px 4px; line-height: 1.45; }
  .sh-list { padding-bottom: 6px; }
  .sh-empty { text-align: center; color: #999; font-size: 15.5px; padding: 10px 20px 16px; }
  .sh-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .sh-veh { border-bottom: 1px solid #eee; }
  .sh-veh .sh-row { padding-bottom: 8px; }
  .sh-list > .sh-row { border-bottom: 1px solid #eee; }
  .sh-main { flex: 1; min-width: 0; }
  .sh-name { font-size: 17.5px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
  .sh-sub { color: #999; font-size: 14px; margin-top: 1px; }
  .sh-status {
    font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 2.5px 7px; border-radius: 999px; background: #eee; color: #888; white-space: nowrap;
  }
  .sh-status.pending { background: #fff3e0; color: #e65100; }
  .sh-actions { display: flex; gap: 8px; flex: 0 0 auto; align-items: flex-start; }
  .sh-btn {
    padding: 8px 12px; font-size: 14.5px; font-weight: 700; border-radius: 4px; cursor: pointer;
    border: 1.5px solid var(--teal); background: #fff; color: var(--teal-dark); font-family: inherit;
    display: inline-block; box-sizing: border-box; white-space: nowrap;
  }
  .sh-btn.solid { background: var(--teal); color: #fff; }
  .sh-details { position: relative; }
  .sh-details summary { list-style: none; }
  .sh-details summary::-webkit-details-marker { display: none; }
  .sh-share-form {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 50;
    background: #fff; border: 1px solid var(--line); border-radius: 8px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22); padding: 12px;
    display: flex; flex-direction: column; gap: 8px; width: 250px;
  }
  .sh-share-form input {
    font-size: 15.5px; padding: 9px 10px; border: 1px solid #bbb; border-radius: 6px;
    font-family: inherit; box-sizing: border-box; width: 100%;
  }
  .sh-sharee {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 14px 10px 26px; font-size: 13px; color: #555;
  }
  .sh-sharee-name { overflow-wrap: anywhere; }
  .sh-sharee-email { color: #999; }
  .sh-sharee form { margin-left: auto; }
  .sh-remove {
    background: none; border: 0; color: #e53935; font-size: 14px; font-weight: 700;
    cursor: pointer; font-family: inherit; padding: 2px 4px;
  }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .sh-name { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .sh-btn { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .sh-btn.solid { background: var(--teal); color: #fff; }
  :global(.phone[data-theme="dark"]) .sh-share-form { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .sh-share-form input { background: #14161a; border-color: #4a4f57; color: var(--ink); }
  :global(.phone[data-theme="dark"]) .sh-veh, :global(.phone[data-theme="dark"]) .sh-list > .sh-row { border-color: #26292f; }
  :global(.phone[data-theme="dark"]) .sh-sharee { color: #c9ccd1; }
  :global(.phone[data-theme="dark"]) .sh-status { background: #2a2e34; color: #9aa0a8; }
  :global(.phone[data-theme="dark"]) .sh-status.pending { background: #3d2c14; color: #ffb74d; }
</style>
