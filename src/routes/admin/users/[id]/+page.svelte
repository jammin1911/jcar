<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  let { data, form } = $props();
  const u = data.target;
</script>

<SubHeader title="User Details" backHref="/admin/users" />

<div class="identity">
  <div class="id-name">{u.displayName}{#if u.isAdmin} <span class="admin-badge">ADMIN</span>{/if}</div>
  <div class="id-email">{u.email}</div>
</div>

{#if form?.message}<p class="ok-msg">{form.message}</p>{/if}
{#if form?.error}<p class="err-msg">{form.error}</p>{/if}

<div class="form-section">Info</div>
<div class="stat-list">
  <div class="stat-row"><span>Registered</span><b>{u.registered}</b></div>
  <div class="stat-row"><span>Last Login</span><b>{u.lastLogin}</b></div>
  <div class="stat-row"><span>Vehicles Owned</span><b>{u.vehicles}</b></div>
  {#if u.vehicleNames.length}
    <div class="stat-row"><span>Vehicles</span><b class="names">{u.vehicleNames.join(', ')}</b></div>
  {/if}
  <div class="stat-row"><span>Records Added</span><b>{u.records}</b></div>
  <div class="stat-row"><span>Parts</span><b>{u.parts}</b></div>
  <div class="stat-row"><span>Locations</span><b>{u.locations}</b></div>
  <div class="stat-row"><span>Vehicles Shared With Them</span><b>{u.sharedIn}</b></div>
  <div class="stat-row"><span>Active Sessions</span><b>{u.activeSessions}</b></div>
  <div class="stat-row"><span>Content Size (approx.)</span><b>{u.size}</b></div>
</div>

<div class="form-section">Manage</div>
<div class="manage">
  {#if data.plansEnabled}
  <form method="POST" action="?/savePlan" class="manage-form">
    <label>Plan</label>
    <div class="plan-grid">
      <select name="plan" class="plan-input" aria-label="Plan">
        <option value="free" selected={u.plan === 'free'}>Free Plan</option>
        <option value="paid" selected={u.plan === 'paid'}>Paid Plan</option>
      </select>
      <input name="vehicleLimit" type="number" min="1" max="1000" class="plan-input" value={u.vehicleLimit} aria-label="Vehicle limit" />
    </div>
    <div class="plan-grid">
      <input
        name="retentionDays"
        type="number"
        min="1"
        class="plan-input"
        value={u.retentionDays ?? ''}
        placeholder="Retention days (blank = Forever)"
        aria-label="Retention days (blank = Forever)"
      />
      <button type="submit" class="btn">Save Plan</button>
    </div>
    <p class="plan-hint">Vehicle limit and record retention (days) apply immediately. Retention hides older records - nothing is deleted.</p>
  </form>
  {/if}

  <form method="POST" action="?/resetPassword" class="manage-form">
    <label for="pw">Reset Password</label>
    <div class="pw-row">
      <input id="pw" name="password" type="text" autocomplete="off" placeholder="New password (min 6 chars)" />
      <button type="submit" class="btn">Set</button>
    </div>
  </form>

  <form method="POST" action="?/revokeSessions" class="manage-form">
    <button type="submit" class="btn wide">Revoke All Sessions (sign out everywhere)</button>
  </form>

  {#if !u.isAdmin}
    <form
      method="POST"
      action="?/deleteUser"
      class="manage-form"
      onsubmit={(e) => {
        if (!confirm(`Delete ${u.displayName} (${u.email}) and ALL their vehicles, records, parts and locations? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <button type="submit" class="btn danger wide">Delete User</button>
    </form>
  {/if}
</div>

<style>
  .identity { padding: 18px 16px 4px; }
  .id-name { font-size: 21px; font-weight: 700; color: #222; }
  .admin-badge {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: var(--teal-dark);
    border-radius: 3px;
    padding: 1px 5px;
    vertical-align: 3px;
  }
  .id-email { font-size: 15px; color: #888; margin-top: 2px; }
  .ok-msg { color: #2e7d32; text-align: center; margin: 12px 16px 0; font-size: 15.5px; }
  .err-msg { color: #c62828; text-align: center; margin: 12px 16px 0; font-size: 15.5px; }
  .stat-list { background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    border-bottom: 1px solid #eee;
    font-size: 16px;
  }
  .stat-row:last-child { border-bottom: 0; }
  .stat-row span { color: #555; }
  .stat-row b { color: #222; font-weight: 600; text-align: right; }
  .stat-row b.names { font-weight: 500; }
  .manage { padding: 4px 16px 26px; display: flex; flex-direction: column; gap: 14px; }
  .manage-form label { display: block; font-size: 15px; color: #555; margin-bottom: 6px; }
  .plan-grid { display: flex; gap: 8px; margin-bottom: 8px; }
  .plan-input {
    flex: 1;
    font-size: 16px;
    padding: 10px 8px;
    border: 1px solid #bbb;
    border-radius: 4px;
    background: #fff;
    font-family: inherit;
    min-width: 0;
  }
  .plan-hint { font-size: 13.5px; color: #888; margin: 2px 0 0; }
  .pw-row { display: flex; gap: 8px; }
  .pw-row input {
    flex: 1;
    font-size: 16px;
    padding: 10px 8px;
    border: 1px solid #bbb;
    border-radius: 4px;
    background: #fff;
    font-family: inherit;
    min-width: 0;
  }
  .btn {
    padding: 10px 18px;
    background: var(--teal);
    color: #fff;
    border: 0;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .btn.wide { width: 100%; background: #fff; color: var(--teal-dark); border: 1px solid var(--teal-dark); }
  .btn.danger { background: #fff; color: #c62828; border: 1px solid #c62828; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .id-name { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .stat-list { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .stat-row b { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .btn.wide, :global(.phone[data-theme="dark"]) .btn.danger { background: #1d2025; }
</style>
