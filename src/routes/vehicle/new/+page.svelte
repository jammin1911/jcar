<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { fmtOdometer, groupOdometerInput } from '$lib/odometer';

  let { data, form } = $props();
  const v = data.vehicle;

  const fields: { label: string; name: string; value: string; example: string }[] = [
    { label: 'Year', name: 'year', value: v?.year ?? '', example: 'e.g. 2022' },
    { label: 'Make', name: 'make', value: v?.make ?? '', example: 'e.g. Honda' },
    { label: 'Model', name: 'model', value: v?.model ?? '', example: 'e.g. Civic' },
    { label: 'Submodel', name: 'submodel', value: v?.submodel ?? '', example: 'e.g. LX' },
    { label: 'Engine', name: 'engine', value: v?.engine ?? '', example: 'e.g. 2.0L L4 GAS' },
    { label: 'Transmission', name: 'transmission', value: v?.transmission ?? '', example: 'e.g. Automatic CVT' },
    { label: 'Drive Type', name: 'driveType', value: v?.driveType ?? '', example: 'e.g. FWD' },
    { label: 'Body Type', name: 'bodyType', value: v?.bodyType ?? '', example: 'e.g. Sedan' }
  ];

  const psFields: { label: string; pName: string; sName: string; pVal: string | number | null; sVal: string | number | null; example: string; date?: boolean; odo?: boolean }[] = [
    { label: 'Odometer', pName: 'pOdometer', sName: 'sOdometer', pVal: v?.purchasedOdometer, sVal: v?.soldOdometer, example: 'e.g. 0', odo: true },
    { label: 'Price', pName: 'pPrice', sName: 'sPrice', pVal: v?.purchasedPrice, sVal: v?.soldPrice, example: 'e.g. 27000' },
    { label: 'Date', pName: 'pDate', sName: 'sDate', pVal: v?.purchasedDate, sVal: v?.soldDate, example: 'e.g. 2022-05-14', date: true },
    { label: 'Notes', pName: 'pNotes', sName: 'sNotes', pVal: v?.purchasedNotes, sVal: v?.soldNotes, example: 'e.g. Bought new from dealer' }
  ];
</script>

<SubHeader title={v ? 'Edit Vehicle' : 'Add Vehicle'} save formId="vehicle-form" backHref={v ? '/vehicle' : '/'} />

{#if form?.error}
  <p class="form-error">{form.error}</p>
{/if}

<form id="vehicle-form" class="record-form" method="POST">
  <div class="form-row">
    <label for="vname">Display Name</label>
    <div class="field"><input id="vname" name="name" type="text" placeholder="e.g. Civic" value={v?.name ?? ''} required /></div>
  </div>
  {#each fields as f}
    <div class="form-row">
      <label for="f-{f.name}">{f.label}</label>
      <div class="field"><input id="f-{f.name}" name={f.name} type="text" value={f.value} placeholder={f.example} /></div>
    </div>
  {/each}

  <div class="form-row">
    <label for="f-distanceUnit">Distance Unit</label>
    <div class="field">
      <select id="f-distanceUnit" name="distanceUnit">
        <option selected={!v || v.distanceUnit === 'Kilometers'}>Kilometers</option>
        <option selected={v?.distanceUnit === 'Miles'}>Miles</option>
      </select>
    </div>
  </div>
  <div class="form-row">
    <label for="f-volumeUnit">Volume Unit</label>
    <div class="field">
      <select id="f-volumeUnit" name="volumeUnit">
        <option selected={!v || v.volumeUnit === 'Liters'}>Liters</option>
        <option selected={v?.volumeUnit === 'Gallons'}>Gallons</option>
      </select>
    </div>
  </div>
  <div class="form-row">
    <label for="f-licensePlate">License Plate</label>
    <div class="field"><input id="f-licensePlate" name="licensePlate" type="text" placeholder="e.g. ABCD 123" value={v?.licensePlate ?? ''} /></div>
  </div>
  <div class="form-row">
    <label for="f-vin">VIN</label>
    <div class="field"><input id="f-vin" name="vin" type="text" placeholder="e.g. 2HGFE2F53NH123456" value={v?.vin ?? ''} /></div>
  </div>
  <div class="form-row">
    <label for="f-tankCapacity">Tank Capacity</label>
    <div class="field"><input id="f-tankCapacity" name="tankCapacity" type="number" step="any" inputmode="decimal" placeholder="e.g. 46.9" value={v?.tankCapacity ?? ''} /></div>
  </div>
  <div class="form-row notes-row">
    <label for="f-notes">Notes</label>
    <div class="field"><textarea id="f-notes" name="notes" rows="2" placeholder="e.g. Winter tires included">{v?.notes ?? ''}</textarea></div>
  </div>

  <div class="cost-track-row">
    <label class="cost-track-label" for="costTracking">
      <input id="costTracking" name="costTracking" type="checkbox" checked={v?.costTracking === 1} />
      <span>
        NOT A VEHICLE - Cost Tracking Only
        <span class="cost-track-sub">e.g. For tracking Jerry Can fuel costs</span>
      </span>
    </label>
  </div>

  <div class="form-section">Purchased</div>
  {#each psFields as f}
    <div class="form-row">
      <label for="p-{f.pName}">{f.label}</label>
      <div class="field"><input id="p-{f.pName}" name={f.pName} type={f.date ? 'date' : 'text'} placeholder={f.example} value={f.odo ? fmtOdometer(f.pVal) : (f.pVal ?? '')} inputmode={f.odo ? 'decimal' : undefined} oninput={f.odo ? groupOdometerInput : undefined} /></div>
    </div>
  {/each}

  <div class="form-section">Sold</div>
  {#each psFields as f}
    <div class="form-row">
      <label for="s-{f.sName}">{f.label}</label>
      <div class="field"><input id="s-{f.sName}" name={f.sName} type={f.date ? 'date' : 'text'} placeholder={f.example} value={f.odo ? fmtOdometer(f.sVal) : (f.sVal ?? '')} inputmode={f.odo ? 'decimal' : undefined} oninput={f.odo ? groupOdometerInput : undefined} /></div>
    </div>
  {/each}
</form>

<style>
  .cost-track-row { padding: 14px 16px 2px; }
  .cost-track-label {
    display: flex; gap: 10px; align-items: flex-start;
    font-size: 16px; font-weight: 700; color: #333; cursor: pointer; line-height: 1.35;
  }
  .cost-track-label input { width: 20px; height: 20px; margin-top: 1px; flex: 0 0 auto; accent-color: var(--teal); }
  .cost-track-sub { display: block; font-size: 13.5px; font-weight: 400; color: #999; margin-top: 2px; }
  .form-error { color: #c62828; text-align: center; margin: 12px 16px 0; font-size: 15.5px; }
  .record-form input::placeholder,
  .record-form textarea::placeholder { color: #b8b8b8; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .cost-track-label { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .record-form textarea::placeholder { color: #6a7076; }
</style>
