<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();

  // Each import button IS the file picker: the styled label opens the
  // file dialog natively, and picking a file submits the form to the
  // scan action, which validates the file and returns a summary for
  // confirmation. Nothing is imported at scan time.
  function pickAndSubmit(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) input.form?.requestSubmit();
  }

  const importKinds = [
    { kind: 'jcar', label: 'Import jCar Backup', sub: 'Restore a backup made by jCar (.json)', accept: '.json,application/json', selected: false },
    { kind: 'abp', label: 'Import aCar Backup', sub: 'Vehicles and all records from an aCar backup (.abp)', accept: '.abp', selected: false },
    { kind: 'fuelio', label: 'Import Fuelio Backup', sub: 'Fuelio backup CSV - vehicle, fuel log and costs', accept: '.csv,text/csv', selected: false },
    { kind: 'fuelly', label: 'Import Fuelly CSV', sub: 'Fuel-ups from a Fuelly CSV export', accept: '.csv,text/csv', selected: true },
    { kind: 'simplyauto', label: 'Import Simply Auto', sub: 'The Fuel_Log.csv from a Simply Auto (Fuel Buddy) backup', accept: '.csv,text/csv', selected: true },
    { kind: 'drivvo', label: 'Import Drivvo', sub: 'Drivvo CSV export - vehicle, refuelling, services and expenses', accept: '.csv,text/csv', selected: false },
    { kind: 'spritmonitor', label: 'Import Spritmonitor', sub: 'Spritmonitor.de fuelings or costs CSV', accept: '.csv,text/csv', selected: true },
    { kind: 'generic', label: 'Import Generic CSV', sub: 'Columns matched by name - LubeLogger, Gas Cubby, Road Trip and similar exports', accept: '.csv,text/csv', selected: true },
    { kind: 'motostat', label: 'Import Motostat', sub: 'Motostat.pl CSV export', accept: '.csv,text/csv', selected: true },
    { kind: 'fuellog', label: 'Import Fuel Log', sub: 'Fuel Log app backup CSV - all vehicles', accept: '.csv,text/csv', selected: false }
  ];
</script>

<SubHeader title="Import/Export" />

<div class="stat-head">Export</div>
<div class="ie-block">
  {#if data.upgrade}
    <p class="ie-upgrade">Data export is not included in the Free plan. Upgrade to a Paid account to export your records and download backups.</p>
  {/if}
  <p>Take your records out of jCar - both exports cover all of your vehicles:</p>
  <a class="ie-btn" href="/import-export/export.csv">Export Records (CSV)</a>
  <a class="ie-btn" href="/import-export/backup.json">Export Backup</a>
</div>

<div class="stat-head">Import</div>
<div class="ie-block">
  <p>Bring your existing records into jCar. Tap an import type and choose the file - it is checked first, and nothing is imported until you confirm the summary.</p>

  {#if form?.done}<p class="ie-msg ok ie-topmsg">{form.done}</p>{/if}
  {#if form?.scanError}<p class="ie-msg err ie-topmsg">{form.scanError}</p>{/if}

  {#if form?.scan}
    <div class="ie-choice">
      <p class="ie-choice-title">{form.scan.kindLabel} - ready to import</p>
      <p class="ie-scan-file">{form.scan.fileName}</p>
      <p>
        Found <b>{form.scan.totalRecords} record{form.scan.totalRecords === 1 ? '' : 's'}</b>
        ({form.scan.counts.fuel} fuel-up{form.scan.counts.fuel === 1 ? '' : 's'},
        {form.scan.counts.service} service{form.scan.counts.service === 1 ? '' : 's'},
        {form.scan.counts.expense} expense{form.scan.counts.expense === 1 ? '' : 's'}{#if form.scan.counts.note},
        {form.scan.counts.note} note{form.scan.counts.note === 1 ? '' : 's'}{/if}).
        {#if form.scan.mostRecent}Most recent record: <b>{form.scan.mostRecent}</b>.{/if}
        {#if form.scan.skippedRows}{form.scan.skippedRows} row{form.scan.skippedRows === 1 ? '' : 's'} could not be read and will be skipped.{/if}
      </p>
      {#if form.scan.targetName}
        <p>Records will be added to: <b>{form.scan.targetName}</b></p>
      {:else}
        <p>Vehicles in this file: <b>{form.scan.vehicleNames.join(', ')}</b></p>
      {/if}
      {#if form.scan.note}<p class="ie-scan-note">{form.scan.note}</p>{/if}
      {#if form.scan.limitWarning}<p class="ie-msg err">{form.scan.limitWarning}</p>{/if}
      {#if form.scan.abpMatched > 0}
        <p>
          Heads up: {form.scan.abpMatched} of the vehicles in this backup match vehicles already in
          your account, and {form.scan.abpDuplicates} of its records are already in them.
        </p>
        <form method="POST" action="?/execute" class="ie-choice-form">
          <input type="hidden" name="token" value={form.scan.token} />
          <button type="submit" name="mode" value="merge" class="ie-btn ie-choice-btn">Merge - only add what's new, skip the duplicates</button>
          <button type="submit" name="mode" value="fresh" class="ie-btn ie-choice-btn">Import everything anyway (creates duplicates)</button>
        </form>
      {:else}
        <form method="POST" action="?/execute" class="ie-choice-form">
          <input type="hidden" name="token" value={form.scan.token} />
          <button type="submit" name="mode" value="fresh" class="ie-btn ie-choice-btn">Import Now</button>
        </form>
      {/if}
      <form method="POST" action="?/cancelImport" class="ie-choice-form">
        <input type="hidden" name="token" value={form.scan.token} />
        <button type="submit" class="ie-btn ie-choice-btn ie-cancel">Cancel</button>
      </form>
    </div>
  {/if}

  {#each importKinds as k}
    <form method="POST" action="?/scan" enctype="multipart/form-data" class="ie-form">
      <input type="hidden" name="kind" value={k.kind} />
      <label class="ie-btn ie-pick">
        <span class="ie-pick-label">{k.label}</span>
        <span class="ie-pick-sub">{k.sub}{#if k.selected && data.vehicleName} - into {data.vehicleName}{/if}</span>
        <input type="file" name="file" accept={k.accept} class="ie-file-hidden" onchange={pickAndSubmit} />
      </label>
    </form>
  {/each}
  {#if !data.vehicleName}
    <p class="ie-note">Imports marked "into ..." need a vehicle: add one first, and their records will go into it.</p>
  {/if}
</div>

<style>
  .ie-block { padding: 4px 16px 10px; }
  .ie-block p { margin: 6px 0 10px; color: #444; font-size: 15.5px; }
  .ie-form { margin: 0 0 10px; }
  .ie-btn {
    display: block;
    width: 100%;
    margin: 0 0 10px;
    padding: 12px;
    background: var(--teal, #4d9deb);
    color: #fff;
    border: 0;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    font-family: inherit;
    box-sizing: border-box;
  }
  .ie-form .ie-btn { margin-bottom: 0; }
  .ie-pick { display: flex; flex-direction: column; gap: 2px; align-items: center; }
  .ie-pick-sub { font-size: 13px; font-weight: 400; opacity: 0.85; line-height: 1.35; }
  .ie-file-hidden { display: none; }
  .ie-note { font-size: 14px; }
  .ie-msg { font-size: 14.5px; margin: 4px 0 0; }
  .ie-topmsg { margin: 0 0 12px; font-size: 15.5px; }
  .ie-upgrade {
    background: #e3f0fb;
    border: 1px solid var(--teal);
    color: var(--teal-dark);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 10px;
  }
  .ie-choice {
    border: 1.5px solid var(--teal);
    border-radius: 8px;
    padding: 12px 14px;
    margin: 0 0 18px;
  }
  .ie-choice-title { font-weight: 700; font-size: 16.5px; margin: 0 0 2px; }
  .ie-scan-file { font-size: 13.5px; color: #777; margin: 0 0 8px; word-break: break-all; }
  .ie-scan-note { font-size: 14px; font-style: italic; }
  .ie-choice-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .ie-choice-btn { width: 100%; text-align: center; margin-bottom: 0; }
  .ie-cancel { background: #eceff1; color: #37474f; }
  .ie-msg.ok { color: #2e7d32; }
  .ie-msg.err { color: #c62828; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .ie-block p { color: #c9ccd1; }
  :global(.phone[data-theme="dark"]) .ie-upgrade { background: #1d2f47; color: #a9c8f2; }
  :global(.phone[data-theme="dark"]) .ie-msg.err { color: #ef5350; }
  :global(.phone[data-theme="dark"]) .ie-msg.ok { color: #66bb6a; }
  :global(.phone[data-theme="dark"]) .ie-cancel { background: #2a2e34; color: var(--ink); }
  :global(.phone[data-theme="dark"]) .ie-scan-file { color: #9aa0a8; }
</style>
