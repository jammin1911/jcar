<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { page } from '$app/state';
  import { plusCircleIcon, pinIcon } from '$lib/icons';
  import { groupOdometerInput } from '$lib/odometer';

  interface FormValues {
    odometer: string;
    price: string;
    volume: string;
    totalCost: string;
    notes: string;
    partial: boolean;
    missed: boolean;
    datetime: string;
  }

  interface Props {
    title: string;
    kind: 'fuel' | 'service' | 'expense';
    vehicleName: string;
    prevOdometer: string;
    defaultDateTime: string;
    locationId?: number | null;
    locationLabel?: string;
    error?: string;
    /** info banner above the form */
    info?: string;
    /** when set, an AI chip shows beside save */
    aiHref?: string;
    /** prefilled values when editing */
    values?: FormValues | null;
    /** the record being edited, turns on the delete button */
    recordId?: number | null;
    /** photos already on the record being edited */
    photos?: { id: number; bytes: number }[];
    /** cost tracking vehicle, no odometer or partial/missed fields */
    costTracking?: boolean;
    /** who entered the record being edited, shown read-only when set */
    recordedBy?: string;
  }
  let { title, kind, vehicleName, prevOdometer, defaultDateTime, locationId = null, locationLabel = '', error, info, aiHref, values = null, recordId = null, photos = [], costTracking = false, recordedBy = '' }: Props = $props();

  const notesLabel = kind === 'service' ? 'Service Notes' : kind === 'expense' ? 'Expense Notes' : '';
  const pickerFrom = recordId ? `${page.url.pathname}?edit=${recordId}` : page.url.pathname;

  // picked photos join the row as squares and picking more adds up,
  // the input file list gets rebuilt from state with DataTransfer so
  // removed picks never reach the server
  const MAX_PHOTOS = 10;
  let photoInput = $state<HTMLInputElement | null>(null);
  let pending = $state<{ file: File; url: string }[]>([]);
  function syncPhotoInput() {
    if (!photoInput) return;
    const dt = new DataTransfer();
    for (const p of pending) dt.items.add(p.file);
    photoInput.files = dt.files;
  }
  function onPickPhotos() {
    const picked = Array.from(photoInput?.files ?? []);
    const room = Math.max(0, MAX_PHOTOS - photos.length - pending.length);
    for (const f of picked.slice(0, room)) {
      pending = [...pending, { file: f, url: URL.createObjectURL(f) }];
    }
    syncPhotoInput();
  }
  function removePending(i: number) {
    URL.revokeObjectURL(pending[i].url);
    pending = pending.filter((_, j) => j !== i);
    syncPhotoInput();
  }

  // the fuel numbers are live linked: on every keystroke one of
  // price, volume and total is calculated from the other two. the
  // calculated field is the empty one when there is exactly one, and
  // otherwise follows the preference order total, then volume, then
  // price, sticking with the field the calc already owns when it can.
  type FuelField = 'price' | 'volume' | 'total';
  const FUEL_PREF: FuelField[] = ['total', 'volume', 'price'];
  let price = $state(values?.price ?? '');
  let volume = $state(values?.volume ?? '');
  let totalCost = $state(values?.totalCost ?? '');
  // the field whose current value came from the calc, if any. only a
  // machine filled value is ever cleared again by the calc, a value
  // the user typed or a saved one is left alone.
  let fuelMachine = $state<FuelField | null>(null);

  function fuelNum(s: string): number {
    const n = parseFloat(s);
    return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : NaN;
  }
  function fuelFmt(n: number, field: FuelField): string {
    if (field === 'total') return n.toFixed(2);
    return n.toFixed(3).replace(/\.?0+$/, '');
  }
  function fuelSet(field: FuelField, text: string) {
    if (field === 'price') price = text;
    else if (field === 'volume') volume = text;
    else totalCost = text;
  }
  function fuelValue(field: FuelField): string {
    return field === 'price' ? price : field === 'volume' ? volume : totalCost;
  }
  function fuelChoose(edited: FuelField): FuelField | null {
    const others = FUEL_PREF.filter((f) => f !== edited);
    const empty = others.filter((f) => fuelValue(f).trim() === '');
    if (empty.length === 1) return empty[0];
    if (empty.length === 2) return null;
    if (fuelMachine && others.includes(fuelMachine)) return fuelMachine;
    return others[0];
  }
  function onFuelInput(field: FuelField, e: Event) {
    fuelSet(field, (e.currentTarget as HTMLInputElement).value);
    if (fuelMachine === field) fuelMachine = null;
    const d = fuelChoose(field);
    if (!d) return;
    let out: number | null = null;
    if (d === 'total') {
      const p = fuelNum(price), v = fuelNum(volume);
      if (!Number.isNaN(p) && !Number.isNaN(v)) out = p * v;
    } else if (d === 'volume') {
      const p = fuelNum(price), t = fuelNum(totalCost);
      if (!Number.isNaN(p) && !Number.isNaN(t) && p > 0) out = t / p;
    } else {
      const v = fuelNum(volume), t = fuelNum(totalCost);
      if (!Number.isNaN(v) && !Number.isNaN(t) && v > 0) out = t / v;
    }
    if (out !== null) {
      fuelSet(d, fuelFmt(out, d));
      fuelMachine = d;
    } else if (fuelMachine === d) {
      fuelSet(d, '');
      fuelMachine = null;
    }
  }
  // a prefill can land price and volume with no total, fill it in
  if (kind === 'fuel' && totalCost === '') {
    const p = fuelNum(price), v = fuelNum(volume);
    if (!Number.isNaN(p) && !Number.isNaN(v)) {
      totalCost = fuelFmt(p * v, 'total');
      fuelMachine = 'total';
    }
  }
</script>

<SubHeader {title} save formId="record-form" secondaryHref={aiHref} secondaryLabel="AI" />

{#if error}
  <p class="form-banner-error">{error}</p>
{/if}
{#if info}
  <p class="form-banner-info">{info}</p>
{/if}

<form id="record-form" class="record-form" method="POST" enctype="multipart/form-data">
  {#if !costTracking}
    <div class="form-row">
      <label for="odo">Odometer</label>
      <div class="field"><input id="odo" name="odometer" type="text" inputmode="decimal" placeholder="----------" value={values?.odometer ?? ''} oninput={groupOdometerInput} /></div>
    </div>

    <div class="form-row prev-row">
      <label>Previous Odometer:</label>
      <div class="field"><div class="readonly-line"><b>{prevOdometer}</b></div></div>
    </div>
  {/if}

  {#if kind === 'fuel'}
    <div class="form-row">
      <label for="price">Price</label>
      <div class="field"><input id="price" name="price" type="number" step="any" inputmode="decimal" placeholder="----------" value={price} oninput={(e) => onFuelInput('price', e)} /></div>
    </div>
    <div class="form-row">
      <label for="vol">Volume</label>
      <div class="field"><input id="vol" name="volume" type="number" step="any" inputmode="decimal" placeholder="----------" value={volume} oninput={(e) => onFuelInput('volume', e)} /></div>
    </div>
    <div class="form-row">
      <label for="cost">Total Cost</label>
      <div class="field"><input id="cost" name="totalCost" type="number" step="any" inputmode="decimal" placeholder="----------" value={totalCost} oninput={(e) => onFuelInput('total', e)} /></div>
    </div>
    {#if !costTracking}
      <div class="check-row">
        <label for="partial">Partial Fuel-Up?</label>
        <input id="partial" name="partial" type="checkbox" checked={values?.partial ?? false} />
      </div>
      <div class="check-row">
        <label for="missed">Missed Fuel-Ups?</label>
        <input id="missed" name="missed" type="checkbox" checked={values?.missed ?? false} />
      </div>
    {/if}
  {:else}
    <div class="form-row">
      <label for="cost">Total Cost</label>
      <div class="field"><input id="cost" name="totalCost" type="number" step="any" inputmode="decimal" placeholder="----------" value={values?.totalCost ?? ''} /></div>
    </div>
    <div class="form-row notes-row">
      <label for="notes">{notesLabel}</label>
      <div class="field"><textarea id="notes" name="notes" rows="3" placeholder="----------">{values?.notes ?? ''}</textarea></div>
    </div>
  {/if}

  <div class="form-row">
    <label>Vehicle</label>
    <div class="field"><div class="readonly-line"><b>{vehicleName}</b></div></div>
  </div>

  {#if recordedBy}
    <div class="form-row">
      <label>Recorded by</label>
      <div class="field"><div class="readonly-line">{recordedBy}</div></div>
    </div>
  {/if}

  <div class="form-row">
    <label for="dt">Date/Time</label>
    <div class="field"><input id="dt" name="datetime" type="datetime-local" value={values?.datetime ?? defaultDateTime} /></div>
  </div>

  <div class="form-section">Photos</div>
  <div class="attach-row">
    {#each photos as p}
      <div class="photo-thumb">
        <a href="/photos/{p.id}" target="_blank" rel="noopener">
          <img src="/photos/{p.id}" alt="Record photo" loading="lazy" />
        </a>
        <form
          method="POST"
          action="/photos/{p.id}/delete?back={encodeURIComponent(pickerFrom)}"
          class="badge-form"
          onsubmit={(e) => {
            if (!confirm('Delete this photo?')) e.preventDefault();
          }}
        >
          <button type="submit" class="thumb-del" aria-label="Delete photo">✕</button>
        </form>
      </div>
    {/each}
    {#each pending as p, i}
      <div class="photo-thumb">
        <img src={p.url} alt={p.file.name} />
        <button type="button" class="thumb-del badge-btn" onclick={() => removePending(i)} aria-label="Remove photo">✕</button>
      </div>
    {/each}
    {#if photos.length + pending.length < MAX_PHOTOS}
      <label class="attach-square" aria-label="Add photo">
        {@html plusCircleIcon}
        <input bind:this={photoInput} type="file" name="photos" accept="image/*" multiple hidden onchange={onPickPhotos} />
      </label>
    {/if}
  </div>
  <p class="photo-hint">Up to 10 photos per record. Photos are resized and compressed automatically when saved.</p>

  {#if kind !== 'fuel'}
    <div class="form-section">Location:</div>
    <a class="location-row" href="/locations?from={pickerFrom}">
      {@html pinIcon}<span>{locationId ? locationLabel : 'Select a location...'}</span>
    </a>
    <input type="hidden" name="locationId" value={locationId ?? ''} />
  {/if}
</form>

{#if recordId}
  <form
    method="POST"
    action="/records/{recordId}/delete"
    class="delete-record-form"
    onsubmit={(e) => {
      if (!confirm('Delete this record? This cannot be undone.')) e.preventDefault();
    }}
  >
    <button type="submit" class="delete-record-btn">Delete Record</button>
  </form>
{/if}

<style>
  .photo-hint { color: #999; font-size: 13.5px; text-align: center; margin: 6px 16px 0; }
  .delete-record-form { padding: 22px 16px 30px; }
  .delete-record-btn {
    width: 100%;
    padding: 12px;
    background: #fff;
    color: #c62828;
    border: 1.5px solid #c62828;
    border-radius: 4px;
    font-size: 16.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .delete-record-btn { background: #1d2025; }
</style>
