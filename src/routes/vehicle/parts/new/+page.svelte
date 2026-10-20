<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  // The vehicle is the one selected on the dashboard, shown
  // read-only here.
  let { data, form } = $props();

  const rows: { label: string; id: string; placeholder?: string; type?: string }[] = [
    { label: 'Type', id: 'type' },
    { label: 'Brand', id: 'brand' },
    { label: 'Size', id: 'size' },
    { label: 'Volume', id: 'volume', placeholder: '----------' },
    { label: 'Pressure', id: 'pressure', placeholder: '----------' },
    { label: 'Quantity', id: 'quantity', placeholder: '----------', type: 'number' }
  ];
</script>

<SubHeader title={data.part ? 'Edit Vehicle Part' : 'New Vehicle Part'} save formId="part-form" backHref="/vehicle" />

{#if form?.error}
  <p class="form-error">{form.error}</p>
{/if}

<form id="part-form" class="record-form" method="POST">
  {#if data.part}<input type="hidden" name="partId" value={data.part.id} />{/if}
  <div class="form-row">
    <label for="name">Name</label>
    <div class="field"><input id="name" name="name" type="text" placeholder="Required" required value={data.part?.name ?? ''} /></div>
  </div>

  <div class="form-row">
    <label for="partno">Part #</label>
    <div class="field"><input id="partno" name="partno" type="text" value={data.part?.partNumber ?? ''} /></div>
  </div>

  <div class="form-row">
    <label>Vehicle</label>
    <div class="field"><div class="readonly-line"><b>{data.vehicleName}</b></div></div>
  </div>

  {#each rows as r}
    <div class="form-row">
      <label for={r.id}>{r.label}</label>
      <div class="field"><input id={r.id} name={r.id} type={r.type ?? 'text'} step="any" placeholder={r.placeholder ?? ''} value={data.part?.[r.id as keyof typeof data.part] ?? ''} /></div>
    </div>
  {/each}

  <div class="form-section">Notes</div>
  <div class="part-notes">
    <textarea name="notes" rows="3" aria-label="Notes">{data.part?.notes ?? ''}</textarea>
  </div>
</form>

{#if data.part}
  <form
    method="POST"
    action="/vehicle/parts/{data.part.id}/delete"
    class="delete-record-form"
    onsubmit={(e) => {
      if (!confirm('Delete this part? This cannot be undone.')) e.preventDefault();
    }}
  >
    <button type="submit" class="delete-record-btn">Delete Part</button>
  </form>
{/if}

<style>
  .form-error { color: #c62828; text-align: center; margin: 12px 16px 0; font-size: 15.5px; }
  .delete-record-form { padding: 22px 16px 30px; }
  .delete-record-btn {
    display: block;
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
  .part-notes textarea {
    width: 100%;
    border: 0;
    border-bottom: 1px solid #bbb;
    background: transparent;
    font-size: 16.5px;
    font-family: inherit;
    color: var(--ink);
    resize: vertical;
    padding: 5px 2px 6px;
  }
  .part-notes textarea:focus { outline: none; border-bottom: 2px solid var(--teal); }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .delete-record-btn { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .part-notes textarea { border-bottom-color: #4a4f57; }
</style>
