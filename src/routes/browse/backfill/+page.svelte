<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();

  const values = form?.values ?? data.defaults;
  let freq = $state(values.freq);
  let mode = $state(values.mode || 'time');

  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const ord = (n: number) =>
    n === 1 || n === 21 || n === 31 ? `${n}st` : n === 2 || n === 22 ? `${n}nd` : n === 3 || n === 23 ? `${n}rd` : `${n}th`;

  const cancelHref = `/browse/backfill?vehicle=${data.vehicleId}&${new URLSearchParams(values).toString()}`;
</script>

<SubHeader title="Backfill Records" backHref="/browse" />

<form method="GET" class="veh-form">
  <label class="fld">
    <span>Vehicle</span>
    <select
      name="vehicle"
      value={data.vehicleId}
      onchange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {#each data.vehicles as v}
        <option value={v.id}>{v.name}</option>
      {/each}
    </select>
  </label>
  <noscript><button type="submit" class="btn">Apply</button></noscript>
</form>

{#if form?.error}
  <p class="err">{form.error}</p>
{/if}

<form method="POST" action="?/preview" class="bf-form">
  <input type="hidden" name="vehicleId" value={data.vehicleId} />

  <label class="fld">
    <span>Type</span>
    <select name="type" value={values.type}>
      <option value="expense">Expense</option>
      <option value="service">Service</option>
    </select>
  </label>

  <label class="fld">
    <span>Title</span>
    <input type="text" name="title" value={values.title} list="bf-titles" placeholder="Insurance" />
    <datalist id="bf-titles">
      {#each data.titles as t}
        <option value={t}></option>
      {/each}
    </datalist>
  </label>

  <label class="fld">
    <span>Amount (each)</span>
    <input type="number" name="totalCost" value={values.totalCost} step="0.01" min="0" inputmode="decimal" placeholder="142.00" />
  </label>

  <label class="fld">
    <span>Notes (optional)</span>
    <input type="text" name="notes" value={values.notes} />
  </label>

  <label class="fld">
    <span>Location (optional)</span>
    <select name="locationId" value={values.locationId}>
      <option value="">None</option>
      {#each data.locations as l}
        <option value={String(l.id)}>{l.label}</option>
      {/each}
    </select>
  </label>

  <div class="sect">Repeats</div>

  <label class="fld">
    <span>Repeat by</span>
    <select name="mode" bind:value={mode}>
      <option value="time">Time</option>
      <option value="distance">Odometer</option>
    </select>
  </label>

  {#if mode === 'time'}
  <label class="fld">
    <span>Frequency</span>
    <select name="freq" bind:value={freq}>
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
  </label>

  <label class="fld">
    <span>Every</span>
    <input type="number" name="every" value={values.every} min="1" max="52" step="1" />
  </label>

  {#if freq === 'weekly'}
    <label class="fld">
      <span>Day of week</span>
      <select name="dayOfWeek" value={values.dayOfWeek}>
        {#each weekdays as d, i}
          <option value={String(i)}>{d}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if freq === 'monthly'}
    <label class="fld">
      <span>Day of month</span>
      <select name="dayOfMonth" value={values.dayOfMonth}>
        {#each Array.from({ length: 31 }, (_, i) => i + 1) as d}
          <option value={String(d)}>{ord(d)}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if freq === 'yearly'}
    <label class="fld">
      <span>Month</span>
      <select name="month" value={values.month}>
        {#each months as m, i}
          <option value={String(i + 1)}>{m}</option>
        {/each}
      </select>
    </label>
    <label class="fld">
      <span>Day of month</span>
      <select name="dayOfMonth" value={values.dayOfMonth}>
        {#each Array.from({ length: 31 }, (_, i) => i + 1) as d}
          <option value={String(d)}>{ord(d)}</option>
        {/each}
      </select>
    </label>
  {/if}
  {#if freq === 'daily'}
    <input type="hidden" name="dayOfWeek" value={values.dayOfWeek} />
    <input type="hidden" name="dayOfMonth" value={values.dayOfMonth} />
    <input type="hidden" name="month" value={values.month} />
  {/if}
  {#if freq === 'weekly'}
    <input type="hidden" name="dayOfMonth" value={values.dayOfMonth} />
    <input type="hidden" name="month" value={values.month} />
  {/if}
  {#if freq === 'monthly'}
    <input type="hidden" name="dayOfWeek" value={values.dayOfWeek} />
    <input type="hidden" name="month" value={values.month} />
  {/if}
  {#if freq === 'yearly'}
    <input type="hidden" name="dayOfWeek" value={values.dayOfWeek} />
  {/if}
  <input type="hidden" name="interval" value={values.interval} />
  <input type="hidden" name="startOdometer" value={values.startOdometer} />
  {/if}

  {#if mode === 'distance'}
    <label class="fld">
      <span>Interval ({data.distUnit})</span>
      <input type="number" name="interval" value={values.interval} min="1" step="any" inputmode="decimal" placeholder="8000" />
    </label>
    <label class="fld">
      <span>Starting odometer ({data.distUnit})</span>
      <input type="number" name="startOdometer" value={values.startOdometer || data.purchasedOdometerDisplay} min="0" step="any" inputmode="decimal" />
    </label>
    {#if data.costTracking}
      <p class="note">This vehicle is cost tracking only, so it has no odometer history to backfill against.</p>
    {/if}
    <input type="hidden" name="freq" value={values.freq} />
    <input type="hidden" name="every" value={values.every} />
    <input type="hidden" name="dayOfWeek" value={values.dayOfWeek} />
    <input type="hidden" name="dayOfMonth" value={values.dayOfMonth} />
    <input type="hidden" name="month" value={values.month} />
  {/if}

  <div class="sect">How far back</div>

  <label class="fld">
    <span>End date (most recent)</span>
    <input type="date" name="end" value={values.end} />
  </label>

  {#if mode === 'time'}
  <label class="range-row">
    <input type="radio" name="range" value="count" checked={values.range === 'count'} />
    <span>Number of payments</span>
    <input type="number" name="count" value={values.count} min="1" max="1000" step="1" class="range-num" />
  </label>

  <label class="range-row">
    <input type="radio" name="range" value="date" checked={values.range === 'date'} />
    <span>Start date</span>
    <input type="date" name="until" value={values.until} class="range-date" />
  </label>

  <label class="range-row">
    <input type="radio" name="range" value="purchase" checked={values.range === 'purchase'} disabled={!data.purchasedDate} />
    <span>
      Purchase date
      {#if data.purchasedDate}
        <small>({data.purchasedLabel})</small>
      {:else}
        <small>(no purchase date set for {data.vehicleName})</small>
      {/if}
    </span>
  </label>
  {:else}
    <label class="fld">
      <span>Start date</span>
      <input type="date" name="until" value={values.until || data.purchasedDate} />
    </label>
    <input type="hidden" name="range" value="date" />
  {/if}

  <button type="submit" class="btn primary">Continue</button>
</form>

{#if form?.preview}
  <div class="overlay">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Confirm backfill">
      <p class="dlg-title">Create {form.preview.count} {form.preview.typeLabel} records?</p>
      <p class="dlg-line">
        {form.preview.title} at {form.preview.each} each, on {form.preview.vehicleName}.
      </p>
      <p class="dlg-line">{form.preview.first} to {form.preview.last}</p>
      {#if form.preview.lines.length}
        <ul class="dlg-slots">
          {#each form.preview.lines as l}
            <li>{l}</li>
          {/each}
        </ul>
        {#if form.preview.moreCount}
          <p class="dlg-line">... and {form.preview.moreCount} more</p>
        {/if}
      {/if}
      <p class="dlg-total">Total added: {form.preview.total}</p>
      <form method="POST" action="?/create">
        {#each Object.entries(values) as [k, v]}
          <input type="hidden" name={k} value={v} />
        {/each}
        <input type="hidden" name="vehicleId" value={data.vehicleId} />
        <div class="dlg-btns">
          <a class="btn" href={cancelHref}>Cancel</a>
          <button type="submit" class="btn primary">Create {form.preview.count} Records</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .veh-form { padding: 14px 16px 0; }
  .bf-form { padding: 4px 16px 24px; display: flex; flex-direction: column; gap: 12px; }
  .fld { display: flex; flex-direction: column; gap: 5px; font-weight: 600; font-size: 14.5px; }
  .fld span { color: var(--ink); }
  .fld input, .fld select {
    font: inherit; font-weight: 400; padding: 10px 12px;
    border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--ink);
  }
  :global(.phone[data-theme='dark']) .fld input,
  :global(.phone[data-theme='dark']) .fld select { background: #1d2025; }
  .sect { font-weight: 800; font-size: 15.5px; margin-top: 8px; color: var(--ink); }
  .range-row { display: flex; align-items: center; gap: 9px; font-size: 14.5px; font-weight: 600; }
  .range-row small { display: block; font-weight: 400; color: var(--grey); }
  .range-num { width: 92px; margin-left: auto; font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; }
  .range-date { margin-left: auto; font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; }
  .err {
    margin: 14px 16px 0; padding: 10px 12px; border-radius: 9px;
    background: #fdecea; color: #a1211a; font-weight: 600; font-size: 14.5px;
  }
  .btn {
    display: inline-block; text-align: center; text-decoration: none; cursor: pointer;
    font: inherit; font-weight: 700; padding: 11px 18px; border-radius: 10px;
    border: 1px solid var(--line); background: #fff; color: var(--ink);
  }
  .btn.primary { background: var(--teal); border-color: var(--teal); color: #fff; }
  .bf-form .btn.primary { margin-top: 6px; }
  .overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60;
  }
  .dialog {
    background: var(--bg); color: var(--ink); border-radius: 14px; padding: 20px;
    max-width: 400px; width: 100%; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
  .dlg-title { font-size: 18px; font-weight: 800; margin: 0 0 8px; }
  .dlg-line { margin: 0 0 6px; font-size: 15px; }
  .dlg-slots { margin: 2px 0 8px; padding-left: 20px; font-size: 15px; }
  .dlg-slots li { margin-bottom: 2px; }
  .note { margin: 0; font-size: 14px; color: var(--grey); }
  .dlg-total { margin: 10px 0 16px; font-size: 16px; font-weight: 800; }
  .dlg-btns { display: flex; gap: 10px; justify-content: flex-end; }
</style>
