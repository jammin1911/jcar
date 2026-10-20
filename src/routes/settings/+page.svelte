<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  // Date/time format, units, and fuel efficiency, plus Manage
  // Locations. Everything here saves per user.
  let { data, form } = $props();
  const s = data.settings;
</script>

<SubHeader title="Settings" save formId="settings-form" />

<form id="settings-form" class="record-form" method="POST">
  <div class="form-section">Appearance</div>
  <div class="form-row">
    <label for="theme">Theme</label>
    <div class="field">
      <select id="theme" name="theme">
        <option value="light" selected={s.theme !== 'dark'}>Light</option>
        <option value="dark" selected={s.theme === 'dark'}>Dark</option>
      </select>
    </div>
  </div>

  <div class="form-section">Date/Time</div>
  <div class="form-row">
    <label for="dtfmt">Date/Time Format</label>
    <div class="field">
      <select id="dtfmt" name="dateFormat">
        <option value="mdy" selected={s.dateFormat === 'mdy'}>Oct 14, 2026 - 09:50 a.m.</option>
        <option value="iso" selected={s.dateFormat === 'iso'}>2026-10-14 09:50</option>
        <option value="dmy" selected={s.dateFormat === 'dmy'}>14 Oct 2026 - 09:50</option>
      </select>
    </div>
  </div>

  <div class="form-section">Units</div>
  <div class="form-row">
    <label for="dist-unit">Distance</label>
    <div class="field">
      <select id="dist-unit" name="distanceUnit">
        <option selected={s.distanceUnit === 'Kilometers'}>Kilometers</option>
        <option selected={s.distanceUnit === 'Miles'}>Miles</option>
      </select>
    </div>
  </div>
  <div class="form-row">
    <label for="vol-unit">Volume</label>
    <div class="field">
      <select id="vol-unit" name="volumeUnit">
        <option selected={s.volumeUnit === 'Liters'}>Liters</option>
        <option selected={s.volumeUnit === 'Gallons'}>Gallons</option>
      </select>
    </div>
  </div>

  <div class="form-section">Fuel Efficiency</div>
  <div class="form-row">
    <label for="fe-unit">Efficiency Unit</label>
    <div class="field">
      <select id="fe-unit" name="efficiencyUnit">
        <option selected={s.efficiencyUnit === 'L/100km'}>L/100km</option>
        <option selected={s.efficiencyUnit === 'MPG (US)'}>MPG (US)</option>
      </select>
    </div>
  </div>

  <div class="form-section">Locations</div>
  <a class="manage-link" href="/locations">Manage Locations<span class="chev">&#8250;</span></a>
  <a class="manage-link" href="/vehicles">Manage Vehicles<span class="chev">&#8250;</span></a>

  {#if form?.saved}
    <p class="saved-note">Settings saved.</p>
  {/if}
</form>

<div class="account-block">
  <p class="account-line">Signed in as <b>{data.displayName}</b><br /><span class="account-email">{data.username}</span></p>
  <form method="POST" action="/logout">
    <button type="submit" class="signout-btn">Sign Out</button>
  </form>
</div>

<style>
  .manage-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 4px;
    font-size: 16.5px;
    color: var(--ink);
    text-decoration: none;
  }
  .manage-link .chev { color: #999; font-size: 22px; line-height: 1; }
  .saved-note { color: #2e7d32; font-size: 15px; margin: 14px 0 0; }
  .account-block { padding: 6px 16px 30px; text-align: center; }
  .account-line { color: #666; font-size: 15.5px; margin: 0 0 10px; line-height: 1.5; }
  .account-email { font-size: 14px; color: #999; }
  .signout-btn {
    background: none;
    border: 1px solid #bbb;
    border-radius: 4px;
    padding: 9px 22px;
    font-size: 15.5px;
    color: #444;
    cursor: pointer;
    font-family: inherit;
  }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .account-line { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .saved-note { color: #66bb6a; }
  :global(.phone[data-theme="dark"]) .signout-btn { color: #c9ccd1; border-color: #4a4f57; }
</style>
