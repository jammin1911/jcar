<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { plusCircleIcon } from '$lib/icons';
  import { groupOdometerInput } from '$lib/odometer';

  // Fields: date/time, odometer, the note text, and photos. Nothing
  // else.
  let { data, form } = $props();

  // Photo attach row: picked but unsaved photos join the row as
  // squares, and picking more accumulates, the input's FileList gets
  // rebuilt from state.
  const MAX_PHOTOS = 10;
  const existingPhotos = data.editing?.photos ?? [];
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
    const room = Math.max(0, MAX_PHOTOS - existingPhotos.length - pending.length);
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
</script>

<SubHeader title={data.editing ? 'Edit Note' : 'New Note'} save formId="note-form" />

{#if form?.error}
  <p class="form-banner-error">{form.error}</p>
{/if}

<form id="note-form" class="record-form" method="POST" enctype="multipart/form-data">
  <div class="form-row">
    <label for="dt">Date/Time</label>
    <div class="field"><input id="dt" name="datetime" type="datetime-local" value={form?.values?.datetime ?? data.editing?.values.datetime ?? data.defaultDateTime} /></div>
  </div>

  {#if data.editing?.recordedBy}
    <div class="form-row">
      <label>Recorded by</label>
      <div class="field"><div class="readonly-line">{data.editing.recordedBy}</div></div>
    </div>
  {/if}

  {#if !data.costTracking}
    <div class="form-row">
      <label for="odo">Odometer</label>
      <div class="field"><input id="odo" name="odometer" type="text" inputmode="decimal" placeholder="----------" value={form?.values?.odometer ?? data.editing?.values.odometer ?? ''} oninput={groupOdometerInput} /></div>
    </div>
  {/if}

  <div class="form-row notes-row">
    <label for="note">Note</label>
    <div class="field"><textarea id="note" name="notes" rows="4" placeholder="----------">{form?.values?.notes ?? data.editing?.values.notes ?? ''}</textarea></div>
  </div>

  <div class="form-section">Photos</div>
  <div class="attach-row">
    {#each existingPhotos as p}
      <div class="photo-thumb">
        <a href="/photos/{p.id}" target="_blank" rel="noopener">
          <img src="/photos/{p.id}" alt="Record photo" loading="lazy" />
        </a>
        <form
          method="POST"
          action="/photos/{p.id}/delete?back={encodeURIComponent(`/notes/new?edit=${data.editing?.id}`)}"
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
    {#if existingPhotos.length + pending.length < MAX_PHOTOS}
      <label class="attach-square" aria-label="Add photo">
        {@html plusCircleIcon}
        <input bind:this={photoInput} type="file" name="photos" accept="image/*" multiple hidden onchange={onPickPhotos} />
      </label>
    {/if}
  </div>
  <p class="photo-hint">Up to 10 photos per record. Photos are resized and compressed automatically when saved.</p>
</form>

{#if data.editing}
  <form
    method="POST"
    action="/records/{data.editing.id}/delete"
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
