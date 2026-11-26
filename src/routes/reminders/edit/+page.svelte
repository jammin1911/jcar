<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();
  const v = form?.values ?? data.values;
</script>

<SubHeader title={data.editing ? 'Edit Reminder' : 'Add Reminder'} save formId="reminder-form" backHref="/reminders" />

<form id="reminder-form" class="record-form" method="POST" action="?/save">
  {#if data.editing}<input type="hidden" name="id" value={data.editing.id} />{/if}
  <div class="form-row">
    <label for="title">Service</label>
    <div class="field">
      <input id="title" name="title" type="text" list="reminder-titles" value={v.title} autocomplete="off" />
      <datalist id="reminder-titles">
        {#each data.suggestions as s}
          <option value={s}></option>
        {/each}
      </datalist>
    </div>
  </div>
  <div class="form-row">
    <label>Vehicle</label>
    <div class="field"><span class="readonly-value">{data.vehicle.name}</span></div>
  </div>
  {#if !data.vehicle.costTracking}
    <div class="form-row">
      <label for="distanceInterval">Distance Interval</label>
      <div class="field">
        <input id="distanceInterval" name="distanceInterval" type="text" inputmode="decimal" value={v.distanceInterval} autocomplete="off" />
        <span class="unit">{data.distanceUnit}</span>
      </div>
    </div>
    <div class="form-row">
      <label for="distanceDue">Distance Due</label>
      <div class="field">
        <input id="distanceDue" name="distanceDue" type="text" inputmode="decimal" value={v.distanceDue} autocomplete="off" />
        <span class="unit">{data.distanceUnit}</span>
      </div>
    </div>
  {/if}
  <div class="form-row">
    <label for="timeInterval">Time Interval</label>
    <div class="field">
      <input id="timeInterval" name="timeInterval" type="number" min="1" max="600" step="1" value={v.timeInterval} autocomplete="off" />
      <span class="unit">months</span>
    </div>
  </div>
  <div class="form-row">
    <label for="timeDue">Time Due</label>
    <div class="field">
      <input id="timeDue" name="timeDue" type="date" value={v.timeDue} />
    </div>
  </div>
  <div class="form-row">
    <label for="notes">Notes</label>
    <div class="field">
      <textarea id="notes" name="notes" rows="2">{v.notes}</textarea>
    </div>
  </div>
  <p class="form-hint">Leave a due field empty to start counting from the vehicle's current odometer or today's date. A reminder with an interval repeats, one without fires once.</p>
  {#if form?.error}
    <p class="form-error">{form.error}</p>
  {/if}
</form>

{#if data.editing}
  <form method="POST" action="?/done" class="done-form">
    <input type="hidden" name="id" value={data.editing.id} />
    <button type="submit" class="done-btn">Mark Done</button>
  </form>
  <form
    method="POST"
    action="?/delete"
    class="delete-form"
    onsubmit={(e) => {
      if (!confirm('Delete this reminder?')) e.preventDefault();
    }}
  >
    <input type="hidden" name="id" value={data.editing.id} />
    <button type="submit" class="delete-btn">Delete Reminder</button>
  </form>
{/if}

<style>
  .readonly-value { font-size: 16.5px; color: #333; padding: 7px 0; display: inline-block; }
  .unit { color: #888; font-size: 14.5px; margin-left: 6px; }
  .form-hint { color: #888; font-size: 14px; line-height: 1.5; margin: 14px 0 0; }
  .form-error { color: #c62828; font-size: 15px; font-weight: 600; margin: 14px 0 0; }
  .done-form, .delete-form { padding: 0 16px; }
  .done-form { margin-top: 4px; }
  .delete-form { margin-top: 12px; padding-bottom: 30px; }
  .done-btn, .delete-btn {
    display: block; width: 100%; padding: 13px 16px; border-radius: 6px; cursor: pointer;
    font-size: 16.5px; font-weight: 700; font-family: inherit;
  }
  .done-btn { background: var(--teal); color: #fff; border: 0; }
  .delete-btn { background: #fff; color: #c62828; border: 1.5px solid #c62828; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .readonly-value { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .delete-btn { background: #1d2025; }
</style>
